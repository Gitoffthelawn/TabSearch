document.addEventListener('DOMContentLoaded', function() {
  var closeBtn = document.getElementById('close-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', function() {
      window.close();
    });
  }
});
