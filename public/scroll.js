// ========================================
// PATLIPUTRA TRADERS — Universal Lenis Smooth Scroll
// Hardware-accelerated, buttery smooth scroll across all pages.
// Respects prefers-reduced-motion: reduce.
// ========================================
(function () {
  if (typeof window === 'undefined') return;

  function initLenis() {
    if (window.lenis && window.__LENIS_INITIALIZED__) return window.lenis;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      document.documentElement.classList.remove('lenis', 'lenis-smooth');
      return null;
    }

    if (typeof Lenis === 'undefined') {
      return null;
    }

    try {
      const lenis = new Lenis({
        duration: 1.2,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        orientation: 'vertical',
        gestureOrientation: 'vertical',
        smoothWheel: true,
        wheelMultiplier: 1.0,
        touchMultiplier: 1.0,
        infinite: false,
        syncTouch: false
      });

      function raf(time) {
        lenis.raf(time);
        requestAnimationFrame(raf);
      }
      requestAnimationFrame(raf);

      window.lenis = lenis;
      window.__LENIS_INITIALIZED__ = true;

      // Handle smooth anchor scrolling across the page
      document.addEventListener('click', (e) => {
        const a = e.target.closest('a[href^="#"]');
        if (!a) return;
        const href = a.getAttribute('href');
        if (!href || href === '#' || href === '#!') return;
        try {
          const target = document.querySelector(href);
          if (target) {
            e.preventDefault();
            lenis.scrollTo(target, { offset: -70 });
          }
        } catch (_) {}
      }, { passive: false });

      // Automatically recalculate scroll boundaries when images/fonts finish loading
      window.addEventListener('load', () => {
        try { lenis.resize(); } catch (_) {}
      });

      // Recalculate on window resize
      window.addEventListener('resize', () => {
        try { lenis.resize(); } catch (_) {}
      });

      return lenis;
    } catch (err) {
      console.warn('Lenis smooth scroll skipped:', err);
      return null;
    }
  }

  // Attempt immediate initialization
  if (!initLenis()) {
    let attempts = 0;
    const timer = setInterval(() => {
      attempts++;
      if (initLenis() || attempts >= 30) {
        clearInterval(timer);
      }
    }, 80);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLenis);
  }
})();
