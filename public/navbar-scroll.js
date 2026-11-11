// ========================================
// BRUSH — Navbar scroll behavior + scroll progress
// Shared across every page that has a navbar.
// (Integrated directly into global-navbar.js; idempotent fallback preserved)
// ========================================
(function () {
  if (window.__BRUSH_NAVBAR_SCROLL_INITIALIZED__) return;

  document.addEventListener('DOMContentLoaded', () => {
    if (window.__BRUSH_NAVBAR_SCROLL_INITIALIZED__) return;
    const navbar = document.getElementById('navbar');
    if (!navbar) return;
    window.__BRUSH_NAVBAR_SCROLL_INITIALIZED__ = true;

    const announcementBar = document.getElementById('announcement-bar');
    const progressEl = document.getElementById('scroll-progress');
    const narrow = window.matchMedia('(max-width: 480px)');
    let REST_GAP = narrow.matches ? 10 : 16;

    let barHeight = announcementBar ? announcementBar.offsetHeight : 0;
    let ticking = false;

    const nativeProgress = typeof CSS !== 'undefined'
      && CSS.supports && CSS.supports('animation-timeline: scroll()');

    let scrollable = 0;
    function measureScrollable() {
      scrollable = document.documentElement.scrollHeight - window.innerHeight;
    }

    function update() {
      ticking = false;
      const scrollY = window.scrollY;

      navbar.classList.toggle('scrolled', scrollY > 10);

      const top = Math.max(REST_GAP, barHeight + REST_GAP - scrollY);
      navbar.style.setProperty('--nav-top', top + 'px');

      if (progressEl && !nativeProgress) {
        const progress = scrollable > 0 ? Math.min(1, scrollY / scrollable) : 0;
        progressEl.style.transform = `scaleX(${progress})`;
      }
    }

    function requestUpdate() {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    }

    window.addEventListener('scroll', requestUpdate, { passive: true });

    if (progressEl && !nativeProgress) {
      measureScrollable();
      if ('ResizeObserver' in window) {
        new ResizeObserver(() => { measureScrollable(); requestUpdate(); }).observe(document.body);
      }
    }
    if (announcementBar && 'ResizeObserver' in window) {
      new ResizeObserver(() => {
        barHeight = announcementBar.offsetHeight;
        requestUpdate();
      }).observe(announcementBar);
    }
    window.addEventListener('resize', () => {
      barHeight = announcementBar ? announcementBar.offsetHeight : 0;
      REST_GAP = narrow.matches ? 10 : 16;
      measureScrollable();
      requestUpdate();
    });
    update();
  });
})();
