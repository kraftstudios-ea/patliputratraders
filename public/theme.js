// ========================================
// BRUSH — Light/Dark theme toggle
// Light is the default for every fresh visit; a visitor's explicit
// choice is remembered (localStorage) so it holds across page loads.
// ========================================
(function () {
  var STORAGE_KEY = 'brush-theme';
  var root = document.documentElement;

  function applyTheme(theme) {
    if (theme === 'dark') {
      root.setAttribute('data-theme', 'dark');
    } else {
      root.removeAttribute('data-theme');
    }
  }

  var stored = null;
  try { stored = localStorage.getItem(STORAGE_KEY); } catch (e) {}
  // Applied synchronously, before first paint, so there's no flash of the wrong theme.
  applyTheme(stored === 'dark' ? 'dark' : 'light');

  function toggleTheme() {
    var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch (e) {}
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('[data-theme-toggle]').forEach(function (btn) {
      btn.addEventListener('click', toggleTheme);
    });
  });

  window.BrushTheme = { toggle: toggleTheme, apply: applyTheme };

  // ========================================
  // BRUSH — Global Page Loader / Preloader
  // Ultra-smooth top progress bar for page navigation,
  // catalog filtering, search, and modal transitions.
  // ========================================
  var bar = null;
  function getBar() {
    if (!bar) {
      bar = document.getElementById('brush-page-loader');
      if (!bar && (document.body || document.documentElement)) {
        bar = document.createElement('div');
        bar.id = 'brush-page-loader';
        bar.className = 'brush-page-loader';
        (document.body || document.documentElement).appendChild(bar);
      }
    }
    return bar;
  }

  var loaderTimer = null;

  function setProgress(p) {
    var el = getBar();
    if (el) {
      el.style.transform = 'scaleX(' + (p / 100) + ')';
      if (p > 0 && p < 100) {
        el.classList.add('is-loading');
        el.classList.remove('is-done');
        el.style.opacity = '1';
      }
    }
  }

  function start() {
    clearTimeout(loaderTimer);
    setProgress(20);
    loaderTimer = setTimeout(function() {
      setProgress(55);
      loaderTimer = setTimeout(function() {
        setProgress(85);
      }, 300);
    }, 180);
  }

  function done() {
    clearTimeout(loaderTimer);
    setProgress(100);
    var el = getBar();
    if (el) {
      loaderTimer = setTimeout(function() {
        el.classList.add('is-done');
        el.style.opacity = '0';
        setTimeout(function() {
          el.style.transform = 'scaleX(0)';
          el.classList.remove('is-done');
        }, 300);
      }, 150);
    }
  }

  window.BrushPageLoader = { start: start, set: setProgress, done: done };

  if (document.readyState === 'loading') {
    start();
    window.addEventListener('load', done, { once: true });
    document.addEventListener('DOMContentLoaded', function() {
      setTimeout(done, 600);
    }, { once: true });
  }
})();
