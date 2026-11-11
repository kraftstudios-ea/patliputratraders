// ========================================
// BRUSH — Motion helpers (no GSAP)
//
// Scroll reveals are owned by ONE system: the .fade-in / .scale-in /
// .clip-reveal classes, toggled to .visible by the IntersectionObserver in
// script.js (which also covers product cards injected later from the API).
//
// This file used to run GSAP `from()` tweens on those same elements. GSAP
// reads the element's *current* opacity as the tween's end value — which is
// 0 for a not-yet-revealed .fade-in — so it tweened 0 -> 0 and left an
// inline `opacity: 0` behind that CSS could never override. That is what
// made whole sections vanish. It also double-drove Lenis (a second rAF loop
// on top of scroll.js's), which made scrolling feel jumpy.
//
// What remains is the stagger the GSAP version added for grids, done by
// assigning transition-delays so the CSS reveal plays one item after another.
// ========================================
(function () {
  if (window.__BRUSH_INTERACTIONS_LOADED__) return;
  function stagger(selector, step) {
    document.querySelectorAll(selector).forEach((group) => {
      Array.from(group.children).forEach((child, i) => {
        if (child.classList.contains('fade-in') || child.classList.contains('scale-in')) {
          child.style.transitionDelay = `${(i * step).toFixed(2)}s`;
        }
      });
    });
  }

  function init() {
    stagger('.features-grid', 0.1);
    stagger('.categories-grid', 0.08);
    stagger('.testimonials-grid', 0.1);
    stagger('.reachout-grid', 0.1);
    stagger('.custom-prints-grid', 0.08);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

