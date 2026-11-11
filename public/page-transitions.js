// ========================================
// BRUSH - Seamless Page Transitions
// Eradicates the default white-flash of multi-page navigations mapping SPA-like UX
// ========================================
(function() {
  if (window.__BRUSH_INTERACTIONS_LOADED__) return;
  if (window.matchMedia && (window.matchMedia('(prefers-reduced-motion: reduce)').matches || window.matchMedia('(pointer: coarse)').matches)) return;

  const overlay = document.createElement('div');
  overlay.className = 'page-transition-overlay';
  document.documentElement.appendChild(overlay);
  
  window.BrushTransition = {
    show: () => overlay.classList.remove('hide'),
    hide: () => overlay.classList.add('hide')
  };

  // Fade out after paint
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      overlay.classList.add('hide');
    });
  });

  document.addEventListener('click', (e) => {
    // Component-level handlers use preventDefault() for drawer controls,
    // smooth-scroll fallbacks, and other same-page interactions. Never
    // schedule a navigation after one of those handlers has claimed the click.
    if (e.defaultPrevented) return;
    const link = e.target.closest('a');
    if (!link) return;

    const href = link.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
    // Opt-out: anything that opens in place (order history, account) must not
    // get a full-page fade.
    if (link.hasAttribute('data-no-transition') || /[?&]open=/.test(href)) return;
    if (link.target === '_blank' || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    try {
      const url = new URL(link.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.hash) return; // Same page hash anchor
    } catch(err) {
      return;
    }

    e.preventDefault();
    overlay.classList.remove('hide');
    requestAnimationFrame(() => {
      window.location.assign(link.href);
    });
  });

  // Handle Safari BFCache (when user presses physical back button)
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) {
      overlay.classList.add('hide');
    }
  });
})();
