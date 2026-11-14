// ========================================
// BRUSH — Shared navbar (<global-navbar>)
//
// The announcement bar is homepage-only: add the
// `announcement` attribute on the page that should show it
// (<global-navbar announcement></global-navbar> in index.html).
//
// "Categories" is a dropdown: product types on the left, poster genres on
// the right, each deep-linking into the clean /shop/ route's filters. On
// mobile (sheet menu) it becomes a tap-to-expand accordion.
//
// The navbar also owns the behavior every page needs from it — mobile
// menu, current-page highlight, cart badge — and gives the search / cart /
// account buttons a sensible fallback on pages that don't ship the full
// overlay markup (search overlay, cart drawer, auth modal), so no icon in
// the bar is ever a dead click.
// ========================================
(function () {
  // ---- Back button closes overlays ----
  // On a phone, the product window, cart, filter/sort sheets and menu all
  // look like separate screens, so people press Back to leave them. Without
  // a history entry that left the whole page instead (and could restore it
  // from the back-forward cache frozen mid-overlay). Each overlay registers
  // here: opening pushes a same-URL history entry, Back closes the overlay,
  // and closing it any other way pops that entry again.
  const BrushBack = (() => {
    const registry = {};          // name -> { close(fromHistory), isOpen() }
    let pendingBack = false;      // a UI close is waiting for its popstate
    let queued = [];              // opens that arrived during that wait
    let backTimer = null;         // fallback if that popstate never lands

    const push = (name) => history.pushState({ ...(history.state || {}), brushOverlay: name }, '');
    const current = () => (history.state && history.state.brushOverlay) || null;

    // Pages keep their own URL up to date with replaceState (the store's
    // filters, the poster feed's current poster). Done while an overlay's
    // entry is on top, that URL would be lost when the entry is popped, so
    // remember it and carry it back down to the page's own entry.
    const isProductUrl = (url) => {
      if (!url) return false;
      return /[?&]product=/.test(url) || /\/p\/[^/]+(?:\/|$)/.test(url);
    };

    const cleanNonProductUrl = (urlStr) => {
      try {
        const u = new URL(urlStr || location.href, location.origin);
        u.searchParams.delete('product');
        if (/^\/p\/[^/]+(?:\/|$)/.test(u.pathname)) u.pathname = '/';
        return u.pathname + (u.search ? u.search : '') + (u.hash ? u.hash : '');
      } catch (_) {
        return '/';
      }
    };

    const nativeReplace = history.replaceState.bind(history);
    let carriedUrl = null;
    history.replaceState = function (state, title, url) {
      nativeReplace(state, title, url);
      if (current() && current() !== 'product' && !isProductUrl(location.href)) {
        carriedUrl = location.href;
      }
    };
    const restoreUrl = () => {
      if (!current()) {
        if (carriedUrl) {
          if (!isProductUrl(carriedUrl) && carriedUrl !== location.href) {
            nativeReplace(history.state, '', carriedUrl);
          }
          carriedUrl = null;
        } else if (isProductUrl(location.href)) {
          nativeReplace(history.state, '', cleanNonProductUrl(location.href));
        }
      }
    };

    // history.back() is asynchronous, and on rare occasions (a browser that
    // swallows it, a same-document entry that has already gone) no popstate
    // ever arrives. Without a timeout pendingBack would stay true for the
    // rest of the page's life and every later overlay would open with no
    // history entry behind it, so Back would leave the site instead of
    // closing the overlay.
    const settleBack = () => {
      pendingBack = false;
      clearTimeout(backTimer);
      restoreUrl();
      queued.forEach(push);
      queued = [];
    };

    const pageLoadedTime = Date.now();
    window.addEventListener('popstate', (e) => {
      // Ignore phantom popstate events fired by mobile WebKit/iOS Safari on initial page load
      if (Date.now() - pageLoadedTime < 800 && (!e.state || !e.state.brushOverlay)) {
        return;
      }
      if (pendingBack) {
        settleBack();
        return;
      }
      const top = current();
      Object.entries(registry).forEach(([name, o]) => {
        if (name !== top && o.isOpen()) o.close(true);
      });
      restoreUrl();
    });

    return {
      register(name, close, isOpen) { registry[name] = { close, isOpen }; },
      opened(name) {
        // While a close is in flight the entry named by current() is the one
        // about to be popped, so it can't be reused — queue instead of
        // treating it as already pushed. (Reopening fast enough to land in
        // that window used to leave the overlay with no entry behind it.)
        if (pendingBack) {
          if (!queued.includes(name)) queued.push(name);
          return;
        }
        if (current() === name) return;
        push(name);
      },
      // Closed by the UI (not by Back): drop the entry we pushed. Pass
      // {navigating: true} when a link is about to leave the page anyway.
      closed(name, opts = {}) {
        queued = queued.filter(n => n !== name);
        if (name === 'product') carriedUrl = null;
        if (current() !== name) return;
        if (opts.navigating) {
          const { brushOverlay, ...rest } = history.state;
          nativeReplace(Object.keys(rest).length ? rest : null, '');
          carriedUrl = null;
          return;
        }
        pendingBack = true;
        clearTimeout(backTimer);
        backTimer = setTimeout(settleBack, 600);
        history.back();
      },
    };
  })();
  window.BrushBack = BrushBack;

  const PRODUCT_TYPES = [
    { label: 'Chandeliers', category: 'Chandeliers', icon: 'fa-gem' },
    { label: 'Wall Lamps', category: 'Decorative Wall Lamps', icon: 'fa-lightbulb' },
    { label: 'Pendant Lights', category: 'Pendant & Hanging Lights', icon: 'fa-shapes' },
    { label: 'Ceiling Fans', category: 'Ceiling & Chandelier Fans', icon: 'fa-fan' },
    { label: 'Track & Spot Lights', category: 'Spot & Track Lights', icon: 'fa-crosshairs' },
    { label: 'COB & Downlights', category: 'COB & Downlights', icon: 'fa-circle-dot' },
    { label: 'Profile & Linear', category: 'Profile & Linear Lights', icon: 'fa-ruler-horizontal' },
    { label: 'Strip & Rope Lights', category: 'Strip & Rope Lights', icon: 'fa-braid' },
    { label: 'Outdoor Lights', category: 'Outdoor & Landscape Lights', icon: 'fa-tree' },
    { label: 'Table & Floor Lamps', category: 'Table & Floor Lamps', icon: 'fa-couch' },
    { label: 'Smart & Utility', category: 'Smart & Utility Lighting', icon: 'fa-plug' }
  ];
  const ROUTES = {
    home: 'index.html', shop: 'all_products.html', chandeliers: 'all_products.html?category=Chandeliers',
    wallLamps: 'all_products.html?category=Decorative%20Wall%20Lamps', pendants: 'all_products.html?category=Pendant%20%26%20Hanging%20Lights',
    about: 'about_us.html', institutional: 'institutional.html', specialDay: 'special_day.html',
    styleOptions: 'style_options.html', policies: 'policies.html', checkout: 'checkout.html',
    track: 'track.html', orders: 'orders.html', profile: 'profile.html'
  };
  const GENRES = ['Chandeliers', 'Decorative Wall Lamps', 'Pendant & Hanging Lights', 'Ceiling & Chandelier Fans', 'Spot & Track Lights', 'COB & Downlights', 'Profile & Linear Lights', 'Outdoor & Landscape Lights'];
  const route = (name, query = '') => `${ROUTES[name] || ROUTES.home}${query}`;

  const typeLinks = PRODUCT_TYPES.map(t => {
    const targetUrl = route('shop', `?category=${encodeURIComponent(t.category)}`);
    return `<a href="${targetUrl}" class="nav-dd-item"><i class="fa-solid ${t.icon}"></i><span>${t.label}</span></a>`;
  }).join('');
  const genreLinks = GENRES.map(g => {
    const targetUrl = route('shop', `?category=${encodeURIComponent(g)}`);
    return `<a href="${targetUrl}" class="nav-dd-genre">${g}</a>`;
  }).join('');


  // ===== ANNOUNCEMENT TICKER =====
  const TICKER_ITEMS = [
    '✨ <strong>PATLIPUTRA TRADERS:</strong> Patna’s Premier Architectural &amp; Decorative Lighting Showroom',
    'Free Shipping on orders above \u20b91,999 across Bihar &amp; India',
    '100% Genuine High-CRI LED Fixtures &amp; Luxury Chandeliers',
    'Architect &amp; Bulk Contractor Pricing Available',
    `<a href="https://www.instagram.com/patliputratraderpatna/" target="_blank" rel="noopener">Follow @patliputratraderpatna on Instagram \u2192</a>`,
  ].map(t => `<span class="ticker-item">${t}</span><span class="ticker-sep" aria-hidden="true">\u273b</span>`).join('');

  class GlobalNavbar extends HTMLElement {
    connectedCallback() {
      const showBar = this.hasAttribute('announcement');
      this.innerHTML = `
        <a href="#main-content" class="skip-link">Skip to content</a>
        ${showBar ? `<div class="announcement-bar" id="announcement-bar" role="region" aria-label="Store announcements">
          <div class="ticker">
            <div class="ticker-track">
              <div class="ticker-group">${TICKER_ITEMS}</div>
              <div class="ticker-group" aria-hidden="true">${TICKER_ITEMS}</div>
            </div>
          </div>
        </div>` : ''}
        <nav class="navbar" id="navbar">
          <a href="${route('home')}" class="nav-brand" aria-label="Patliputra Traders home" style="display:inline-flex; align-items:center; gap:10px; text-decoration:none;">
            <img src="img/site/patliputra-logo.webp" alt="Patliputra Traders" width="34" height="34" style="border-radius:6px; object-fit:contain;">
            <span class="nav-brand-text" style="font-family:'Plus Jakarta Sans',sans-serif; font-weight:800; font-size:1.05rem; letter-spacing:-0.02em; color:var(--text, #0f172a);">PATLIPUTRA <span style="color:#dfa84a;">TRADERS</span></span>
          </a>

          <div class="nav-links" id="nav-links" data-lenis-prevent>
            <a href="${route('home')}">Home</a>
            <div class="nav-dropdown" id="nav-categories">
              <button type="button" class="nav-dd-toggle" aria-expanded="false" aria-haspopup="true" aria-controls="nav-dd-panel">
                Collections <i class="fa-solid fa-chevron-down nav-dd-caret" aria-hidden="true"></i>
              </button>
              <div class="nav-dd-panel" id="nav-dd-panel" role="menu">
                <div class="nav-dd-col">
                  <p class="nav-dd-heading">Lighting Categories</p>
                  ${typeLinks}
                </div>
                <div class="nav-dd-col nav-dd-col-genres">
                  <p class="nav-dd-heading">Popular Fixtures</p>
                  <div class="nav-dd-genres">${genreLinks}</div>
                  <a href="${route('shop')}" class="nav-dd-all">Explore Entire Catalogue →</a>
                </div>
              </div>
            </div>
            <a href="${route('chandeliers')}">Chandeliers</a>
            <a href="${route('wallLamps')}">Wall Lamps</a>
            <a href="${route('pendants')}">Pendants</a>
            <a href="${route('shop')}">Shop All</a>
            <a href="${route('institutional')}">B2B / Projects</a>
          </div>

          <div class="nav-actions">
            <button class="nav-action-btn" id="search-btn" aria-label="Search">
              <i class="fa-solid fa-magnifying-glass"></i>
            </button>
            <a href="${route('orders')}" class="nav-action-btn" aria-label="Orders">
              <i class="fa-solid fa-box-open"></i>
            </a>
            <button class="nav-action-btn" data-theme-toggle aria-label="Toggle light / dark mode">
              <i class="fa-solid fa-moon theme-toggle-icon-dark"></i>
              <i class="fa-solid fa-sun theme-toggle-icon-light"></i>
            </button>
            <a href="${route('profile')}" class="nav-action-btn" aria-label="Account">
              <i class="fa-regular fa-user"></i>
            </a>
            <a href="${route('checkout')}" class="nav-action-btn" id="cart-nav-btn" aria-label="Cart">
              <i class="fa-solid fa-bag-shopping"></i>
              <span class="cart-count" id="nav-cart-count" style="display: none;">0</span>
            </a>
            <button type="button" class="menu-toggle" id="menu-toggle" aria-label="Open menu" aria-expanded="false" aria-controls="nav-links">
              <span></span><span></span><span></span>
            </button>
          </div>
        </nav>
      `;
      // Place the pill below the announcement bar before first paint, so it
      // doesn't start over the bar and hop down once navbar-scroll.js runs.
      if (showBar) {
        const bar = this.querySelector('#announcement-bar');
        const gap = window.matchMedia('(max-width: 480px)').matches ? 10 : 16;
        this.querySelector('#navbar').style.setProperty('--nav-top', (bar.offsetHeight + gap) + 'px');
      }
      this.initDropdown();
      this.initSkipLink();
      this.markCurrentPage();
      this.initMobileMenu();
      this.initCartBadge();
      this.initScrollBehavior();
      // Fallbacks need to know which overlays the page actually has, so they
      // wait for the rest of the document (and its deferred scripts).
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => this.initFallbacks());
      } else {
        this.initFallbacks();
      }
    }

    // Keyboard users land on the page's <main> instead of tabbing through
    // the whole bar on every page load.
    initSkipLink() {
      this.querySelector('.skip-link').addEventListener('click', (e) => {
        const main = document.getElementById('main-content') || document.querySelector('main');
        if (!main) return;
        e.preventDefault();
        if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');
        main.focus({ preventScroll: true });
        main.scrollIntoView();
      });
    }

    initScrollBehavior() {
      if (window.__BRUSH_NAVBAR_SCROLL_INITIALIZED__) return;
      window.__BRUSH_NAVBAR_SCROLL_INITIALIZED__ = true;

      const navbar = this.querySelector('#navbar') || document.getElementById('navbar');
      if (!navbar) return;

      const announcementBar = this.querySelector('#announcement-bar') || document.getElementById('announcement-bar');
      const progressEl = document.getElementById('scroll-progress');
      const narrow = window.matchMedia('(max-width: 480px)');
      let REST_GAP = narrow.matches ? 10 : 16;
      let barHeight = announcementBar ? announcementBar.offsetHeight : 0;
      let ticking = false;

      const nativeProgress = typeof CSS !== 'undefined'
        && CSS.supports && CSS.supports('animation-timeline: scroll()');

      let scrollable = 0;
      const measureScrollable = () => {
        scrollable = document.documentElement.scrollHeight - window.innerHeight;
      };

      const update = () => {
        ticking = false;
        const scrollY = window.scrollY;
        navbar.classList.toggle('scrolled', scrollY > 10);
        const top = Math.max(REST_GAP, barHeight + REST_GAP - scrollY);
        navbar.style.setProperty('--nav-top', top + 'px');

        if (progressEl && !nativeProgress) {
          const progress = scrollable > 0 ? Math.min(1, scrollY / scrollable) : 0;
          progressEl.style.transform = `scaleX(${progress})`;
        }
      };

      const requestUpdate = () => {
        if (!ticking) {
          ticking = true;
          requestAnimationFrame(update);
        }
      };

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
    }

    markCurrentPage() {
      const normalizePath = (pathname) => {
        const clean = pathname.replace(/\/+$/, '');
        return clean || '/';
      };
      const pagePath = normalizePath(window.location.pathname);
      const page = pagePath === '/' ? '/' : pagePath.split('/').pop().toLowerCase();
      const params = new URLSearchParams(window.location.search);
      this.querySelectorAll('.nav-links > a').forEach((a) => {
        const url = new URL(a.getAttribute('href'), window.location.href);
        const targetPath = normalizePath(url.pathname);
        const target = targetPath === '/' ? '/' : targetPath.split('/').pop().toLowerCase();
        // "Shop All" only counts as current when no category filter narrows it.
        const current = target === page && !url.hash &&
          !(target === 'all_products.html' && (params.get('type') || params.get('category')));
        if (current) a.setAttribute('aria-current', 'page');
      });
      if (page === 'all_products.html' && (params.get('type') || params.get('category'))) {
        const dropdownToggle = this.querySelector('.nav-dd-toggle');
        if (dropdownToggle) dropdownToggle.classList.add('is-current');
      }
    }

    // Scroll lock is shared with script.js's modals/drawer when present
    // (its lock is ref-counted), otherwise handled here directly.
    lockScroll(lock) {
      if (window.BrushScrollLock) {
        lock ? window.BrushScrollLock.lock() : window.BrushScrollLock.unlock();
        return;
      }
      // Fallback only — mirrors script.js's lock (see the long comment
      // there: body{overflow:hidden} does not lock this page because
      // html carries overflow-x:hidden, so the body has to be pinned).
      const html = document.documentElement;
      if (lock) {
        this._lockedY = window.scrollY || html.scrollTop || 0;
        document.body.style.top = `-${this._lockedY}px`;
        html.classList.add('scroll-locked');
        if (window.lenis) window.lenis.stop();
      } else {
        html.classList.remove('scroll-locked');
        document.body.style.top = '';
        window.scrollTo(0, this._lockedY || 0);
        if (window.lenis) window.lenis.start();
      }
    }

    initMobileMenu() {
      const toggle = this.querySelector('#menu-toggle');
      const links = this.querySelector('#nav-links');
      const setOpen = (open, how = {}) => {
        if (links.classList.contains('open') === open) return;
        links.classList.toggle('open', open);
        toggle.classList.toggle('active', open);
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
        this.lockScroll(open);
        if (open) BrushBack.opened('menu');
        else if (!how.fromHistory) BrushBack.closed('menu', { navigating: !!how.navigating });
      };
      BrushBack.register('menu', () => setOpen(false, { fromHistory: true }), () => links.classList.contains('open'));
      toggle.addEventListener('click', () => setOpen(!links.classList.contains('open')));
      links.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
        const url = new URL(a.href, location.href);
        const samePage = url.pathname === location.pathname && url.search === location.search;
        setOpen(false, { navigating: !samePage });
      }));
      // Restored from the back-forward cache: never come back with the
      // sheet open over a scroll-locked page.
      window.addEventListener('pageshow', (e) => { if (e.persisted) setOpen(false, { fromHistory: true }); });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && links.classList.contains('open')) {
          setOpen(false);
          toggle.focus();
        }
      });
      // Rotating to / resizing into the desktop layout must not leave the
      // page scroll-locked behind a sheet that is no longer shown.
      window.matchMedia('(min-width: 1025px)').addEventListener('change', (e) => {
        if (e.matches) setOpen(false);
      });
    }

    // Reads the cart straight from storage so the badge is right on every
    // page, including ones that don't load cart.js; stays live via cart.js's
    // change events when present and the storage event across tabs.
    initCartBadge() {
      const badge = this.querySelector('#nav-cart-count');
      const render = () => {
        let count = 0;
        try {
          const cart = JSON.parse(localStorage.getItem('brush_cart')) || [];
          count = cart.reduce((n, item) => n + (Number(item.quantity) || 0), 0);
        } catch (e) {}
        badge.textContent = count;
        badge.style.display = count > 0 ? 'flex' : 'none';
      };
      render();
      window.addEventListener('storage', (e) => { if (e.key === 'brush_cart') render(); });
      document.addEventListener('DOMContentLoaded', () => {
        if (typeof Cart !== 'undefined' && Cart.onChange) Cart.onChange(render);
      });
    }

    initFallbacks() {
      // Search: pages without the overlay get a lightweight one injected,
      // using the same markup/classes so it looks identical.
      // NEVER inject if an overlay already exists or if <site-overlays> is present on the page.
      const hasSearchOverlay = document.getElementById('search-overlay') || document.querySelector('site-overlays');
      if (!hasSearchOverlay) {
        this.injectSearch();
      }

      // Cart / account / orders: the hrefs above already point somewhere
      // useful (checkout, or the homepage which opens the right modal). On
      // pages that DO have the drawer/modals, script.js intercepts the click.
      const cartBtn = this.querySelector('#cart-nav-btn');
      if (!document.getElementById('cart-drawer') && /(?:checkout\.html|\/checkout\/?$)/.test(window.location.pathname)) {
        cartBtn.addEventListener('click', (e) => {
          e.preventDefault();
          const summary = document.querySelector('.order-summary, .checkout-summary');
          if (summary) summary.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      }
      // Order history is a modal, not a page. Where the modal exists on this
      // page, open it in place — navigating home just to show it meant a full
      // reload and a fade for something that is already here.
      const loggedIn = (() => { try { return !!localStorage.getItem('brushUser'); } catch (e) { return false; } })();
      const account = this.querySelector('a[aria-label="Account"]');
      const orders = this.querySelector('a[aria-label="Orders"]');
      if (account) account.href = loggedIn ? route('profile') : `${route('home')}?login=1&redirect=profile.html`;
      if (orders) orders.href = loggedIn ? route('orders') : `${route('home')}?login=1&redirect=orders.html`;
    }

    injectSearch() {
      const overlay = document.createElement('div');
      overlay.className = 'search-overlay';
      overlay.id = 'search-overlay';
      overlay.innerHTML = `
        <div class="search-container" role="dialog" aria-modal="true" aria-label="Search">
          <button type="button" class="search-close-btn" aria-label="Close search"><i class="fa-solid fa-xmark"></i></button>
          <form class="global-search-form" id="global-search-form" role="search">
            <input type="search" id="global-search-input" name="search" placeholder="Search chandeliers, lamps, pendants, fans, lights..." autocomplete="off" aria-label="Search products">
            <button type="submit" aria-label="Submit search"><i class="fa-solid fa-magnifying-glass"></i></button>
          </form>
        </div>`;
      document.body.appendChild(overlay);

      const input = overlay.querySelector('#global-search-input');
      const searchBtn = this.querySelector('#search-btn');
      const close = () => {
        overlay.classList.remove('open');
        document.body.classList.remove('search-overlay-open');
        if (window.matchMedia && window.matchMedia('(pointer: fine)').matches) {
          document.body.classList.add('custom-cursor-active');
        }
        if (typeof window.BrushScrollLock?.unlock === 'function') window.BrushScrollLock.unlock();
        if (searchBtn) searchBtn.focus();
      };
      if (searchBtn) {
        searchBtn.addEventListener('click', (e) => {
          e.preventDefault();
          document.body.classList.add('search-overlay-open');
          document.body.classList.remove('custom-cursor-active');
          overlay.classList.add('open');
          if (typeof window.BrushScrollLock?.lock === 'function') window.BrushScrollLock.lock();
          if (input) {
            input.focus({ preventScroll: true });
            requestAnimationFrame(() => input.focus({ preventScroll: true }));
          }
        });
      }
      overlay.querySelector('.search-close-btn').addEventListener('click', close);
      overlay.addEventListener('click', (e) => {
        if (!e.target.closest('.search-container')) close();
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && overlay.classList.contains('open')) close();
      });
      overlay.querySelector('form').addEventListener('submit', (e) => {
        e.preventDefault();
        const q = input.value.trim();
        if (q) window.location.href = route('shop', '?search=' + encodeURIComponent(q));
      });
    }

    initDropdown() {
      const dd = this.querySelector('#nav-categories');
      const toggle = dd.querySelector('.nav-dd-toggle');
      const hoverCapable = window.matchMedia('(hover: hover) and (pointer: fine)');
      const isSheet = () => window.matchMedia('(max-width: 1024px)').matches;
      let closeTimer = null;

      const setOpen = (open) => {
        dd.classList.toggle('open', open);
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      };

      toggle.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        setOpen(!dd.classList.contains('open'));
      });

      dd.addEventListener('mouseenter', () => {
        if (!hoverCapable.matches || isSheet()) return;
        clearTimeout(closeTimer);
        setOpen(true);
      });
      dd.addEventListener('mouseleave', () => {
        if (!hoverCapable.matches || isSheet()) return;
        closeTimer = setTimeout(() => setOpen(false), 180);
      });

      document.addEventListener('click', (e) => {
        if (!dd.contains(e.target)) setOpen(false);
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && dd.classList.contains('open')) {
          setOpen(false);
          toggle.focus();
        }
      });
      dd.querySelectorAll('a').forEach(a => a.addEventListener('click', () => setOpen(false)));
    }
  }

  customElements.define('global-navbar', GlobalNavbar);
})();
