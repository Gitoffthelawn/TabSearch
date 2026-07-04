const packageJson = require('./package.json');

module.exports = {
  sourceDir: 'src',
  build: {
    overwriteDest: true,
    filename: `${packageJson.name}-${packageJson.version}.xpi`
  }
};
