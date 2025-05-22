document.addEventListener('DOMContentLoaded', function() {
  var btn = document.getElementById('close-btn');
  if (btn) {
    btn.addEventListener('click', function() {
      window.close();
    });
  }
});