// ========================================
// BRUSH — Consolidated UI Interactions & Motion
// Unifies: Page Transitions, Smooth Scroll (Lenis),
// Grid Reveal Stagger, Custom Cursor, and Magnetic CTAs.
// ========================================
(function () {
  if (typeof window === 'undefined') return;
  if (window.__BRUSH_INTERACTIONS_LOADED__) return;
  window.__BRUSH_INTERACTIONS_LOADED__ = true;

  const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hasFinePointer = window.matchMedia && window.matchMedia('(pointer: fine)').matches;

  // ----------------------------------------
  // 1. Seamless Page Transitions
  // ----------------------------------------
  function initTransitions() {
    if (prefersReducedMotion || !hasFinePointer) return;

    let overlay = document.querySelector('.page-transition-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'page-transition-overlay';
      document.documentElement.appendChild(overlay);
    }

    window.BrushTransition = {
      show: () => overlay.classList.remove('hide'),
      hide: () => overlay.classList.add('hide')
    };

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        overlay.classList.add('hide');
      });
    });

    document.addEventListener('click', (e) => {
      if (e.defaultPrevented) return;
      const link = e.target.closest('a');
      if (!link) return;

      const href = link.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
      if (link.hasAttribute('data-no-transition') || /[?&]open=/.test(href)) return;
      if (link.target === '_blank' || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      try {
        const url = new URL(link.href, window.location.origin);
        if (url.origin !== window.location.origin) return;
        if (url.pathname === window.location.pathname && url.hash) return;
      } catch (_) {
        return;
      }

      e.preventDefault();
      overlay.classList.remove('hide');
      requestAnimationFrame(() => {
        window.location.assign(link.href);
      });
    });

    window.addEventListener('pageshow', (e) => {
      if (e.persisted) overlay.classList.add('hide');
    });
  }

  // ----------------------------------------
  // 2. Smooth Scroll (Lenis + Native Anchors)
  // ----------------------------------------
  function initSmoothScroll() {
    if (window.lenis || prefersReducedMotion) return;

    const isTouch = !hasFinePointer || ('ontouchstart' in window && window.innerWidth <= 1024);
    if (isTouch) {
      document.addEventListener('click', (e) => {
        const a = e.target.closest('a[href^="#"]');
        if (!a) return;
        const href = a.getAttribute('href');
        if (!href || href === '#' || href === '#!') return;
        try {
          const target = document.querySelector(href);
          if (target) {
            e.preventDefault();
            const top = target.getBoundingClientRect().top + window.scrollY - 70;
            window.scrollTo({ top, behavior: 'smooth' });
          }
        } catch (_) {}
      }, { passive: false });
      return;
    }

    function startLenis() {
      if (window.lenis) return true;
      if (typeof Lenis === 'undefined') return false;

      try {
        const lenis = new Lenis({
          duration: 1.15,
          easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
          orientation: 'vertical',
          gestureOrientation: 'vertical',
          smoothWheel: true,
          wheelMultiplier: 1.0,
          touchMultiplier: 1.0,
          infinite: false,
        });

        function raf(time) {
          lenis.raf(time);
          requestAnimationFrame(raf);
        }
        requestAnimationFrame(raf);
        window.lenis = lenis;

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

        return true;
      } catch (err) {
        console.warn('Lenis smooth scroll skipped:', err);
        return false;
      }
    }

    if (!startLenis()) {
      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        if (startLenis() || attempts > 60) {
          clearInterval(interval);
        }
      }, 50);
      window.addEventListener('load', () => {
        clearInterval(interval);
        startLenis();
      }, { once: true });
    }
  }

  // ----------------------------------------
  // 3. Motion Stagger for Reveal Grids
  // ----------------------------------------
  function initMotionStagger() {
    function stagger(selector, step) {
      document.querySelectorAll(selector).forEach((group) => {
        Array.from(group.children).forEach((child, i) => {
          if (child.classList.contains('fade-in') || child.classList.contains('scale-in')) {
            child.style.transitionDelay = `${(i * step).toFixed(2)}s`;
          }
        });
      });
    }

    stagger('.features-grid', 0.1);
    stagger('.categories-grid', 0.08);
    stagger('.testimonials-grid', 0.1);
    stagger('.reachout-grid', 0.1);
    stagger('.custom-prints-grid', 0.08);
  }

  // ----------------------------------------
  // 4. Micro-Interactions: Cursor & Magnetic CTAs
  // ----------------------------------------
  function initMicroInteractions() {
    if (prefersReducedMotion || !hasFinePointer) return;

    // Custom Cursor
    const dot = document.createElement('div');
    dot.className = 'custom-cursor-dot';
    const ring = document.createElement('div');
    ring.className = 'custom-cursor-ring';
    const label = document.createElement('div');
    label.className = 'custom-cursor-label';

    document.body.append(dot, ring, label);
    document.body.classList.add('custom-cursor-active');

    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;
    let ringX = mouseX;
    let ringY = mouseY;
    let shown = false;
    let isOverInput = false;

    window.addEventListener('mousemove', (e) => {
      mouseX = e.clientX;
      mouseY = e.clientY;

      if (document.body.classList.contains('search-overlay-open')) {
        dot.style.opacity = '0';
        ring.style.opacity = '0';
        hideLabel();
        return;
      }

      if (!shown && !isOverInput) {
        shown = true;
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

    function cursorLabelFor(el) {
      if (!el || el.closest('input, textarea, select, [contenteditable="true"]')) return '';
      const host = el.closest('[data-cursor], .category-card, .product-card, .display-ticker-item, .quick-add-btn, .modal-add-to-cart, .cart-checkout-btn, .cart-item-remove, .cart-close-btn, .modal-close-btn, .scroll-nav, .doom-scroll-btn, .theme-toggle-btn, .swatch-btn, .modal-plain-image-wrapper');
      if (!host) return '';

      const explicit = host.getAttribute && host.getAttribute('data-cursor');
      if (explicit) return explicit;

      if (host.classList.contains('quick-add-btn') || host.classList.contains('modal-add-to-cart')) return 'Add to Cart';
      if (host.classList.contains('cart-checkout-btn')) return 'Checkout';
      if (host.classList.contains('cart-item-remove')) return 'Remove';
      if (host.classList.contains('modal-close-btn') || host.classList.contains('cart-close-btn')) return 'Close';
      if (host.classList.contains('scroll-nav')) return host.classList.contains('prev') ? 'Prev' : 'Next';
      if (host.classList.contains('doom-scroll-btn') || host.classList.contains('scroll-around-btn')) return 'Reels';
      if (host.classList.contains('modal-plain-image-wrapper')) return host.classList.contains('is-zoomed') ? 'Zoom Out' : 'Zoom In';
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

    document.addEventListener('mouseover', (e) => {
      const el = e.target instanceof Element ? e.target : null;
      isOverInput = !!(el && el.closest('input, textarea, select, [contenteditable="true"], .search-overlay, .search-container')) || document.body.classList.contains('search-overlay-open');
      if (isOverInput) {
        dot.style.opacity = '0';
        ring.style.opacity = '0';
        hideLabel();
      } else {
        if (shown) {
          dot.style.opacity = '1';
          ring.style.opacity = '1';
        }
        showLabel(el ? cursorLabelFor(el) : '');
      }
    }, { passive: true });
    document.addEventListener('mouseleave', hideLabel);

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

    let isTicking = false;
    function render() {
      dot.style.transform = `translate3d(${mouseX}px, ${mouseY}px, 0)`;
      label.style.transform = `translate3d(${mouseX}px, ${mouseY}px, 0) translate(-50%, 26px)`;

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

    // Magnetic Buttons
    const MAGNETIC_SELECTOR = '.hero-cta, .modal-add-to-cart, .cart-checkout-btn';
    const STRENGTH = 0.35;
    const MAX_OFFSET = 14;
    const PULL_TRANSITION = 'transform 0.15s ease-out, box-shadow var(--transition-med), background var(--transition-fast)';
    const RELEASE_TRANSITION = 'transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow var(--transition-med), background var(--transition-fast)';

    document.querySelectorAll(MAGNETIC_SELECTOR).forEach((btn) => {
      let rect = null;
      btn.addEventListener('mouseenter', () => { rect = btn.getBoundingClientRect(); });
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

  // Initialize
  initTransitions();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initSmoothScroll();
      initMotionStagger();
      initMicroInteractions();
    });
  } else {
    initSmoothScroll();
    initMotionStagger();
    initMicroInteractions();
  }
})();
