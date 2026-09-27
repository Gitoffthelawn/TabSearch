const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const dashboardTheme = require('../src/search-results.js');

const POPUP_SOURCE = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'popup.js'),
  'utf8'
);

/**
 * Loads popup.js in an isolated VM context with mocked DOM and WebExtension APIs for theme testing.
 *
 * @param {Object} [initialStorage={}] - Optional initial storage contents for browser.storage.local.
 * @returns {Object} Test harness containing theme functions, DOM attributes, buttons, and event dispatchers.
 */
function loadPopupTheme(initialStorage = {}) {
  const elements = new Map();
  const docAttrs = {};
  const btnAttrs = {};
  const btnChildren = [];
  const storageSetCalls = [];
  const storedData = { ...initialStorage };
  const windowListeners = new Map();
  const documentListeners = new Map();
  let storageListener = null;

  const mockButton = {
    title: '',
    setAttribute(k, v) { btnAttrs[k] = v; },
    get firstChild() { return btnChildren[0] || null; },
    removeChild(node) {
      const idx = btnChildren.indexOf(node);
      if (idx !== -1) btnChildren.splice(idx, 1);
    },
    appendChild(node) { btnChildren.push(node); },
    addEventListener() {},
    removeEventListener() {}
  };
  elements.set('theme-toggle-btn', mockButton);

  const element = (id) => {
    if (!elements.has(id)) {
      elements.set(id, {
        id,
        addEventListener() {},
        removeEventListener() {},
        setAttribute(k, v) { this[k] = v; },
        closest() { return null; },
        classList: {
          add() {},
          remove() {}
        },
        checked: false,
        value: '0.35',
        hidden: false,
        disabled: false,
        textContent: '',
        placeholder: '',
        tabIndex: 0,
        offsetParent: {},
        focus() {},
        select() {}
      });
    }
    return elements.get(id);
  };

  const context = vm.createContext({
    browser: {
      runtime: {
        connect() { return { postMessage() {} }; },
        sendMessage() { return Promise.resolve(); }
      },
      storage: {
        local: {
          get(keys) {
            const result = {};
            const keyList = Array.isArray(keys) ? keys : (typeof keys === 'string' ? [keys] : Object.keys(storedData));
            for (const k of keyList) {
              if (storedData[k] !== undefined) {
                result[k] = storedData[k];
              }
            }
            return Promise.resolve(result);
          },
          set(data) {
            storageSetCalls.push(data);
            Object.assign(storedData, data);
            return Promise.resolve();
          }
        },
        onChanged: {
          addListener(listener) {
            storageListener = listener;
          }
        }
      }
    },
    console: { error() {}, log() {}, warn() {} },
    document: {
      addEventListener(event, handler) {
        if (!documentListeners.has(event)) documentListeners.set(event, []);
        documentListeners.get(event).push(handler);
      },
      documentElement: {
        setAttribute(k, v) { docAttrs[k] = v; }
      },
      getElementById: element,
      body: { appendChild() {} },
      activeElement: null,
      createElementNS(ns, tag) {
        const el = {
          ns,
          tag,
          attributes: {},
          children: [],
          classList: {
            add(cls) { el.className = cls; }
          },
          setAttribute(k, v) { el.attributes[k] = v; },
          appendChild(child) { el.children.push(child); }
        };
        return el;
      }
    },
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
    setTimeout,
    clearTimeout,
    setInterval() { return 1; },
    clearInterval() {},
    window: {
      addEventListener(event, handler) {
        if (!windowListeners.has(event)) windowListeners.set(event, []);
        windowListeners.get(event).push(handler);
      },
      close() {},
      matchMedia() { return { matches: false }; }
    }
  });

  vm.runInContext(POPUP_SOURCE, context, { filename: 'popup.js' });

  return {
    getEffectiveTheme: vm.runInContext('getEffectiveTheme', context),
    applyTheme: vm.runInContext('applyTheme', context),
    toggleTheme: vm.runInContext('toggleTheme', context),
    getStorageListener: () => storageListener,
    dispatchDomContentLoaded: async () => {
      const handlers = [
        ...(windowListeners.get('DOMContentLoaded') || []),
        ...(documentListeners.get('DOMContentLoaded') || [])
      ];
      for (const h of handlers) {
        h();
      }
      await new Promise(resolve => setTimeout(resolve, 0));
    },
    docAttrs,
    btnAttrs,
    btnChildren,
    mockButton,
    storageSetCalls
  };
}

test('getEffectiveTheme - explicit stored preferences override system scheme', () => {
  const popup = loadPopupTheme();
  assert.equal(popup.getEffectiveTheme('dark'), 'dark');
  assert.equal(popup.getEffectiveTheme('light'), 'light');
  assert.equal(dashboardTheme.getEffectiveTheme('dark'), 'dark');
  assert.equal(dashboardTheme.getEffectiveTheme('light'), 'light');
});

test('getEffectiveTheme - falls back to system color scheme when stored preference is unset', () => {
  const popup = loadPopupTheme();
  const originalWindow = global.window;

  // Case 1: System prefers dark
  global.window = {
    matchMedia: (query) => ({
      matches: query === '(prefers-color-scheme: dark)'
    })
  };
  assert.equal(dashboardTheme.getEffectiveTheme(undefined), 'dark');

  // Case 2: System prefers light
  global.window = {
    matchMedia: (query) => ({
      matches: false
    })
  };
  assert.equal(dashboardTheme.getEffectiveTheme(undefined), 'light');

  // Case 3: matchMedia not available
  delete global.window;
  assert.equal(dashboardTheme.getEffectiveTheme(undefined), 'light');

  global.window = originalWindow;
});

test('toggleTheme - inverts theme, applies to DOM, and persists to browser.storage.local', () => {
  const popup = loadPopupTheme();

  function plain(val) {
    return JSON.parse(JSON.stringify(val));
  }

  // Toggle popup from light -> dark
  let onSaveCalledWith = null;
  const newTheme1 = popup.toggleTheme('light', (t) => { onSaveCalledWith = t; });
  assert.equal(newTheme1, 'dark');
  assert.equal(onSaveCalledWith, 'dark');
  assert.equal(popup.docAttrs['data-theme'], 'dark');
  assert.equal(popup.mockButton.title, 'Switch to light theme');
  assert.equal(popup.btnAttrs['aria-label'], 'Switch to light theme');
  assert.deepEqual(plain(popup.storageSetCalls[popup.storageSetCalls.length - 1]), { theme: 'dark' });
  assert.equal(popup.btnChildren.length, 1);
  assert.equal(popup.btnChildren[0].className, 'theme-icon-sun');

  // Toggle dashboardTheme from dark -> light
  const storageSetCalls = [];
  const originalBrowser = global.browser;
  const originalDocument = global.document;

  global.browser = {
    storage: {
      local: {
        set(data) {
          storageSetCalls.push(data);
          return Promise.resolve();
        }
      }
    }
  };
  const docAttrs = {};
  const btnAttrs = {};
  const btnChildren = [];
  const mockButton = {
    title: '',
    setAttribute(k, v) { btnAttrs[k] = v; },
    get firstChild() { return btnChildren[0] || null; },
    removeChild(node) {
      const idx = btnChildren.indexOf(node);
      if (idx !== -1) btnChildren.splice(idx, 1);
    },
    appendChild(node) { btnChildren.push(node); }
  };
  global.document = {
    documentElement: {
      setAttribute(k, v) { docAttrs[k] = v; }
    },
    getElementById(id) {
      if (id === 'theme-toggle-btn') return mockButton;
      return null;
    },
    createElementNS(ns, tag) {
      const el = {
        ns,
        tag,
        attributes: {},
        children: [],
        classList: {
          add(cls) { el.className = cls; }
        },
        setAttribute(k, v) { el.attributes[k] = v; },
        appendChild(child) { el.children.push(child); }
      };
      return el;
    }
  };

  onSaveCalledWith = null;
  const newTheme2 = dashboardTheme.toggleTheme('dark', (t) => { onSaveCalledWith = t; });
  assert.equal(newTheme2, 'light');
  assert.equal(onSaveCalledWith, 'light');
  assert.equal(docAttrs['data-theme'], 'light');
  assert.equal(mockButton.title, 'Switch to dark theme');
  assert.equal(btnAttrs['aria-label'], 'Switch to dark theme');
  assert.deepEqual(storageSetCalls[storageSetCalls.length - 1], { theme: 'light' });
  assert.equal(btnChildren.length, 1);
  assert.equal(btnChildren[0].className, 'theme-icon-moon');

  global.browser = originalBrowser;
  global.document = originalDocument;
});

test('applyTheme - correctly populates sun icon nodes for dark theme and moon for light theme', () => {
  const popup = loadPopupTheme();

  // Apply dark theme: should produce sun icon with 1 circle and 8 ray lines
  popup.applyTheme('dark', popup.mockButton);
  assert.equal(popup.docAttrs['data-theme'], 'dark');
  assert.equal(popup.btnChildren.length, 1);
  const sunSvg = popup.btnChildren[0];
  assert.equal(sunSvg.className, 'theme-icon-sun');
  assert.equal(sunSvg.children.filter(c => c.tag === 'circle').length, 1);
  assert.equal(sunSvg.children.filter(c => c.tag === 'line').length, 8);

  // Apply light theme: should clear children and produce moon icon with 1 path
  popup.applyTheme('light', popup.mockButton);
  assert.equal(popup.docAttrs['data-theme'], 'light');
  assert.equal(popup.btnChildren.length, 1);
  const moonSvg = popup.btnChildren[0];
  assert.equal(moonSvg.className, 'theme-icon-moon');
  assert.equal(moonSvg.children.filter(c => c.tag === 'path').length, 1);
  assert.equal(moonSvg.children[0].attributes.d, 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z');
});

test('storage.onChanged - responds to theme changes and updates DOM state in popup', async () => {
  const popup = loadPopupTheme();

  // Before DOMContentLoaded, storage listener has not yet been registered
  assert.equal(popup.getStorageListener(), null);

  // Trigger DOMContentLoaded to load options and register the storage.onChanged listener
  await popup.dispatchDomContentLoaded();

  const storageListener = popup.getStorageListener();
  assert.equal(typeof storageListener, 'function', 'storage.onChanged listener must be registered on DOMContentLoaded');

  // Exercise storage.onChanged with dark theme
  storageListener({
    theme: {
      oldValue: 'light',
      newValue: 'dark'
    }
  });

  assert.equal(popup.docAttrs['data-theme'], 'dark');
  assert.equal(popup.mockButton.title, 'Switch to light theme');
  assert.equal(popup.btnAttrs['aria-label'], 'Switch to light theme');
  assert.equal(popup.btnChildren.length, 1);
  assert.equal(popup.btnChildren[0].className, 'theme-icon-sun');

  // Exercise storage.onChanged with light theme
  storageListener({
    theme: {
      oldValue: 'dark',
      newValue: 'light'
    }
  });

  assert.equal(popup.docAttrs['data-theme'], 'light');
  assert.equal(popup.mockButton.title, 'Switch to dark theme');
  assert.equal(popup.btnAttrs['aria-label'], 'Switch to dark theme');
  assert.equal(popup.btnChildren.length, 1);
  assert.equal(popup.btnChildren[0].className, 'theme-icon-moon');
});
