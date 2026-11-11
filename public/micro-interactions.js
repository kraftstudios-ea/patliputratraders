// ========================================
// BRUSH — Micro-interactions: custom cursor + magnetic CTA buttons
// Shared across the same pages as navbar-scroll.js. Both effects are purely
// decorative motion (not functional UI state), so both are gated behind
// prefers-reduced-motion, and neither makes sense without a real mouse, so
// both are also gated behind pointer:fine (touch/coarse pointers bail out).
// ========================================
document.addEventListener('DOMContentLoaded', () => {
  if (window.__BRUSH_INTERACTIONS_LOADED__) return;
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hasFinePointer = window.matchMedia('(pointer: fine)').matches;
  if (prefersReducedMotion || !hasFinePointer) return;

  initCustomCursor();
  initMagneticButtons();

function initCustomCursor() {
  const dot = document.createElement('div');
  dot.className = 'custom-cursor-dot';
  const ring = document.createElement('div');
  ring.className = 'custom-cursor-ring';
  // Content-aware label: on anything that navigates somewhere (a category
  // card, a collection in the ticker, a poster), the cursor says where it
  // goes instead of just growing.
  const label = document.createElement('div');
  label.className = 'custom-cursor-label';

  document.body.append(dot, ring, label);
  document.body.classList.add('custom-cursor-active');

  let mouseX = window.innerWidth / 2;
  let mouseY = window.innerHeight / 2;
  let ringX = mouseX;
  let ringY = mouseY;
  let shown = false;

  window.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    
    dot.style.transform = `translate3d(${mouseX}px, ${mouseY}px, 0)`;
    label.style.transform = `translate3d(${mouseX}px, ${mouseY}px, 0) translate(-50%, 26px)`;
    
    const target = e.target instanceof Element ? e.target : null;
    const isTextInput = target && target.closest('input, textarea, select, [contenteditable="true"]');
    const isSearchActive = target && target.closest('.search-overlay.open, .search-container');

    if (isTextInput || isSearchActive) {
      dot.style.opacity = '0';
      ring.style.opacity = '0';
      hideLabel();
    } else {
      if (!shown) shown = true;
      dot.style.opacity = '1';
      ring.style.opacity = '1';
    }
    startTicking();
  }, { passive: true });

  document.addEventListener('mouseleave', () => {
    shown = false;
    dot.style.opacity = '0';
    ring.style.opacity = '0';
    hideLabel();
  });


  // What should the cursor say over this element? Content-aware label lookup
  function cursorLabelFor(el) {
    if (!el) return '';
    if (el.closest('input, textarea, select, [contenteditable="true"]')) return '';

    const host = el.closest('[data-cursor], .category-card, .product-card, .display-ticker-item, .quick-add-btn, .modal-add-to-cart, .cart-checkout-btn, .cart-item-remove, .cart-close-btn, .modal-close-btn, .scroll-nav, .doom-scroll-btn, .theme-toggle-btn, .swatch-btn, .modal-plain-image-wrapper');
    if (!host) return '';

    const explicit = host.getAttribute && host.getAttribute('data-cursor');
    if (explicit) return explicit;

    if (host.classList.contains('quick-add-btn') || host.classList.contains('modal-add-to-cart')) {
      return 'Add to Cart';
    }
    if (host.classList.contains('cart-checkout-btn')) {
      return 'Checkout';
    }
    if (host.classList.contains('cart-item-remove')) {
      return 'Remove';
    }
    if (host.classList.contains('modal-close-btn') || host.classList.contains('cart-close-btn')) {
      return 'Close';
    }
    if (host.classList.contains('scroll-nav')) {
      return host.classList.contains('prev') ? 'Prev' : 'Next';
    }
    if (host.classList.contains('doom-scroll-btn') || host.classList.contains('scroll-around-btn')) {
      return 'Reels';
    }
    if (host.classList.contains('modal-plain-image-wrapper')) {
      return host.classList.contains('is-zoomed') ? 'Zoom Out' : 'Zoom In';
    }
    if (host.classList.contains('category-card')) {
      const name = (host.querySelector('.category-card-title') || {}).textContent || '';
      return `Explore ${name.trim()}`.trim();
    }
    if (host.classList.contains('display-ticker-item')) {
      return `Explore ${host.textContent.trim()}`;
    }
    if (host.classList.contains('product-card')) {
      const type = (host.dataset.productType || 'poster').toLowerCase();
      return type.startsWith('poster') ? 'View Poster' : 'View Product';
    }
    return '';
  }

  function showLabel(text) {
    if (!text) { hideLabel(); return; }
    label.textContent = text;
    label.classList.add('is-visible');
  }
  function hideLabel() { label.classList.remove('is-visible'); }

  // Delegated, so it also covers dynamic product cards and modal elements
  document.addEventListener('mouseover', (e) => {
    const el = e.target instanceof Element ? e.target : null;
    showLabel(el ? cursorLabelFor(el) : '');
  }, { passive: true });
  document.addEventListener('mouseleave', hideLabel);

  // Delegated hover detection for clickable elements
  const INTERACTIVE_SELECTOR = 'a, button, input, textarea, select, .clickable, [role="button"], [tabindex="0"], .swatch-btn, .combo-tier-card';
  document.addEventListener('mouseover', (e) => {
    if (e.target instanceof Element && e.target.closest(INTERACTIVE_SELECTOR)) {
      if (e.target.closest('.search-overlay')) return;
      ring.classList.add('hovering');
      dot.classList.add('hovering');
    }
  }, { passive: true });

  document.addEventListener('mouseout', (e) => {
    if (e.target instanceof Element && e.target.closest(INTERACTIVE_SELECTOR)) {
      const related = e.relatedTarget instanceof Element ? e.relatedTarget.closest(INTERACTIVE_SELECTOR) : null;
      if (!related) {
        ring.classList.remove('hovering');
        dot.classList.remove('hovering');
      }
    }
  }, { passive: true });

  // On-demand animation loop for ring (sleeps when idle, wakes on move)
  let isTicking = false;
  function render() {
    const dx = mouseX - ringX;
    const dy = mouseY - ringY;
    ringX += dx * 0.28;
    ringY += dy * 0.28;
    
    ring.style.transform = `translate3d(${ringX}px, ${ringY}px, 0)`;
    
    if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
      requestAnimationFrame(render);
    } else {
      isTicking = false;
    }
  }

  function startTicking() {
    if (!isTicking) {
      isTicking = true;
      requestAnimationFrame(render);
    }
  }
}
  function initMagneticButtons() {
    const MAGNETIC_SELECTOR = '.hero-cta, .modal-add-to-cart, .cart-checkout-btn';
    const STRENGTH = 0.35;
    const MAX_OFFSET = 14; // px — keeps the pull subtle rather than the button chasing the cursor
    const PULL_TRANSITION = 'transform 0.15s ease-out, box-shadow var(--transition-med), background var(--transition-fast)';
    const RELEASE_TRANSITION = 'transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow var(--transition-med), background var(--transition-fast)';

    document.querySelectorAll(MAGNETIC_SELECTOR).forEach((btn) => {
      let rect = null;
      btn.addEventListener('mouseenter', () => {
        rect = btn.getBoundingClientRect();
      });
      btn.addEventListener('mousemove', (e) => {
        if (!rect) rect = btn.getBoundingClientRect();
        const relX = e.clientX - (rect.left + rect.width / 2);
        const relY = e.clientY - (rect.top + rect.height / 2);
        const x = Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, relX * STRENGTH));
        const y = Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, relY * STRENGTH));
        btn.style.transition = PULL_TRANSITION;
        btn.style.setProperty('--magnet-x', `${x}px`);
        btn.style.setProperty('--magnet-y', `${y}px`);
      });
      btn.addEventListener('mouseleave', () => {
        rect = null;
        btn.style.transition = RELEASE_TRANSITION;
        btn.style.setProperty('--magnet-x', '0px');
        btn.style.setProperty('--magnet-y', '0px');
      });
    });
  }
});
