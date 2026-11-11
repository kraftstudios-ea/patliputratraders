// ========================================
// BRUSH — Main Script
// ========================================

function initBrushMain() {

  // One shared request for the catalog. The search box, hero counter and
  // carousels all need it — previously each fired its own /products call
  // (and search fired one per keystroke).
  // Posters and tees are priced from the variant table shared with the
  // server (cart.js <-> Backend/productTypes.js), not from the stored price.
  const applyCatalogPrice = (p) => (typeof Cart !== 'undefined' && p ? { ...p, price: Cart.priceFor(p, null).price } : p);
  let _productsCachePromise = null;
  function getProducts() {
    if (_productsCachePromise) return _productsCachePromise;
    const loader = window.BrushCatalog
      ? window.BrushCatalog.getProducts()
      : fetch('/data/products.json')
          .then(r => r.ok ? r.json() : fetch(`${API_BASE}/products`).then(res => res.json()))
          .catch(() => fetch(`${API_BASE}/products`).then(res => res.json()));
    _productsCachePromise = loader.then(raw => {
      const list = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.products) ? raw.products : []);
      return list.map(applyCatalogPrice);
    });
    return _productsCachePromise;
  }
  window.BrushGetProducts = getProducts;

  // ---- Star ratings ----
  // One renderer for every read-only rating on the site (cards, modal
  // summary, review list): a CSS-masked star strip filled to the exact
  // average, so 4.3 shows as 4 full stars and a third.
  function ratingStats(p) {
    const list = (p && p.reviews) || [];
    const vals = list.map(r => Number(r.rating)).filter(v => v >= 1 && v <= 5);
    if (!vals.length) return { avg: 0, count: 0 };
    return { avg: vals.reduce((a, b) => a + b, 0) / vals.length, count: vals.length };
  }
  function starsHtml(value, extraClass = '') {
    const v = Math.max(0, Math.min(5, Number(value) || 0));
    return `<span class="stars ${extraClass}" style="--rating:${v.toFixed(2)}" role="img" aria-label="Rated ${v.toFixed(1)} out of 5"></span>`;
  }
  window.BrushStars = starsHtml;

  const keywordText = (k) => (Array.isArray(k) ? k.join(' ') : String(k || '')).toLowerCase();

  // Tees and hoodies are both garments with a back print worth leading on, so
  // every "is this apparel" check covers both types rather than the literal
  const isGarment = (p) => ['apparel', 'hoodie'].includes(String(p && p.productType || '').toLowerCase());
  const isSinglePosterProduct = (p) => {
    if (!p) return false;
    const t = String(p.productType || 'poster').toLowerCase().trim();
    const c = String(p.category || '').toLowerCase().trim();
    const isPack = t.includes('pack') || c.includes('pack') || c.includes('wall setup') || t.includes('split');
    const isMetal = t.includes('metal') || c.includes('metal');
    const isOther = ['apparel', 'hoodie', 'stickers', 'wallpapers', 'collectibles', 'tapestry', 'tapestries', 'digital assets'].some(x => t.includes(x) || c.includes(x));
    return !isPack && !isMetal && !isOther && (t === 'poster' || t === 'posters' || t === '' || !p.productType);
  };
  const isSplitProduct = (p) => {
    if (!p || Number(p.id) === 540) return false;
    const t = String(p.productType || '').toLowerCase().trim();
    const c = String(p.category || '').toLowerCase().trim();
    const name = String(p.name || '').toLowerCase();
    const img = String(p.image || '').toLowerCase();
    return t.includes('split') || t === 'poster_3_pack' || t === 'poster_2_pack' || name.includes('split') || name.includes('triptych') || img.includes('split');
  };

  const imgAttrsFor = (p, size, useApparelBack = false) => {
    if (useApparelBack && isGarment(p) && p.backImage) {
      if (window.BrushImg) {
        return BrushImg.urlAttrs(p.backImage, size);
      }
      return `src="${escapeHtml(p.backImage)}"`;
    }
    return window.BrushImg ? BrushImg.attrs(p, size) : `src="${escapeHtml(p.image)}"`;
  };

  // Anything rendered via innerHTML that ultimately came from another
  // shopper (review author/comment, most notably) must go through this
  // first — reviews are the one piece of user-generated content every
  // visitor to a product renders unauthenticated.
  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Shared across every decorative-motion feature below (hero parallax already
  // gates itself via window.lenis; category tilt and the carousel's internal
  // parallax gate directly on this).
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- Scroll lock (mobile menu, cart drawer, product modal) ----
  // Two things have to be true for the page to actually stop moving behind
  // an overlay, and until this rewrite only one of them was:
  //
  //  1. body { overflow: hidden } is NOT enough here. It only becomes the
  //     viewport's scroll behaviour when <html> has no overflow of its own —
  //     and styles.css sets `html { overflow-x: hidden }` (to kill a
  //     horizontal swipe on phones), which per spec computes the other axis
  //     to `auto`. So <html> is the scroll container, body's rule propagates
  //     nowhere, and window.scrollTo(0, 800) still scrolled the page with a
  //     product modal open — verified live.
  //  2. lenis.stop() only covers wheel/keyboard. Lenis does not smooth touch
  //     by default, so on a phone native touch scroll went straight through
  //     regardless.
  //
  // Together that is the reported bug: opening a product on a phone and
  // dragging scrolled the catalogue behind the modal instead of the modal.
  // The fix is the standard position:fixed lock — pin the body at its
  // current offset, hide overflow on <html>, and restore the exact scroll
  // position on unlock so the page doesn't jump back to the top.
  //
  // Reference-counted so if two overlays are open at once, the first one
  // closing doesn't unlock scroll out from under the other.
  let scrollLockCount = 0;
  let lockedScrollY = 0;

  function lockPageScroll() {
    scrollLockCount++;
    if (scrollLockCount > 1) return;
    lockedScrollY = window.scrollY || document.documentElement.scrollTop || 0;
    document.body.style.top = `-${lockedScrollY}px`;
    document.documentElement.classList.add('scroll-locked');
    if (window.lenis) window.lenis.stop();
  }

  // Everything that takes a lock. If none of these is actually open, the
  // page must not stay locked — this self-heals any counter drift (the
  // symptom was a page that stopped scrolling / responding after closing
  // a product on a phone).
  const LOCKING_OVERLAYS = '.product-modal.open, .cart-drawer.open, .nav-links.open, .store-facets-panel.open, .store-sort-sheet.open';

  function unlockPageScroll() {
    scrollLockCount = Math.max(0, scrollLockCount - 1);
    if (scrollLockCount > 0 && !document.querySelector(LOCKING_OVERLAYS)) scrollLockCount = 0;
    if (scrollLockCount === 0) releaseScrollLock();
  }

  function releaseScrollLock() {
    if (!document.documentElement.classList.contains('scroll-locked')) return;
    document.documentElement.classList.remove('scroll-locked');
    document.body.style.top = '';
    // While the body is pinned the document collapses to one viewport tall,
    // so scrollTo() would be clamped to ~0 if it ran before layout caught up.
    // Reading a layout property forces the reflow first.
    void document.documentElement.scrollHeight;
    // Jump straight back — going through Lenis here animates the restore
    // and reads as the page scrolling on its own after the overlay closes.
    window.scrollTo(0, lockedScrollY);
    if (window.lenis) {
      window.lenis.start();
      if (typeof window.lenis.scrollTo === 'function') window.lenis.scrollTo(lockedScrollY, { immediate: true });
    }
    // Closing the product modal runs history.back() (BrushBack), and the
    // browser's own scroll restoration for that entry lands a beat later and
    // snaps the page to the top. Re-apply once, and only to correct exactly
    // that failure — if the visitor has scrolled somewhere themselves in the
    // meantime, leave them alone.
    if (lockedScrollY > 8) {
      const restore = () => {
        if (document.documentElement.classList.contains('scroll-locked')) return;
        if (window.scrollY > 8) return;
        window.scrollTo(0, lockedScrollY);
        if (window.lenis && typeof window.lenis.scrollTo === 'function') {
          window.lenis.scrollTo(lockedScrollY, { immediate: true });
        }
      };
      setTimeout(restore, 0);
      setTimeout(restore, 140);
    }
  }

  // The navbar's mobile menu (global-navbar.js) shares this same counter.
  window.BrushScrollLock = { lock: lockPageScroll, unlock: unlockPageScroll };

  // ---- Preloader ----
  // ---- Preloader (Fast, zero-wait on repeat visits, syncs catalog + assets) ----
  const preloader = document.getElementById('preloader');
  if (preloader) {
    const hasVisited = typeof sessionStorage !== 'undefined' && sessionStorage.getItem('brush_visited');
    if (hasVisited) {
      preloader.remove();
      document.body.classList.remove('preloader-active');
    } else {
      const percentEl = document.getElementById('preloader-percent');
      const fillEl = document.getElementById('preloader-fill');
      const criticalImages = Array.from(document.querySelectorAll('.hero-slide.active img, .nav-brand img, .preloader-logo'));
      const total = Math.max(1, criticalImages.length);
      let loaded = 0;
      let finished = false;
      let catalogReady = false;

      function updateProgress() {
        const imgShare = (loaded / total) * 70;
        const catShare = catalogReady ? 30 : 0;
        const pct = Math.min(100, Math.round(imgShare + catShare));
        if (percentEl) percentEl.textContent = pct + '%';
        if (fillEl) fillEl.style.width = pct + '%';
        if (pct >= 100 || (catalogReady && loaded >= total)) hidePreloader();
      }

      function markLoaded() {
        loaded++;
        updateProgress();
      }

      function hidePreloader() {
        if (finished) return;
        finished = true;
        if (percentEl) percentEl.textContent = '100%';
        if (fillEl) fillEl.style.width = '100%';
        try { if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('brush_visited', '1'); } catch (_) {}
        preloader.classList.add('preloader-hidden');
        document.body.classList.remove('preloader-active');
        setTimeout(() => preloader.remove(), 400);
      }

      // Catalog warming sync
      if (window.BrushCatalog) {
        window.BrushCatalog.getProducts()
          .then(() => { catalogReady = true; updateProgress(); })
          .catch(() => { catalogReady = true; updateProgress(); });
      } else {
        catalogReady = true;
      }

      criticalImages.forEach(img => {
        if (img.complete && img.naturalWidth > 0) {
          markLoaded();
        } else {
          img.addEventListener('load', markLoaded, { once: true });
          img.addEventListener('error', markLoaded, { once: true });
        }
      });

      // Ceiling safety net: even on very slow networks, unlock page after 1800ms
      // and continue background streaming
      setTimeout(hidePreloader, 1800);
      updateProgress();
    }
  }

  // Navbar scroll behavior (scrolled-state, hide-on-scroll-down, scroll
  // progress) now lives in navbar-scroll.js, shared across every page with
  // a navbar — this reference is kept only because the anchor-scroll
  // handler further down still needs navbar.offsetHeight.
  const navbar = document.getElementById('navbar');


  // ---- Mobile menu toggle ----
  // Owned by global-navbar.js so it works on every page, including the
  // ones that don't load this script.


  // ---- Global Search ----
  const searchBtn = document.getElementById('search-btn');
  const searchOverlay = document.getElementById('search-overlay');
  const searchCloseBtn = document.getElementById('search-close-btn');
  const globalSearchForm = document.getElementById('global-search-form');
  const globalSearchInput = document.getElementById('global-search-input');
  const suggestionsBox = document.getElementById('search-suggestions');

  function openSearchOverlay() {
    const overlay = document.getElementById('search-overlay');
    const input = document.getElementById('global-search-input');
    if (!overlay) return;
    document.body.classList.add('search-overlay-open');
    document.body.classList.remove('custom-cursor-active');
    overlay.classList.add('open');
    if (typeof lockPageScroll === 'function') lockPageScroll();
    if (input) {
      input.focus({ preventScroll: true });
      requestAnimationFrame(() => {
        input.focus({ preventScroll: true });
      });
      setTimeout(() => {
        input.focus({ preventScroll: true });
      }, 50);
      if (input.value.trim().length > 0 && suggestionsBox && suggestionsBox.children.length > 0) {
        suggestionsBox.classList.add('active');
      }
    }
  }

  function closeSearchOverlay() {
    const overlay = document.getElementById('search-overlay');
    if (!overlay) return;
    overlay.classList.remove('open');
    document.body.classList.remove('search-overlay-open');
    if (window.matchMedia && window.matchMedia('(pointer: fine)').matches) {
      document.body.classList.add('custom-cursor-active');
    }
    if (typeof unlockPageScroll === 'function') unlockPageScroll();
    if (suggestionsBox) suggestionsBox.classList.remove('active');
  }

  if (searchBtn) {
    searchBtn.addEventListener('click', (e) => {
      e.preventDefault();
      openSearchOverlay();
    });
  }

  if (searchCloseBtn) {
    searchCloseBtn.addEventListener('click', (e) => {
      e.preventDefault();
      closeSearchOverlay();
    });
  }

  // Close on Escape
  if (searchOverlay) {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && searchOverlay.classList.contains('open')) {
        closeSearchOverlay();
      }
    });
  }

  if (globalSearchForm && globalSearchInput) {
    globalSearchForm.addEventListener('click', (e) => {
      if (e.target !== globalSearchInput && !e.target.closest('button')) {
        globalSearchInput.focus({ preventScroll: true });
      }
    });

    globalSearchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const query = globalSearchInput.value.trim();
      if (query) {
        window.location.href = 'all_products.html?search=' + encodeURIComponent(query);
      }
    });

    globalSearchInput.addEventListener('focus', () => {
      if (globalSearchInput.value.trim().length > 0 && suggestionsBox && suggestionsBox.children.length > 0) {
        suggestionsBox.classList.add('active');
      }
    });
  }
  
  if (globalSearchInput && suggestionsBox) {
    let searchDebounceTimer = null;
    globalSearchInput.addEventListener('input', (e) => {
      clearTimeout(searchDebounceTimer);
      const query = e.target.value.trim().toLowerCase();
      if (!query) {
        suggestionsBox.classList.remove('active');
        suggestionsBox.innerHTML = '';
        return;
      }
      
      // Instant 40ms debounce so completing alphabets immediately displays matching posters
      searchDebounceTimer = setTimeout(async () => {
        try {
          const products = await getProducts();
          if (globalSearchInput.value.trim().toLowerCase() !== query) return; // a newer keystroke owns the box

          // Ranked by the shared search engine (with prefix matching & popularity boost)
          let allMatched = [];
          if (window.BrushSearch) {
            if (!BrushSearch.__built) { BrushSearch.buildVocab(products); BrushSearch.__built = true; }
            const terms = BrushSearch.expand(query);
            const out = (p) => (p.stockQuantity !== undefined && p.stockQuantity !== null && Number(p.stockQuantity) <= 0 ? 1 : 0);
            allMatched = products
              .map(p => ({ p, s: BrushSearch.score(p, terms), out: out(p) }))
              .filter(x => x.s > 0)
              .sort((a, b) => a.out - b.out || b.s - a.s);
          } else {
            allMatched = products.filter(p => {
              const name = (p.name || '').toLowerCase();
              const cat = (p.category || '').toLowerCase();
              const keys = keywordText(p.keywords);
              return name.includes(query) || cat.includes(query) || keys.includes(query);
            }).map(p => ({ p, s: 1 }));
          }
          
          const totalCount = allMatched.length;
          const matched = allMatched.slice(0, 8).map(x => x.p);

          if (matched.length > 0) {
            suggestionsBox.innerHTML = `
              <div class="search-results-bar">
                <span class="search-results-count"><i class="fa-solid fa-sparkles"></i> ${totalCount} ${totalCount === 1 ? 'Poster' : 'Posters'} Found</span>
                <span class="search-results-hint">Click poster to preview • Press Enter for all</span>
              </div>
              <div class="search-results-grid">
                ${matched.map(p => `
                  <a href="all_products.html?product=${p.id}" class="search-product-card" data-product-id="${p.id}" data-name="${escapeHtml(p.name)}">
                    <div class="search-product-thumb">
                      <img ${imgAttrsFor(p, 480)} class="plain-product-image" onload="this.classList.add('loaded')" alt="${escapeHtml(p.name)}" loading="lazy">
                      ${p.badge ? `<span class="search-product-badge">${escapeHtml(p.badge)}</span>` : ''}
                    </div>
                    <div class="search-product-info">
                      <span class="search-product-cat">${escapeHtml(p.category || 'Poster')}</span>
                      <span class="search-product-title">${escapeHtml(p.name)}</span>
                      <span class="search-product-price">From ₹${p.price || 399}</span>
                    </div>
                  </a>
                `).join('')}
              </div>
              <a href="all_products.html?search=${encodeURIComponent(query)}" class="search-view-all-cta">
                <span>View all <strong>${totalCount}</strong> results in Store</span>
                <i class="fa-solid fa-arrow-right"></i>
              </a>
            `;
            suggestionsBox.classList.add('active');
          } else {
            suggestionsBox.innerHTML = `
              <div class="search-no-results">
                <i class="fa-solid fa-magnifying-glass search-empty-icon"></i>
                <p class="search-empty-title">No posters found matching “${escapeHtml(query)}”</p>
                <p class="search-empty-sub">Try exploring one of our popular collections:</p>
                <div class="search-chip-group">
                  <button type="button" class="search-quick-chip" data-query="Anime">Anime</button>
                  <button type="button" class="search-quick-chip" data-query="Motivation">Motivation</button>
                  <button type="button" class="search-quick-chip" data-query="Formula 1">F1</button>
                  <button type="button" class="search-quick-chip" data-query="Marvel">Marvel</button>
                  <button type="button" class="search-quick-chip" data-query="Minimalist">Minimalist</button>
                  <button type="button" class="search-quick-chip" data-query="Vintage">Vintage</button>
                </div>
              </div>
            `;
            suggestionsBox.classList.add('active');
          }
        } catch (err) {
          console.error('Search error', err);
        }
      }, 40);
    });

    // Interactivity inside suggestions: clicking a poster card opens modal directly without reload!
    suggestionsBox.addEventListener('click', (e) => {
      const chip = e.target.closest('.search-quick-chip');
      if (chip) {
        e.preventDefault();
        const q = chip.dataset.query;
        globalSearchInput.value = q;
        globalSearchInput.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }

      const card = e.target.closest('.search-product-card');
      if (card && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
        const pid = card.dataset.productId;
        const openFn = typeof window.BrushOpenProduct === 'function' ? window.BrushOpenProduct : (typeof openProductModal === 'function' ? openProductModal : null);
        if (pid && openFn) {
          e.preventDefault();
          closeSearchOverlay();
          openFn(pid);
        }
      }
    });

    document.addEventListener('click', (e) => {
      // Close suggestions
      if (!suggestionsBox.contains(e.target) && e.target !== globalSearchInput) {
        suggestionsBox.classList.remove('active');
      }
      
      // Close search overlay entirely (either click on the overlay backdrop, or outside completely)
      if (searchOverlay && searchOverlay.classList.contains('open')) {
        const searchContainer = searchOverlay.querySelector('.search-container');
        const clickedInsideContainer = searchContainer && searchContainer.contains(e.target);
        const clickedSearchBtn = searchBtn && searchBtn.contains(e.target);
        
        if (!clickedInsideContainer && !clickedSearchBtn) {
          closeSearchOverlay();
        }
      }
    });
  }


  // ---- Hero Slider ----
  // Live arrays, not a one-time NodeList: the slides are rebuilt from the
  // catalogue once it loads (see hydrateHeroFromCatalogue below).
  let slides = Array.from(document.querySelectorAll('.hero-slide'));
  let dots = Array.from(document.querySelectorAll('.hero-dot'));
  let currentSlide = 0;
  let slideInterval;

  // Hero slides 2 and 3 ship with data-src so they don't compete with the
  // first paint (see the comment on .hero-slider in index.html). Promote them
  // once the page is done loading, and immediately for any slide we're about
  // to show, so advancing early never lands on an empty frame.
  function loadSlideImage(slide) {
    if (!slide) return;
    const img = slide.querySelector('img[data-src]');
    if (!img) return;
    img.src = img.dataset.src;
    img.removeAttribute('data-src');
  }

  function loadRemainingSlides() {
    slides.forEach(loadSlideImage);
  }

  // Promote the rest when the browser is idle rather than the instant the
  // page loads: on a phone those slides are ~500 KB that nobody sees for the
  // first five seconds, and whoever bounces before then never pays for them.
  // goToSlide() still loads any slide it is about to show, so advancing early
  // (or tapping a dot) never lands on an empty frame.
  function schedulePromotion() {
    if ('requestIdleCallback' in window) requestIdleCallback(loadRemainingSlides, { timeout: 4000 });
    else setTimeout(loadRemainingSlides, 2500);
  }
  if (document.readyState === 'complete') {
    schedulePromotion();
  } else {
    window.addEventListener('load', schedulePromotion, { once: true });
  }

  function goToSlide(index) {
    loadSlideImage(slides[index]);
    slides.forEach(s => s.classList.remove('active'));
    dots.forEach(d => d.classList.remove('active'));
    currentSlide = index;
    slides[currentSlide].classList.add('active');
    dots[currentSlide].classList.add('active');
  }

  function nextSlide() {
    goToSlide((currentSlide + 1) % slides.length);
  }

  function startSlider() {
    if (slideInterval) clearInterval(slideInterval);
    if (slides.length <= 1) return;
    slideInterval = setInterval(() => {
      if (!document.hidden) nextSlide();
    }, 5000);
  }

  function resetSlider() {
    clearInterval(slideInterval);
    startSlider();
  }

  // Delegated so it keeps working after the dots are rebuilt.
  const heroDotsEl = document.getElementById('hero-dots');
  if (heroDotsEl) {
    heroDotsEl.addEventListener('click', (e) => {
      const dot = e.target.closest('.hero-dot');
      if (!dot) return;
      goToSlide(parseInt(dot.dataset.index, 10));
      resetSlider();
    });
  }

  const heroSliderEl = document.getElementById('hero-slider');
  if (heroSliderEl) {
    heroSliderEl.addEventListener('mouseenter', () => clearInterval(slideInterval));
    heroSliderEl.addEventListener('mouseleave', () => resetSlider());
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      clearInterval(slideInterval);
    } else {
      resetSlider();
    }
  });

  if (slides.length > 1) {
    startSlider();
  }

  // ---- Hero slides from the catalogue --------------------------------
  // Tick "Hero" on a product in the admin panel and its mockup joins the
  // landing slideshow, newest first — so a new poster set shows up on the
  // front page without anyone editing index.html. The first slide stays the
  // hardcoded one (it's the LCP image and must not wait on the API), and if
  // nothing is flagged, or the catalogue can't be reached, the built-in
  // slides stay exactly as they are.
  const HERO_MAX_DYNAMIC = 4;

  async function hydrateHeroFromCatalogue(injected) {
    const slider = document.getElementById('hero-slider');
    if (!slider || !heroDotsEl) return 0;

    let products = injected;
    if (!products) {
      try { products = await getProducts(); } catch (_) { return 0; }
    }
    const stamp = p => Date.parse(p.createdAt) || 0;
    const picks = (products || [])
      .filter(p => p && p.showInHero && p.image && !(window.BrushImg && BrushImg.isDummy(p)))
      .sort((a, b) => (stamp(b) - stamp(a)) || ((b.id || 0) - (a.id || 0)))
      .slice(0, HERO_MAX_DYNAMIC);
    if (!picks.length) return 0;

    clearInterval(slideInterval);
    // Keep slide 1, drop the rest of the hardcoded ones.
    slides.slice(1).forEach(s => s.remove());

    picks.forEach(p => {
      const src = window.BrushImg ? BrushImg.src(p, 1080) : p.image;
      const slide = document.createElement('div');
      slide.className = 'hero-slide';
      slide.innerHTML = `<img data-src="${escapeHtml(src)}" fetchpriority="low" decoding="async" width="1440" height="720" alt="${escapeHtml(p.name)} — ${escapeHtml(p.category || 'wall art')} by Brush" style="object-fit: cover;">`;
      slider.appendChild(slide);
    });

    slides = Array.from(slider.querySelectorAll('.hero-slide'));
    heroDotsEl.innerHTML = slides.map((_, i) =>
      `<button class="hero-dot${i === 0 ? ' active' : ''}" data-index="${i}" aria-label="Slide ${i + 1}"></button>`).join('');
    dots = Array.from(heroDotsEl.querySelectorAll('.hero-dot'));

    currentSlide = 0;
    goToSlide(0);
    startSlider();
    return picks.length;
  }

  // Exposed for a quick check from the console with a made-up list.
  window.BrushHeroSlides = hydrateHeroFromCatalogue;
  if (document.getElementById('hero-slider')) hydrateHeroFromCatalogue();


  // ---- Hero Parallax + Scroll Cue ----
  // Gated entirely on window.lenis existing, which is itself already the
  // single source of truth for "decorative scroll motion is appropriate
  // right now" — scroll.js refuses to create it under prefers-reduced-motion
  // or if the Lenis CDN script failed to load, so this block simply never
  // runs in either case rather than needing its own reduced-motion check.
  const heroEl = document.getElementById('hero');
  const heroContentEl = heroEl ? heroEl.querySelector('.hero-content') : null;
  const scrollCueEl = document.getElementById('scroll-cue');

  if (heroEl && window.lenis) {
    const updateHeroParallax = (scrollY) => {
      const heroHeight = heroEl.offsetHeight;
      if (scrollY > heroHeight) return; // nothing left to update once the hero is fully scrolled past

      const progress = Math.min(1, scrollY / heroHeight);

      if (heroSliderEl) {
        // Background lags behind the page scroll (classic parallax depth cue).
        // Safe from gaps: overflow:hidden on .hero clips both the shifted-away
        // top edge (always in the already-scrolled-past region, since this
        // multiplier keeps the shift smaller than scrollY itself) and the
        // shifted-in excess at the bottom.
        heroSliderEl.style.transform = `translateY(${scrollY * 0.3}px)`;
      }

      if (heroContentEl) {
        // Foreground content rises and fades faster than the scroll itself,
        // separating it visually from the (slower) background layer.
        heroContentEl.style.transform = `translateX(-50%) translateY(${scrollY * -0.18}px)`;
        heroContentEl.style.opacity = String(Math.max(0, 1 - progress * 1.3));
      }

      if (scrollCueEl) {
        scrollCueEl.classList.toggle('is-hidden', scrollY > 40);
      }
    };

    updateHeroParallax(window.lenis.scroll || 0);
    window.lenis.on('scroll', (e) => updateHeroParallax(e.scroll));
  }

  // Category card hover depth used to be a JS-driven cursor-tracked 3D tilt
  // (perspective()/rotateX/rotateY). Removed: animating that transform via
  // CSS transition reliably broke overflow:hidden clipping on the card's
  // .mockup-wrapper descendant in Chromium — the poster rendered unclipped
  // and the frame graphic disappeared, on every normal hover, not as an
  // edge case. Neither swapping scale3d() for 2D scale() nor forcing a
  // permanent compositing layer via will-change fixed it once the
  // transform was animated rather than set statically. Replaced with a
  // plain CSS translateY+scale hover (see .category-card:hover in
  // styles.css) — no JS needed for it at all.


  // ---- Hero Poster Counter ----
  // Counts up to the live product total, but never sits frozen at 0 —
  // if the backend (Render free tier) is cold-starting or unreachable,
  // it settles on a realistic fallback instead of stalling indefinitely.
  const posterCountEl = document.getElementById('poster-count-number');
  let posterCountResolved = false;

  function animateCounterTo(el, target) {
    const duration = 1400;
    const startTime = performance.now();
    const startValue = parseInt(el.textContent, 10) || 0;
    if (startValue === target) return;

    function tick(now) {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out-cubic
      const value = Math.round(startValue + (target - startValue) * eased);
      el.textContent = value;
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function reportPosterCount(count) {
    if (posterCountResolved || !posterCountEl || !count) return;
    posterCountResolved = true;
    animateCounterTo(posterCountEl, count);
  }

  // ---- Live Customer Rating Counter ----
  function updateLandingRatingDisplay(ratingVal) {
    const el = document.getElementById('hero-rating-value');
    if (!el) return;
    const num = parseFloat(ratingVal);
    if (!isNaN(num) && num >= 1 && num <= 5) {
      const formatted = num.toFixed(1);
      el.textContent = formatted;
      try {
        localStorage.setItem('brush_cached_rating', formatted);
      } catch (_) {}
    }
  }

  window.updateLandingRatingDisplay = updateLandingRatingDisplay;

  async function initLandingRatingStats() {
    const el = document.getElementById('hero-rating-value');
    if (!el) return;

    // Instant cached render
    try {
      const cached = localStorage.getItem('brush_cached_rating');
      if (cached) el.textContent = cached;
    } catch (_) {}

    try {
      const res = await fetch(`${API_BASE}/stats/rating`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.average) {
          updateLandingRatingDisplay(data.average);
        }
      }
    } catch (_) {}
  }
  window.initLandingRatingStats = initLandingRatingStats;

  // ---- Features strip figures ----
  // The strip claims a design count and a collection count; both are read off
  // the same catalogue payload the hero counter uses, so the page can never
  // advertise stock that is not there. If the catalogue never arrives the
  // figures stay as the em-dash they ship with rather than inventing a number.
  const statDesignsEl = document.getElementById('stat-designs');
  const statCollectionsEl = document.getElementById('stat-collections');

  function fillStatBand(products) {
    if (statDesignsEl) {
      statDesignsEl.textContent = '0';
      animateCounterTo(statDesignsEl, products.length);
    }
    if (statCollectionsEl) {
      const categories = new Set(
        products.map(p => (p && p.category ? String(p.category).trim() : '')).filter(Boolean)
      );
      statCollectionsEl.textContent = '0';
      animateCounterTo(statCollectionsEl, categories.size);
    }
  }

  if (posterCountEl || statDesignsEl || statCollectionsEl) {
    const FALLBACK_POSTER_COUNT = 523;
    const fallbackTimer = setTimeout(() => reportPosterCount(FALLBACK_POSTER_COUNT), 4000);

    getProducts()
      .then(products => {
        clearTimeout(fallbackTimer);
        reportPosterCount(products.length);
        fillStatBand(products);
      })
      .catch(() => {
        clearTimeout(fallbackTimer);
        reportPosterCount(FALLBACK_POSTER_COUNT);
      });
  }


  // ---- Product carousels (Bestsellers & New Arrivals) ----
  // Poster images drift a few px within their frame as the track scrolls —
  // cards near the track's center stay put, cards toward the edges shift
  // slightly, giving each card a small internal parallax as it slides past.
  // Skipped under reduced motion, same as every other scroll-tied effect.
  function updateCardParallax(track) {
    if (prefersReducedMotion) return;
    if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return;

    const trackRect = track.getBoundingClientRect();
    const trackCenterX = trackRect.left + trackRect.width / 2;

    // Read every card's position first, then write transforms in a second
    // pass — interleaving getBoundingClientRect() with style writes forces
    // a layout recalculation on every iteration instead of once.
    // Two card types share this: product cards (.mockup-poster, safe to
    // drive via .style.transform directly — nothing else there sets its
    // transform) and Wall Setup Packs (.ws-img-container img, which has its
    // own :hover scale() rule, so it's driven via a CSS custom property
    // instead — see .ws-img-container img in styles.css — so this doesn't
    // clobber that with an inline style).
    const updates = [];
    track.querySelectorAll('.mockup-poster').forEach((poster) => {
      const card = poster.closest('.product-card');
      if (!card) return;
      const cardRect = card.getBoundingClientRect();
      const cardCenterX = cardRect.left + cardRect.width / 2;
      const offset = Math.max(-6, Math.min(6, (cardCenterX - trackCenterX) * 0.015));
      updates.push({ img: poster, offset, viaProperty: false });
    });
    track.querySelectorAll('.ws-img-container img').forEach((img) => {
      const card = img.closest('.wall-setup-card');
      if (!card) return;
      const cardRect = card.getBoundingClientRect();
      const cardCenterX = cardRect.left + cardRect.width / 2;
      const offset = Math.max(-6, Math.min(6, (cardCenterX - trackCenterX) * 0.015));
      updates.push({ img, offset, viaProperty: true });
    });
    updates.forEach(({ img, offset, viaProperty }) => {
      if (viaProperty) {
        img.style.setProperty('--ws-parallax-x', `${offset}px`);
      } else {
        img.style.transform = `translateX(${offset}px)`;
      }
    });
  }

  function setupCarousel(trackId, prevId, nextId, counterId) {
    const track = document.getElementById(trackId);
    const prevBtn = document.getElementById(prevId);
    const nextBtn = document.getElementById(nextId);
    const counterEl = counterId ? document.getElementById(counterId) : null;

    if (!track || !prevBtn || !nextBtn) return () => {};

    function update() {
      const pageWidth = track.clientWidth;
      const totalPages = Math.max(1, Math.ceil(track.scrollWidth / pageWidth));
      const maxScroll = track.scrollWidth - pageWidth;
      // Use progress toward the max scrollable distance rather than a flat division —
      // the last page is often narrower than a full page, which would otherwise under-count it.
      const progress = maxScroll > 0 ? track.scrollLeft / maxScroll : 0;
      const currentPage = Math.min(totalPages, Math.round(progress * (totalPages - 1)) + 1);

      if (counterEl) {
        counterEl.textContent = totalPages > 1 ? `${currentPage} / ${totalPages}` : '';
      }
      prevBtn.disabled = track.scrollLeft <= 4;
      nextBtn.disabled = track.scrollLeft >= maxScroll - 4;
      updateCardParallax(track);
    }

    nextBtn.addEventListener('click', () => {
      track.scrollBy({ left: track.clientWidth, behavior: 'smooth' });
    });
    prevBtn.addEventListener('click', () => {
      track.scrollBy({ left: -track.clientWidth, behavior: 'smooth' });
    });
    track.addEventListener('scroll', () => requestAnimationFrame(update), { passive: true });
    window.addEventListener('resize', update);

    // Keyboard access: the rail is a focusable region, arrows move it by one
    // screenful (the same step the buttons take), Home/End jump to the ends.
    track.tabIndex = 0;
    track.setAttribute('role', 'region');
    if (!track.getAttribute('aria-label')) {
      const heading = track.closest('.products-section, section');
      const name = heading && heading.querySelector('.section-title');
      track.setAttribute('aria-label', `${name ? name.textContent.trim() : 'Products'} — use left and right arrow keys to browse`);
    }
    track.addEventListener('keydown', (e) => {
      const step = track.clientWidth;
      if (e.key === 'ArrowRight') { e.preventDefault(); track.scrollBy({ left: step, behavior: 'smooth' }); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); track.scrollBy({ left: -step, behavior: 'smooth' }); }
      else if (e.key === 'Home') { e.preventDefault(); track.scrollTo({ left: 0, behavior: 'smooth' }); }
      else if (e.key === 'End') { e.preventDefault(); track.scrollTo({ left: track.scrollWidth, behavior: 'smooth' }); }
    });

    update();
    return update;
  }

  const updateBestsellersCarousel = setupCarousel('product-list', 'bestsellers-prev', 'bestsellers-next', 'bestsellers-counter');
  const updateNewArrivalsCarousel = setupCarousel('scroll-track', 'scroll-prev', 'scroll-next', 'newarrival-counter');
  const updateGrossingCarousel = setupCarousel('grossing-track', 'grossing-prev', 'grossing-next', 'grossing-counter');
  setupCarousel('ws-track', 'ws-prev', 'ws-next', 'ws-counter');


  // ---- Scroll to Top button ----
  const scrollTopBtn = document.getElementById('scroll-top');

  if (scrollTopBtn) {
    // A scroll listener fired on every frame of every scroll just to compare one
    // number. An observer on a sentinel pinned 600px down the page answers the
    // same question, but the browser only calls back on the two frames where the
    // answer actually changes.
    const sentinel = document.createElement('div');
    sentinel.setAttribute('aria-hidden', 'true');
    sentinel.style.cssText = 'position:absolute;top:600px;left:0;width:1px;height:1px;pointer-events:none;';
    document.body.appendChild(sentinel);
    new IntersectionObserver(([entry]) => {
      scrollTopBtn.classList.toggle('visible', !entry.isIntersecting && entry.boundingClientRect.top < 0);
    }).observe(sentinel);

    scrollTopBtn.addEventListener('click', () => {
      if (window.lenis) window.lenis.scrollTo(0);
      else window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }


  // ---- Intersection Observer for fade-in animations ----
  // Hoisted (not block-scoped to the `if` below) and wrapped in a helper so
  // content injected later — the product carousels below fetch from the API
  // asynchronously, well after this initial pass — can opt into the same
  // real scroll-reveal instead of the old workaround of shipping it
  // pre-marked .visible (which skipped the animation entirely, and for the
  // same reason a .fade-in element hidden at observe-time never fires: see
  // the near-identical bug fixed in the category "View More" toggle).
  let revealObserver = null;

  function observeRevealElements(root = document) {
    const elements = root.querySelectorAll('.fade-in, .scale-in, .clip-reveal');
    if (revealObserver) {
      elements.forEach(el => revealObserver.observe(el));
    } else {
      elements.forEach(el => el.classList.add('visible'));
    }
  }

  if ('IntersectionObserver' in window) {
    revealObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          revealObserver.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.1,
      rootMargin: '0px 0px -40px 0px'
    });
  }

  observeRevealElements();


  // ---- Smooth scroll for anchor links ----
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      const targetId = this.getAttribute('href');
      if (targetId === '#') return;
      const target = document.querySelector(targetId);
      if (target) {
        e.preventDefault();
        const navHeight = navbar ? navbar.offsetHeight : 0;
        const targetPos = target.getBoundingClientRect().top + window.scrollY - navHeight - 10;
        // Route through Lenis when it's running — native scrollTo fights
        // Lenis's own rAF-driven position updates and produces a jitter.
        if (window.lenis) {
          window.lenis.scrollTo(targetPos);
        } else {
          window.scrollTo({ top: targetPos, behavior: 'smooth' });
        }
      }
    });
  });


  // ========================================
  // PRODUCT FETCHING & RENDERING
  // ========================================
  
  function toggleSection(sectionId, visible) {
    const section = document.getElementById(sectionId);
    if (section) section.style.display = visible ? '' : 'none';
  }

  async function loadProducts() {
    const productList = document.getElementById('product-list');
    const scrollTrack = document.getElementById('scroll-track');
    const grossingTrack = document.getElementById('grossing-track');

    if (!productList && !scrollTrack && !grossingTrack) return;

    // The skeleton cards already in the HTML stay up until real cards replace them.
    try {
      const products = await getProducts();

      reportPosterCount(products.length);

      // Homepage placement is curated from real customer orders (Evan, Atharv, Arya)
      // Real artwork first — priority ordered for high-conversion visual balance
      const realFirst = (a, b) => (BrushImg.isDummy(a) ? 1 : 0) - (BrushImg.isDummy(b) ? 1 : 0);
      const BESTSELLER_PRIORITY = [
        122, 135, 504, 143, 345, 619, 614, 535, 153, 133, 157, 208, 156, 313, 206, 529,
        223, 533, 177, 532, 137, 337, 134, 294, 144, 2, 4, 6, 43, 318, 302, 307
      ];
      const bsRank = id => {
        const idx = BESTSELLER_PRIORITY.indexOf(Number(id));
        return idx === -1 ? 999 : idx;
      };
      // Bestsellers with progressive fallback to top-rated posters if fewer than 8
      let bestSellers = products
        .filter(p => p.showInBestsellers)
        .sort((a, b) => realFirst(a, b) || (bsRank(a.id) - bsRank(b.id)));

      if (bestSellers.length < 8) {
        const bsIds = new Set(bestSellers.map(p => Number(p.id)));
        const fallbackPosters = products
          .filter(p => isSinglePosterProduct(p) && !BrushImg.isDummy(p) && !bsIds.has(Number(p.id)))
          .sort((a, b) => (Number(b.orderFrequency) || 0) - (Number(a.orderFrequency) || 0) || (Number(b.id) - Number(a.id)));
        bestSellers = bestSellers.concat(fallbackPosters.slice(0, 8 - bestSellers.length));
      }

      // New Arrivals: descending chronological order without restrictive date cutoffs
      const stamp = p => {
        if (!p) return 0;
        if (p.createdAt) {
          const t = Date.parse(p.createdAt);
          if (!isNaN(t) && t > 0) return t;
        }
        if (p.updatedAt) {
          const t = Date.parse(p.updatedAt);
          if (!isNaN(t) && t > 0) return t;
        }
        return (Number(p.id) || 0) * 1000;
      };
      const newestFirst = (a, b) => (stamp(b) - stamp(a)) || ((Number(b.id) || 0) - (Number(a.id) || 0));

      const isPriorityArrival = p => Boolean(p.showInNewArrivals || p.category === 'Original Movie Posters' || p.category === 'Movies & TV');
      let newArrivals = products
        .filter(p => isSinglePosterProduct(p) && !BrushImg.isDummy(p) && (p.stockQuantity === undefined || p.stockQuantity > 0))
        .sort((a, b) => {
          const tierA = isPriorityArrival(a) ? 1 : 2;
          const tierB = isPriorityArrival(b) ? 1 : 2;
          if (tierA !== tierB) return tierA - tierB;
          return newestFirst(a, b);
        });

      // Top Grossing with progressive fallback
      let grossingPicks = products.filter(p => p.showInGrossing).sort(realFirst);
      if (grossingPicks.length < 8) {
        const grossIds = new Set(grossingPicks.map(p => Number(p.id)));
        const fallbackGross = products
          .filter(p => !BrushImg.isDummy(p) && !grossIds.has(Number(p.id)))
          .sort((a, b) => (Number(b.orderFrequency) || 0) - (Number(a.orderFrequency) || 0));
        grossingPicks = grossingPicks.concat(fallbackGross.slice(0, 8 - grossingPicks.length));
      }

      const createProductCard = (p, delayIndex = 0, badge = 'Sale', badgeBg = '', isEager = false) => {
        const delayClass = delayIndex > 0 ? `fade-in-delay-${delayIndex}` : '';
        const rawBadge = p.badge || badge;
        const displayBadge = (/new/i.test(rawBadge) || p.showInNewArrivals) ? (rawBadge || 'New') : rawBadge;
        const badgeStyle = badgeBg ? `style="background: ${badgeBg}; color: var(--bg-primary);"` : '';
        const discountPercentage = p.originalPrice > p.price ? Math.round(((p.originalPrice - p.price) / p.originalPrice) * 100) : 0;

        const stockQty = p.stockQuantity !== undefined ? p.stockQuantity : 50;
        const isOut = stockQty <= 0;
        const isSinglePoster = isSinglePosterProduct(p);
        const isMetalPoster = String(p.productType || '').toLowerCase().includes('metal') && Boolean(p.designImage);
        const isSplit = isSplitProduct(p);
        const isSplit2 = isSplit && (String(p.productType || '').includes('2') || String(p.name || '').includes('2-Pack') || String(p.name || '').includes('2 Piece') || [738, 739, 740].includes(Number(p.id)));
        const splitCardClass = isSplit ? (isSplit2 ? 'is-split-card is-split-2' : 'is-split-card is-split-3') : '';
        const specLine = isSplit
          ? `<span><i class="fa-solid fa-layer-group"></i> Multi-Piece Setup</span><span><i class="fa-solid fa-truck-fast"></i> Fast Dispatch</span>`
          : (isSinglePoster
            ? `<span><i class="fa-solid fa-gem"></i> 300 GSM Matte</span><span><i class="fa-solid fa-truck-fast"></i> Fast Dispatch</span>`
            : `<span><i class="fa-solid fa-gem"></i> Premium Quality</span><span><i class="fa-solid fa-truck-fast"></i> Fast Dispatch</span>`);

        const loadAttr = isEager ? 'fetchpriority="high"' : 'loading="lazy"';
        const cardImgSize = isSplit ? 1080 : 480;
        const imgAttrs = `${imgAttrsFor(p, cardImgSize, true)} ${loadAttr} decoding="async" width="480" height="600" onload="this.classList.add('loaded')"`;
        const safeName = escapeHtml(p.name);

        let extraImgClass = '';
        if (isGarment(p)) {
          extraImgClass = 'apparel-card-img';
        } else if (p.productType === 'Collectibles') {
          extraImgClass = 'collectible-card-img';
        }


        return `
          <div class="product-card ${delayClass} ${splitCardClass}" data-id="${escapeHtml(p.id)}" data-name="${safeName}" data-price="${Number(p.price) || 0}" data-original="${Number(p.originalPrice) || Number(p.price) || 0}" data-image="${escapeHtml(BrushImg.original(p))}" data-stock="${Number(stockQty) || 0}" data-product-type="${escapeHtml(p.productType || 'poster')}">
            <div class="product-card-image">
              <img class="plain-product-image ${extraImgClass}" alt="${safeName}" ${imgAttrs}>
              ${isMetalPoster ? `<img class="product-card-hover-mockup metal-artwork-hover" data-mockup="/${escapeHtml(encodeURI(p.designImage))}" alt="${safeName} Artwork" width="480" height="600" loading="lazy" decoding="async">` : (isSinglePoster ? `<img class="product-card-hover-mockup" data-mockup="/img/framed-mockups/${escapeHtml(p.id)}.webp" alt="${safeName} Framed on Spacejoy Wall" width="480" height="600" loading="lazy" decoding="async">` : '')}
              ${isSplit ? `<span class="split-view-badge"><i class="fa-solid fa-expand"></i> Room View</span>` : ''}
              ${displayBadge ? `<span class="product-badge" ${badgeStyle}>${escapeHtml(displayBadge)}</span>` : ''}
              <div class="product-quick-actions">
                <div class="product-card-specs">
                  ${specLine}
                </div>
                <button class="quick-add-btn" ${isOut ? 'disabled style="background: rgba(0,0,0,0.8); color: var(--text-muted); cursor: not-allowed;"' : ''}>
                  ${isOut ? (p.productType === 'apparel' || p.productType === 'hoodie' ? 'Will be in stock soon' : 'Out of Stock') : 'Add to Cart'}
                </button>
              </div>
            </div>
            <div class="product-card-info">
              <h3>${safeName}</h3>
              ${(() => { const r = ratingStats(p); return r.count ? `<div class="card-rating">${starsHtml(r.avg, 'stars-sm')}<span>${r.avg.toFixed(1)} (${r.count})</span></div>` : ''; })()}
              <div class="product-pricing">
                <span class="price-current">₹${p.price}</span>
                ${p.originalPrice > p.price ? `<span class="price-original">₹${p.originalPrice}</span>` : ''}
                ${discountPercentage > 0 ? `<span class="price-discount">${discountPercentage}% OFF</span>` : ''}
              </div>
            </div>
          </div>
        `;
      };

      toggleSection('bestsellers', bestSellers.length > 0);
      if (productList) {
        productList.innerHTML = bestSellers.map((p, i) => createProductCard(p, i % 4, 'Trending', '', i < 4)).join('');
        observeRevealElements(productList);
      }

      toggleSection('newarrival', newArrivals.length > 0);
      if (scrollTrack) {
        scrollTrack.innerHTML = newArrivals.map((p, i) => createProductCard(p, 0, 'New', 'var(--accent)', i < 4)).join('');
        observeRevealElements(scrollTrack);
      }

      toggleSection('grossing-picks', grossingPicks.length > 0);
      if (grossingTrack) {
        grossingTrack.innerHTML = grossingPicks.map((p, i) => createProductCard(p, i % 4, 'Trending', '', false)).join('');
        observeRevealElements(grossingTrack);
      }

      updateBestsellersCarousel();
      updateNewArrivalsCarousel();
      updateGrossingCarousel();
      if (typeof ScrollTrigger !== 'undefined') ScrollTrigger.refresh();

      // Top 6 New Arrivals Landing Page Popup
      initNewArrivalsPopup(products, createProductCard);

    } catch (err) {
      console.error('Error loading products:', err);
      const msg = '<p class="products-error">Products are taking a moment to load. Please refresh in a few seconds.</p>';
      [productList, scrollTrack, grossingTrack].forEach(t => { if (t) t.innerHTML = msg; });
    }
  }

  // ========================================
  // NEW ARRIVALS LANDING PAGE POPUP
  // ========================================
  let arrivalsPopupInitialized = false;
  function initNewArrivalsPopup(products, createCardFn) {
    if (arrivalsPopupInitialized) return;

  // 10-minute cooldown check across page visits
  const POPUP_COOLDOWN_MS = 10 * 60 * 1000;
  try {
    const lastShown = localStorage.getItem('brush_new_arrivals_last_shown');
    if (lastShown && (Date.now() - Number(lastShown) < POPUP_COOLDOWN_MS)) {
      return;
    }
  } catch (_) {}

    // Only run if the popup elements exist in DOM (landing page)
    const overlay = document.getElementById('arrivals-popup-overlay');
    const modal = document.getElementById('arrivals-popup-modal');
    const grid = document.getElementById('arrivals-popup-grid');
    const closeBtn = document.getElementById('arrivals-popup-close-btn');
    const dismissBtn = document.getElementById('arrivals-popup-dismiss-btn');
    const ctaBtn = document.getElementById('arrivals-popup-cta-btn');

    if (!overlay || !modal || !grid) return;
    arrivalsPopupInitialized = true;

    // Filter top 6 newest poster arrivals
    const stamp = p => Date.parse(p.createdAt) || 0;
    const isPoster = p => isSinglePosterProduct(p) && !(typeof BrushImg !== 'undefined' && BrushImg.isDummy && BrushImg.isDummy(p)) && (p.stockQuantity === undefined || p.stockQuantity > 0);

    const top6Posters = products
      .filter(isPoster)
      .sort((a, b) => {
        const diff = stamp(b) - stamp(a);
        if (diff !== 0) return diff;
        return (Number(b.id) || 0) - (Number(a.id) || 0);
      })
      .slice(0, 6);

    if (top6Posters.length === 0) return;

    // Render creative Studio Wall layout: Featured Hero Spotlight + Curated Wall Cluster
    const container = document.getElementById('arrivals-popup-body') || grid;
    const hero = top6Posters[0];
    const companions = top6Posters.slice(1);

    const getPricing = p => {
      const orig = Number(p.originalPrice) > Number(p.price) ? Number(p.originalPrice) : 99;
      const curr = Number(p.price) || 29;
      const disc = Math.round(((orig - curr) / orig) * 100);
      return { orig, curr, disc };
    };

    const heroPricing = getPricing(hero);
    const heroSafeName = escapeHtml(hero.name);
    const heroImgAttrs = `${imgAttrsFor(hero, 480, false)} fetchpriority="high" decoding="async" width="480" height="600"`;
    const heroMockup = `/img/framed-mockups/${escapeHtml(hero.id)}.webp`;
    const heroOrigImg = (typeof BrushImg !== 'undefined' && BrushImg.original) ? BrushImg.original(hero) : (hero.image || '');

    // Signature washi masking tape colors
    const tapeColors = [
      'rgba(253, 224, 71, 0.94)',  // classic washi yellow
      'rgba(56, 189, 248, 0.90)',  // neon sky blue
      'rgba(251, 113, 133, 0.92)', // pastel coral pink
      'rgba(253, 224, 71, 0.94)',  // classic washi yellow
      'rgba(167, 139, 250, 0.90)'  // electric lavender
    ];
    const rotations = [-1.4, 1.2, -0.9, 1.5, -1.1];

    const companionCardsHtml = companions.map((p, idx) => {
      const pricing = getPricing(p);
      const safeName = escapeHtml(p.name);
      const imgAttrs = `${imgAttrsFor(p, 480, false)} fetchpriority="high" decoding="async" width="480" height="600"`;
      const mockupSrc = `/img/framed-mockups/${escapeHtml(p.id)}.webp`;
      const origImg = (typeof BrushImg !== 'undefined' && BrushImg.original) ? BrushImg.original(p) : (p.image || '');
      const rot = rotations[idx % rotations.length];
      const tapeBg = tapeColors[idx % tapeColors.length];
      const tapeRot = (idx % 2 === 0 ? -1.8 : 1.4);

      return `
        <div class="product-card arrivals-tape-card" style="--card-rot: ${rot}deg;" data-id="${escapeHtml(p.id)}" data-name="${safeName}" data-price="${pricing.curr}" data-original="${pricing.orig}" data-image="${escapeHtml(origImg)}" data-stock="${p.stockQuantity || 50}" data-product-type="poster">
          <div class="arrivals-card-tape" style="background: ${tapeBg}; transform: translateX(-50%) rotate(${tapeRot}deg);" aria-hidden="true"></div>
          <div class="product-card-image arrivals-tape-image">
            <img class="plain-product-image loaded" alt="${safeName}" ${imgAttrs}>
            <img class="product-card-hover-mockup arrivals-card-hover-mockup" data-mockup="${mockupSrc}" src="${mockupSrc}" alt="${safeName} Framed on Spacejoy Wall" width="480" height="600" loading="lazy" decoding="async">
            <span class="arrivals-mini-badge">#0${idx + 2}</span>
            <button class="quick-add-btn arrivals-quick-add" type="button" aria-label="Add ${safeName} to cart">
              <i class="fa-solid fa-plus"></i>
            </button>
          </div>
          <div class="product-card-info arrivals-tape-info">
            <h4 class="arrivals-tape-title" title="${safeName}">${safeName}</h4>
            <div class="product-pricing arrivals-tape-pricing">
              <span class="price-current">₹${pricing.curr}</span>
              <span class="price-original">₹${pricing.orig}</span>
              <span class="price-discount">${pricing.disc}% OFF</span>
            </div>
          </div>
        </div>`;
    }).join('');

    container.innerHTML = `
      <div class="arrivals-studio-layout">
        <!-- Left: Hero Spotlight Poster -->
        <div class="arrivals-spotlight-wrapper">
          <div class="product-card arrivals-spotlight-card" data-id="${escapeHtml(hero.id)}" data-name="${heroSafeName}" data-price="${heroPricing.curr}" data-original="${heroPricing.orig}" data-image="${escapeHtml(heroOrigImg)}" data-stock="${hero.stockQuantity || 50}" data-product-type="poster">
            <div class="arrivals-spotlight-tape" aria-hidden="true"></div>
            <div class="arrivals-spotlight-badge">★ TOP DROP</div>
            <div class="product-card-image arrivals-spotlight-image">
              <img class="plain-product-image loaded" alt="${heroSafeName}" ${heroImgAttrs}>
              <img class="product-card-hover-mockup arrivals-card-hover-mockup" data-mockup="${heroMockup}" src="${heroMockup}" alt="${heroSafeName} Framed on Spacejoy Wall" width="480" height="600" loading="lazy" decoding="async">
              <span class="arrivals-spotlight-hint"><i class="fa-solid fa-eye"></i> Hover for room view</span>
            </div>
            <div class="product-card-info arrivals-spotlight-info">
              <div class="arrivals-spotlight-meta">
                <span class="arrivals-spotlight-spec"><i class="fa-solid fa-gem"></i> 300 GSM MATTE PRINT</span>
                <h3 class="arrivals-spotlight-title" title="${heroSafeName}">${heroSafeName}</h3>
              </div>
              <div class="arrivals-spotlight-actions">
                <div class="arrivals-spotlight-pricing">
                  <span class="price-current">₹${heroPricing.curr}</span>
                  <span class="price-original">₹${heroPricing.orig}</span>
                  <span class="price-discount">${heroPricing.disc}% OFF</span>
                </div>
                <button class="quick-add-btn arrivals-spotlight-btn" type="button" aria-label="Add ${heroSafeName} to cart">
                  <i class="fa-solid fa-cart-plus"></i>
                  <span>Add to Cart</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Right: Studio Wall Cluster -->
        <div class="arrivals-wall-section">
          <div class="arrivals-wall-bar">
            <div class="arrivals-wall-label">
              <i class="fa-solid fa-palette"></i>
              <span>Studio Wall Picks</span>
              <span class="arrivals-wall-pill">5 More New Prints</span>
            </div>
            <div class="arrivals-sticky-badge">
              <span class="sticky-pin"></span>
              <span>BUY 5, <strong>GET 1 FREE</strong>!</span>
            </div>
          </div>
          <div class="arrivals-tape-grid" id="arrivals-popup-grid">
            ${companionCardsHtml}
          </div>
          <div class="arrivals-mobile-hint">
            <i class="fa-solid fa-arrows-left-right"></i> Swipe to explore all 5 companion prints
          </div>
        </div>
      </div>
    `;

    observeRevealElements(container);

    function openPopup() {
      // Don't interrupt if another modal or drawer is active
      const activeModal = document.querySelector('.product-modal.open, .cart-drawer.open, .auth-modal.active, .search-overlay.open');
      if (activeModal) return;

      try {
        localStorage.setItem('brush_new_arrivals_last_shown', String(Date.now()));
      } catch (_) {}

      overlay.classList.add('is-open');
      modal.classList.add('is-open');
      overlay.setAttribute('aria-hidden', 'false');
      modal.setAttribute('aria-hidden', 'false');
      lockPageScroll();
    }

    function closePopup() {
      overlay.classList.remove('is-open');
      modal.classList.remove('is-open');
      overlay.setAttribute('aria-hidden', 'true');
      modal.setAttribute('aria-hidden', 'true');
      unlockPageScroll();
    }

    closeBtn?.addEventListener('click', closePopup);
    dismissBtn?.addEventListener('click', closePopup);
    overlay.addEventListener('click', closePopup);

    ctaBtn?.addEventListener('click', (e) => {
      closePopup();
      const newArrivalsSection = document.getElementById('newarrival');
      if (newArrivalsSection) {
        e.preventDefault();
        newArrivalsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.classList.contains('is-open')) {
        closePopup();
      }
    });

    // Clicking a product card opens product modal; close popup so they don't stack
    modal.addEventListener('click', (e) => {
      const card = e.target.closest('.product-card');
      if (card && !e.target.closest('.quick-add-btn')) {
        closePopup();
      }
    });

    // Trigger popup fast after preloader dismisses (or immediately if already cleared)
    let triggered = false;
    const triggerNow = () => {
      if (triggered) return;
      triggered = true;
      setTimeout(openPopup, 180);
    };

    const preloader = document.getElementById('preloader');
    const isPreloaderActive = preloader && document.body.contains(preloader) && !preloader.classList.contains('preloader-hidden') && document.body.classList.contains('preloader-active');

    if (isPreloaderActive) {
      const obs = new MutationObserver(() => {
        if (!document.body.contains(preloader) || preloader.classList.contains('preloader-hidden') || !document.body.classList.contains('preloader-active')) {
          obs.disconnect();
          triggerNow();
        }
      });
      obs.observe(preloader, { attributes: true, attributeFilter: ['class'] });
      obs.observe(document.body, { attributes: true, attributeFilter: ['class'] });
      // Unconditional fallback: trigger after max 900ms regardless
      setTimeout(() => {
        obs.disconnect();
        triggerNow();
      }, 900);
    } else {
      triggerNow();
    }
  }

  loadProducts();
  window.addEventListener('brush:catalog-updated', () => loadProducts());
  initLandingRatingStats();


  // ========================================
  // CART SYSTEM INTEGRATION
  // ========================================

  if (typeof Cart === 'undefined') return; // Cart module not loaded

  const cartDrawer = document.getElementById('cart-drawer');
  const cartOverlay = document.getElementById('cart-overlay');
  const cartCloseBtn = document.getElementById('cart-close-btn');
  const cartContinueBtn = document.getElementById('cart-continue-btn');
  const cartBody = document.getElementById('cart-drawer-body');
  const cartFooter = document.getElementById('cart-drawer-footer');
  const cartDrawerCount = document.getElementById('cart-drawer-count');
  const cartSubtotal = document.getElementById('cart-subtotal');
  const cartShipping = document.getElementById('cart-shipping');
  const cartTotal = document.getElementById('cart-total');
  const navCartCount = document.querySelector('.cart-count');
  const toast = document.getElementById('toast');
  const toastText = document.getElementById('toast-text');


  // ---- Open / Close cart drawer ----
  function openCart() {
    // openCart() is also called as a "flash the drawer" nudge after Add to
    // Cart even when it's already open — only acquire the lock on a genuine
    // closed->open transition, or a second nudge while already open would
    // double-lock and leave scroll stuck after a single close.
    const wasOpen = cartDrawer.classList.contains('open');
    cartDrawer.classList.add('open');
    cartOverlay.classList.add('open');
    if (!wasOpen) {
      lockPageScroll();
      if (window.BrushBack) BrushBack.opened('cart');
    }
  }

  function closeCart(fromHistory) {
    const wasOpen = cartDrawer.classList.contains('open');
    cartDrawer.classList.remove('open');
    cartOverlay.classList.remove('open');
    if (wasOpen) {
      unlockPageScroll();
      if (fromHistory !== true && window.BrushBack) BrushBack.closed('cart', { navigating: closeCart.navigating });
    }
  }
  if (window.BrushBack && cartDrawer) BrushBack.register('cart', () => closeCart(true), () => cartDrawer.classList.contains('open'));

  // Cart icon in navbar opens drawer
  const cartNavBtn = document.querySelector('.nav-action-btn[aria-label="Cart"]');
  if (cartNavBtn) {
    cartNavBtn.addEventListener('click', (e) => {
      e.preventDefault();
      openCart();
    });
  }

  // ---- Fly to cart ----
  // Clones the poster image being added, flies it from its current on-screen
  // position to the cart icon, then pops the icon on arrival. Purely
  // decorative feedback layered on top of the real add-to-cart logic below,
  // so it's gated behind prefers-reduced-motion like the rest of this site's
  // decorative motion (cursor, magnetic buttons, parallax).
  function flyToCart(sourceImgEl) {
    if (prefersReducedMotion || !cartNavBtn || !sourceImgEl) return;

    const startRect = sourceImgEl.getBoundingClientRect();
    const endRect = cartNavBtn.getBoundingClientRect();
    if (startRect.width === 0 || startRect.height === 0) return;

    const clone = document.createElement('img');
    clone.src = sourceImgEl.currentSrc || sourceImgEl.src;
    clone.className = 'fly-to-cart-clone';
    clone.style.top = `${startRect.top}px`;
    clone.style.left = `${startRect.left}px`;
    clone.style.width = `${startRect.width}px`;
    clone.style.height = `${startRect.height}px`;
    document.body.appendChild(clone);

    void clone.offsetWidth; // force layout so the transform below transitions instead of jumping straight there

    const dx = (endRect.left + endRect.width / 2) - (startRect.left + startRect.width / 2);
    const dy = (endRect.top + endRect.height / 2) - (startRect.top + startRect.height / 2);
    clone.style.transform = `translate(${dx}px, ${dy}px) scale(0.12) rotate(8deg)`;
    clone.style.opacity = '0.25';

    clone.addEventListener('transitionend', () => {
      clone.remove();
      cartNavBtn.classList.add('cart-pop');
      setTimeout(() => cartNavBtn.classList.remove('cart-pop'), 400);
    }, { once: true });
  }

  if (cartCloseBtn) cartCloseBtn.addEventListener('click', closeCart);
  if (cartOverlay) cartOverlay.addEventListener('click', closeCart);
  if (cartContinueBtn) cartContinueBtn.addEventListener('click', closeCart);

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && cartDrawer.classList.contains('open')) {
      closeCart();
    }
  });


  // ---- Toast notification ----
  let toastTimer;
  const toastCartBtn = document.getElementById('toast-cart-btn');
  if (toastCartBtn) {
    toastCartBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (toast) toast.classList.remove('visible');
      openCart();
    });
  }

  function showToast(message, options = {}) {
    if (!toast || !toastText) return;
    toastText.textContent = message;
    if (toastCartBtn) {
      toastCartBtn.style.display = options.showCartBtn === false ? 'none' : 'inline-flex';
    }
    toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('visible');
    }, options.duration || 3200);
  }
  // The reach-out forms call showToast() from inline onsubmit handlers,
  // which only see globals.
  window.showToast = showToast;


  // One-line variant description for a cart line item, e.g. "A4 · 80 GSM"
  // or "10" Round" — reads Cart's shared PRODUCT_TYPES config so labels
  // stay in sync with whatever the modal actually offered.
  function formatCartVariantLine(item) {
    if (!item.variants) return '';
    const typeConfig = Cart.typeConfigFor(item.productType || 'poster');
    return typeConfig.variantGroups
      .filter(group => item.variants[group.key] !== undefined)
      .map(group => {
        const option = group.options.find(o => o.value === item.variants[group.key]);
        // Option labels are ours; the fallback is whatever is sitting in the
        // visitor's localStorage cart, so it is escaped at every render site.
        return option ? option.label : String(item.variants[group.key]);
      })
      .join(' · ');
  }

  // ---- Cart add-ons -------------------------------------------------
  // Filter strictly in-stock products; all stickers are out-of-stock and
  // should never appear in suggestions or add-ons.
  let addOnPool = null;
  async function getAddOnPool() {
    if (addOnPool) return addOnPool;
    try {
      const products = await getProducts();
      const sellable = products.filter(p => {
        const stock = Number(p.stockQuantity ?? p.stock ?? 0);
        const isOutOfStock = p.outOfStock === true || p.inStock === false || stock <= 0;
        const isSticker = /sticker/i.test(String(p.productType || '')) ||
                          /sticker/i.test(String(p.category || '')) ||
                          /sticker/i.test(String(p.name || ''));
        return !isOutOfStock && !isSticker && !(window.BrushImg && BrushImg.isDummy(p));
      });
      addOnPool = sellable.slice().sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0)).slice(0, 10);
      addOnPool.isStickers = false;
    } catch (_) {
      addOnPool = [];
    }
    return addOnPool;
  }

  async function renderCartAddOns(items) {
    if (!cartBody) return;
    const pool = await getAddOnPool();
    const inCart = new Set(items.map(i => String(i.id)));
    const picks = pool.filter(p => !inCart.has(String(p.id))).slice(0, 3);
    const existing = document.getElementById('cart-addons');
    if (!picks.length || !items.length) { if (existing) existing.remove(); return; }

    const html = `
      <div class="cart-addons" id="cart-addons">
        <h4>${pool.isStickers ? 'Add a sticker sheet' : 'Add one more'}</h4>
        <div class="cart-addons-row">
          ${picks.map(p => `
            <button type="button" class="cart-addon" data-addon-id="${escapeHtml(p.id)}">
              <img ${window.BrushImg ? BrushImg.urlAttrs(p.image, 480) : `src="${escapeHtml(p.image)}"`} alt="" loading="lazy" decoding="async">
              <span class="cart-addon-name">${escapeHtml(p.name.replace(/ Sticker Sheet$/i, ''))}</span>
              <span class="cart-addon-price">₹${p.price} <i class="fa-solid fa-plus"></i></span>
            </button>`).join('')}
        </div>
      </div>`;
    if (existing) existing.outerHTML = html;
    else cartBody.insertAdjacentHTML('beforeend', html);

    document.querySelectorAll('#cart-addons .cart-addon').forEach(btn => {
      btn.addEventListener('click', async () => {
        const product = (await getAddOnPool()).find(p => String(p.id) === btn.dataset.addonId);
        if (!product) return;
        Cart.addItem(product, 1);
        showToast(`${product.name} added to cart!`);
      });
    });
  }

  // Helper for dynamic poster milestone toasts
  function getPosterMilestoneMsg(totalCount) {
    if (totalCount < 5) {
      const diff = 6 - totalCount;
      return `Added to cart! 🎁 Add ${diff} more to get Buy 5 Get 6 (1 FREE)!`;
    }
    if (totalCount === 5) {
      return `🎉 Offer unlocked! Add your free poster!`;
    }
    if (totalCount === 6) {
      return `🎉 Buy 5 Get 1 Free Unlocked! Lowest priced poster is FREE!`;
    }
    if (totalCount < 10) {
      const diff = 13 - totalCount;
      return `Added to cart! 🎁 Add ${diff} more for Buy 10 Get 3 Free!`;
    }
    if (totalCount === 10) {
      return `🎉 Offer unlocked! Add your 3 free posters!`;
    }
    if (totalCount === 11) {
      return `🎉 Offer unlocked! Add 2 more free posters!`;
    }
    if (totalCount === 12) {
      return `🎉 Offer unlocked! Add your free poster!`;
    }
    if (totalCount === 13) {
      return `🎉 Buy 10 Get 3 Free Unlocked! 3 lowest priced posters are FREE!`;
    }
    if (totalCount < 20) {
      const diff = 24 - totalCount;
      return `Added to cart! 🎁 Add ${diff} more for Buy 20 Get 4 Free!`;
    }
    if (totalCount >= 20 && totalCount < 24) {
      const left = 24 - totalCount;
      return left === 1 ? `🎉 Offer unlocked! Add your free poster!` : `🎉 Offer unlocked! Add ${left} free posters!`;
    }
    if (totalCount === 24) {
      return `🎉 Buy 20 Get 4 Free Unlocked! 4 lowest priced posters are FREE!`;
    }
    if (totalCount < 30) {
      const diff = 36 - totalCount;
      return `Added to cart! 🎁 Add ${diff} more for Buy 30 Get 6 Free!`;
    }
    if (totalCount >= 30 && totalCount < 36) {
      const left = 36 - totalCount;
      return left === 1 ? `🎉 Offer unlocked! Add your free poster!` : `🎉 Offer unlocked! Add ${left} free posters!`;
    }
    return `🔥 Mega Combo Unlocked: Buy 30 Get 6 Free! 6 lowest priced posters are FREE!`;
  }

  // ---- Render cart drawer ----
  function renderCartDrawer() {
    const items = Cart.getCart();
    const count = Cart.getItemCount();

    // Update nav badge with tactile bounce
    if (navCartCount) {
      const prevCount = parseInt(navCartCount.textContent, 10) || 0;
      navCartCount.textContent = count;
      navCartCount.style.display = count > 0 ? 'flex' : 'none';
      if (count > prevCount) {
        navCartCount.classList.remove('is-popping');
        void navCartCount.offsetWidth; // re-flow
        navCartCount.classList.add('is-popping');
      }
    }

    // Update drawer count
    if (cartDrawerCount) {
      cartDrawerCount.textContent = `(${count})`;
    }

    // Render items
    if (!cartBody) return;

    const comboBanner = document.getElementById('cart-combo-banner');

    if (items.length === 0) {
      if (comboBanner) {
        comboBanner.style.display = 'none';
        comboBanner.innerHTML = '';
      }
      cartBody.innerHTML = `
        <div class="cart-empty">
          <i class="fa-solid fa-bag-shopping"></i>
          <h4>Your cart is empty</h4>
          <p>Browse our collections and add some art!</p>
        </div>
      `;
      if (cartFooter) cartFooter.style.display = 'none';
      return;
    }

    if (cartFooter) cartFooter.style.display = 'block';

    const charges = Cart.getCharges('prepaid');

    // Dynamic Top Combo Banner
    if (comboBanner) {
      const posterQty = charges.bundlePosterCount || 0;
      if (posterQty > 0) {
        comboBanner.style.display = 'block';
        const applied = charges.bundleFreeCount > 0;
        const currentLabel = charges.bundleLabel;
        const nextLabel = charges.bundleNextLabel;
        const toNext = charges.bundleToNext;

        let bannerHtml = `
          <div class="combo-banner-card">
            <div class="combo-banner-top">
              <div class="combo-banner-left">
                <span class="combo-banner-title">
                  <i class="fa-solid fa-gift"></i> ${applied ? escapeHtml(currentLabel) : 'Poster Combo Offers'}
                </span>
                ${applied ? `<span class="combo-pill-applied">APPLIED</span>` : ''}
              </div>
              <div class="combo-banner-right">
                <span class="combo-poster-count"><strong>${posterQty}</strong> poster${posterQty === 1 ? '' : 's'} in cart ${applied ? `&bull; <span class="combo-free-accent">${charges.bundleFreeCount} FREE</span>` : ''}</span>
              </div>
            </div>`;

        const nextTier = charges.bundleNextTier;
        if (nextTier && toNext > 0) {
          const nextTarget = nextTier.get;
          const nextBuy = nextTier.buy;
          const nextFree = nextTier.free != null ? nextTier.free : (nextTarget - nextBuy);
          const pct = Math.max(8, Math.min(100, Math.round((posterQty / nextTarget) * 100)));
          const isClaimStage = posterQty >= nextBuy;

          let hintHtml = '';
          if (isClaimStage) {
            const freeWord = toNext === 1 ? 'your free poster' : `your ${toNext} free posters`;
            hintHtml = `<i class="fa-solid fa-gift" style="color: #10b981;"></i> <strong>Offer unlocked! Add ${escapeHtml(freeWord)}</strong>`;
          } else {
            const offerHint = nextFree === 1
              ? `Buy ${nextBuy} Get ${nextTarget} (1 FREE)`
              : `Buy ${nextBuy} Get ${nextTarget} (${nextFree} FREE)`;
            hintHtml = `<i class="fa-solid fa-sparkles"></i> Add <strong>${toNext} more poster${toNext === 1 ? '' : 's'}</strong> to get <strong>${escapeHtml(offerHint)}</strong>!`;
          }

          bannerHtml += `
            <div class="combo-banner-progress-wrap">
              <div class="combo-bar-track">
                <div class="combo-bar-fill ${isClaimStage ? 'is-max' : ''}" style="width: ${pct}%"></div>
              </div>
              <div class="combo-banner-next-hint">
                ${hintHtml}
              </div>
            </div>`;
        } else if (posterQty >= 36) {
          bannerHtml += `
            <div class="combo-banner-progress-wrap">
              <div class="combo-bar-track">
                <div class="combo-bar-fill is-max" style="width: 100%"></div>
              </div>
              <div class="combo-banner-max-hint">
                <i class="fa-solid fa-crown"></i> <strong>Maximum Combo Unlocked! Buy 30 Get 6 Free (6 Free Posters)</strong>
              </div>
            </div>`;
        }
        bannerHtml += `</div>`;
        comboBanner.innerHTML = bannerHtml;
      } else {
        comboBanner.style.display = 'none';
        comboBanner.innerHTML = '';
      }
    }

    cartBody.innerHTML = items.map(item => `
      <div class="cart-item" data-cart-id="${item.cartId || item.id}">
        <div class="cart-item-image">
          <img ${window.BrushImg ? BrushImg.urlAttrs(item.image, 480) : `src="${item.image}"`} class="plain-product-image loaded" alt="${escapeHtml(item.name)}">
        </div>
        <div class="cart-item-details">
          <h4>${escapeHtml(item.name)}</h4>
          ${formatCartVariantLine(item) ? `<div style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 4px;">${escapeHtml(formatCartVariantLine(item))}</div>` : ''}
          ${(Array.isArray(item.customPosters) && item.customPosters.length > 0) ? `
            <div style="margin-top: 6px; margin-bottom: 6px; display: flex; flex-wrap: wrap; gap: 4px;">
              ${item.customPosters.map((cp, idx) => `
                <div style="position: relative; width: 32px; height: 44px; border-radius: 3px; overflow: hidden; border: 1px solid var(--border); flex-shrink: 0;" title="${escapeHtml(cp.name || cp.title || `Poster ${idx+1}`)} (${escapeHtml(cp.size || 'A5')})">
                  <img src="${escapeHtml(cp.image)}" style="width: 100%; height: 100%; object-fit: cover; display: block;" loading="lazy">
                  <span style="position: absolute; bottom: 1px; right: 1px; background: rgba(0,0,0,0.85); color: #fff; font-size: 0.5rem; font-weight: 700; padding: 1px 2px; border-radius: 2px; line-height: 1;">${escapeHtml(cp.size || 'A5')}</span>
                </div>
              `).join('')}
            </div>
          ` : ''}
          <div class="cart-item-price">
            <strong>₹${item.price}</strong> × ${item.quantity} = ₹${item.price * item.quantity}
            ${(item.productType || 'poster').toLowerCase() === 'poster' && charges.bundleLabel ? `
              <span class="cart-item-combo-pill"><i class="fa-solid fa-tags"></i> ${escapeHtml(charges.bundleLabel)}</span>
            ` : ''}
          </div>
          <div class="cart-item-controls">
            <div class="qty-control">
              <button class="qty-minus" data-id="${item.cartId || item.id}" aria-label="Decrease quantity">−</button>
              <span class="qty-value">${item.quantity}</span>
              <button class="qty-plus" data-id="${item.cartId || item.id}" aria-label="Increase quantity" ${item.quantity >= (item.stockQuantity !== undefined ? item.stockQuantity : 50) ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ''}>+</button>
            </div>
            <button class="cart-item-remove" data-id="${item.cartId || item.id}" aria-label="Remove item">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </div>
      </div>
    `).join('');

    // Update totals
    // Shelf prices are tax-inclusive; shipping is added once per order.
    const inr = (n) => '₹' + (Number.isInteger(n) ? n : n.toFixed(2));
    if (cartSubtotal) cartSubtotal.textContent = inr(charges.subtotal);
    const cartGst = document.getElementById('cart-gst');
    if (cartGst) cartGst.textContent = inr(charges.tax);

    // Launch offer — shown only when the cart actually qualifies for it.
    const launchRow = document.getElementById('cart-launch-row');
    const launchVal = document.getElementById('cart-launch');
    if (launchRow && launchVal) {
      launchRow.hidden = !charges.launchDiscount;
      launchVal.textContent = '-' + inr(charges.launchDiscount || 0);
    }

    if (cartShipping) {
      cartShipping.textContent = charges.shipping === 0 ? 'Free' : inr(charges.shipping);
      cartShipping.style.color = charges.shipping === 0 ? '#10b981' : '';
    }

    // Buy-more poster offer: what it's worth now, and how close the cart is
    // to the next tier (the nudge is what actually moves the quantity).
    const bundleRow = document.getElementById('cart-bundle-row');
    if (bundleRow) {
      const show = charges.bundleDiscount > 0;
      bundleRow.hidden = !show;
      if (show) {
        const freeN = charges.bundleFreeCount;
        document.getElementById('cart-bundle-label').innerHTML =
          `<span class="cart-bundle-label-content"><i class="fa-solid fa-gift" style="color: #10b981;"></i> ${escapeHtml(charges.bundleLabel || 'Combo Offer')} (${freeN} Free)</span>`;
        document.getElementById('cart-bundle').textContent = '-' + inr(charges.bundleDiscount);
      }
    }

    const feeRow = document.getElementById('cart-fee-row');
    const feeVal = document.getElementById('cart-fee');
    if (feeRow && feeVal) {
      feeRow.hidden = !charges.processingFee;
      feeVal.textContent = inr(charges.processingFee || 0);
    }

    if (cartTotal) cartTotal.textContent = inr(charges.total);

    // Prompt in cart drawer footer near checkout button
    const comboNudge = document.getElementById('cart-combo-nudge');
    if (comboNudge) {
      const posterQty = charges.bundlePosterCount || 0;
      if (posterQty > 0 && charges.bundleNextTier && charges.bundleToNext > 0) {
        const nt = charges.bundleNextTier;
        const nextFree = nt.free != null ? nt.free : (nt.get - nt.buy);
        const isClaimStage = posterQty >= nt.buy;
        comboNudge.hidden = false;

        if (isClaimStage) {
          comboNudge.className = 'cart-combo-nudge is-unlocked';
          const freeWord = charges.bundleToNext === 1 ? 'your free poster' : `your ${charges.bundleToNext} free posters`;
          comboNudge.innerHTML = `<i class="fa-solid fa-gift"></i> <span>🎉 <strong>Offer unlocked!</strong> Add ${escapeHtml(freeWord)}!</span>`;
        } else {
          const hint = nextFree === 1
            ? `Buy ${nt.buy} Get ${nt.get} (1 FREE)`
            : `Buy ${nt.buy} Get ${nt.get} (${nextFree} FREE)`;
          comboNudge.className = 'cart-combo-nudge';
          comboNudge.innerHTML = `<i class="fa-solid fa-gift"></i> <span>Add <strong>${charges.bundleToNext} more</strong> to get <strong>${escapeHtml(hint)}</strong>!</span>`;
        }
      } else if (posterQty > 0 && charges.bundleFreeCount > 0) {
        comboNudge.hidden = false;
        comboNudge.className = 'cart-combo-nudge is-unlocked';
        comboNudge.innerHTML = `<i class="fa-solid fa-circle-check"></i> <span><strong>${escapeHtml(charges.bundleLabel)}</strong> applied! (${charges.bundleFreeCount} lowest priced poster${charges.bundleFreeCount > 1 ? 's' : ''} FREE)</span>`;
      } else {
        comboNudge.hidden = true;
        comboNudge.innerHTML = '';
      }
    }

    // How much more earns free delivery — the single most useful nudge here.
    const nudge = document.getElementById('cart-free-nudge');
    if (nudge) {
      const threshold = Cart.ORDER_CHARGES.freeShippingThreshold;
      const short = threshold - charges.subtotal;
      const pct = Math.max(0, Math.min(100, Math.round((charges.subtotal / threshold) * 100)));
      nudge.hidden = charges.subtotal <= 0;
      nudge.innerHTML = (short > 0
        ? `<span class="cart-free-nudge-text">Add <strong>${inr(short)}</strong> more for free delivery</span>
           <span class="cart-free-bar"><span class="cart-free-bar-fill" style="width:${pct}%"></span></span>`
        : `<span class="cart-free-nudge-text is-unlocked"><i class="fa-solid fa-circle-check"></i> Free delivery unlocked</span>
           <span class="cart-free-bar"><span class="cart-free-bar-fill is-full" style="width:100%"></span></span>`);
      nudge.hidden = charges.subtotal <= 0;
    }

    renderCartAddOns(items);

    // Bind quantity controls
    cartBody.querySelectorAll('.qty-minus').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const item = Cart.getCart().find(i => i.cartId === id || i.id === parseInt(id) || i.id === id);
        if (item && item.quantity > 1) {
          Cart.updateQuantity(id, item.quantity - 1);
        } else {
          Cart.removeItem(id);
        }
      });
    });

    cartBody.querySelectorAll('.qty-plus').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const item = Cart.getCart().find(i => i.cartId === id || i.id === parseInt(id) || i.id === id);
        if (item) {
          const maxStock = item.stockQuantity !== undefined ? item.stockQuantity : 50;
          if (item.quantity >= maxStock) {
            showToast(`Only ${maxStock} items available in stock.`);
          } else {
            Cart.updateQuantity(id, item.quantity + 1);
          }
        }
      });
    });

    cartBody.querySelectorAll('.cart-item-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        Cart.removeItem(btn.dataset.id);
        showToast('Item removed from cart');
      });
    });
  }

  // Listen for cart changes
  Cart.onChange(renderCartDrawer);

  // Initial render
  renderCartDrawer();


  // ---- "Add to Cart" buttons ----
  function handleAddToCart(btn) {
    const card = btn.closest('.product-card, .wall-setup-card, .store-card');
    if (!card) return;

    const id = parseInt(card.dataset.id, 10);
    let product = {
      id: id,
      name: card.dataset.name,
      price: parseInt(card.dataset.price, 10),
      originalPrice: parseInt(card.dataset.original, 10),
      image: card.dataset.image,
      stockQuantity: parseInt(card.dataset.stock, 10) || 50,
      productType: card.dataset.productType || 'poster'
    };

    if (!product.id || !product.name) {
      if (window.BrushCatalog && window.BrushCatalog._products) {
        const found = window.BrushCatalog._products.find(p => Number(p.id) === id);
        if (found) {
          product = {
            id: found.id,
            name: found.name,
            price: Number(found.price),
            originalPrice: Number(found.originalPrice || found.price),
            image: (window.BrushImg ? BrushImg.original(found) : found.image),
            stockQuantity: Number(found.stockQuantity) || 50,
            productType: found.productType || 'poster'
          };
        }
      }
    }

    if (!product.id || !product.name) return;

    flyToCart(card.querySelector('.mockup-poster, .plain-product-image, .ws-img-container img, img'));
    Cart.addItem(product, 1);

    // Button feedback
    const originalHtml = btn.dataset.originalHtml || btn.innerHTML;
    btn.dataset.originalHtml = originalHtml;
    if (btn.classList.contains('arrivals-quick-add')) {
      btn.innerHTML = '<i class="fa-solid fa-check"></i>';
    } else {
      btn.textContent = '✓ Added!';
    }
    btn.classList.add('added');

    setTimeout(() => {
      btn.innerHTML = originalHtml;
      btn.classList.remove('added');
    }, 1500);

    const isPoster = (product.productType || 'poster').toLowerCase().startsWith('poster');
    if (isPoster) {
      const charges = Cart.getCharges('prepaid');
      showToast(getPosterMilestoneMsg(charges.bundlePosterCount), { showCartBtn: true });
    } else {
      showToast(`${product.name} added to cart!`, { showCartBtn: true });
    }
  }
  window.BrushAddToCart = handleAddToCart;

  // Attach to all "Add to Cart" / "Quick Add" buttons and Product Modals
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.quick-add-btn');
    if (btn) {
      e.preventDefault();
      e.stopPropagation();
      const card = btn.closest('.product-card, .wall-setup-card');
      const pid = card ? (card.dataset.productId || card.dataset.id) : null;
      if (pid && window.BrushAnalytics && window.BrushAnalytics.trackClick) {
        window.BrushAnalytics.trackClick(pid, { name: card.dataset.name, listName: 'Quick Add' });
      }
      handleAddToCart(btn);
      return;
    }
    
    const nextBtn = e.target.closest('.modal-next-btn');
    if (nextBtn) {
      e.preventDefault();
      openProductModal(nextBtn.dataset.nextId);
      return;
    }

    const card = e.target.closest('.product-card, .wall-setup-card, .collage-poster[data-product-id]');
    if (card) {
      e.preventDefault();
      const pid = card.dataset.productId || card.dataset.id;
      if (pid) {
        if (window.BrushAnalytics && window.BrushAnalytics.trackClick) {
          window.BrushAnalytics.trackClick(pid, { name: card.dataset.name, listName: 'Catalog Card' });
        }
        openProductModal(pid);
      }
    }
  });

  // Finds the product after `currentId` among whichever product cards are
  // actually on screen right now (a homepage carousel, or the current
  // filtered/paginated All Products page) — not the full catalog, so
  // "Next" always matches what the shopper was just browsing.
  function getNextProductId(currentId) {
    const ids = [...document.querySelectorAll('.product-card[data-id]')]
      .map(el => el.dataset.id)
      .filter((id, i, arr) => arr.indexOf(id) === i);
    if (ids.length < 2) return null;
    const idx = ids.indexOf(String(currentId));
    if (idx === -1) return null;
    return ids[(idx + 1) % ids.length];
  }


  // ========================================
  // PRODUCT MODAL SYSTEM
  // ========================================
  const productModal = document.getElementById('product-modal');
  const productModalOverlay = document.getElementById('product-modal-overlay');
  const modalCloseBtn = document.getElementById('modal-close-btn');
  let currentProduct = null;

  // ---- Apparel gallery (back, front, design layout, size chart) ----
  // Design-layout sheets live next to the mockups, named after the mockup
  // file stem: assets/Tshirt designs/absolut_front.png ->
  // assets/Tshirt designs/sheets/absolut_design.webp. Missing sheets are
  // skipped automatically (the slide removes itself on load error).
  const APPAREL_SIZE_CHART = 'assets/Tshirt designs/1788842546SizeChart1.png';

  function apparelDesignSheet(p) {
    const m = String(p.image || p.backImage || '').match(/([^/]+?)_(front|back)\.[a-z]+$/i);
    return m ? `assets/Tshirt designs/sheets/${m[1]}_design.webp` : null;
  }

  function buildApparelGallery(p) {
    const frontSrc = BrushImg.original(p);
    const backSrc = p.backImage || frontSrc;
    const slides = [
      { src: backSrc, label: 'Back', fit: 'cover', zoom: true },
      { src: frontSrc, label: 'Front', fit: 'cover', zoom: true },
    ];
    const sheet = apparelDesignSheet(p);
    // Design sheets share the mockups' 10:7 frame, so they fill the stage
    // edge to edge instead of floating small inside padding.
    if (sheet) slides.push({ src: sheet, label: 'Design', fit: 'sheet', optional: true });
    slides.push({ src: APPAREL_SIZE_CHART, label: 'Size chart', fit: 'contain' });
    return buildGallery(p, slides);
  }

  // ---- Hoodie gallery (back, front, the print artwork, size chart) ----
  // Hoodies ship a different asset set from tees: two garment mockups plus
  // the flat print files (back, chest, and a sleeve on most designs), which
  // is why they get their own builder instead of reusing the tee one.
  //
  // Order comes straight from the seeded `images` array — back mockup, front
  // mockup, then each print, then the shared size chart — so the gallery reads
  // the way the shopper turns the garment over. Anything unexpected in the
  // middle still lands in the print group rather than being dropped.
  const isSizeChart = (u) => /sizechart/i.test(String(u));

  // The prints are transparent PNGs in dark navy and teal. On the modal's dark
  // ground they would vanish, so they take the light-backed `contain` fit —
  // which also means a wide sleeve print is scaled by width and never cropped.
  function hoodiePrintLabel(src, i, total) {
    const f = String(src).toLowerCase();
    if (f.includes('sleeve')) return 'Print · Sleeve';
    if (f.includes('back')) return 'Print · Back';
    if (f.includes('front') || f.includes('chest')) return 'Print · Chest';
    return total > 1 ? `Print ${i + 1}` : 'Print';
  }

  function buildHoodieGallery(p) {
    const all = (p.images || []).filter(Boolean);
    const front = BrushImg.original(p);
    const back = p.backImage || front;
    if (!all.length) return buildGallery(p, [
      { src: back, label: 'Back', fit: 'cover', zoom: true },
      { src: front, label: 'Front', fit: 'cover', zoom: true },
    ]);

    const chart = all.filter(isSizeChart);
    const rest = all.filter(u => !isSizeChart(u));
    // First two entries are the garment mockups; everything else is print art.
    const mockups = rest.slice(0, 2);
    const prints = rest.slice(2);

    const slides = [];
    const labels = ['Back', 'Front'];
    mockups.forEach((src, i) => slides.push({ src, label: labels[i] || 'View', fit: 'cover', zoom: true }));
    prints.forEach((src, i) => slides.push({
      src, label: hoodiePrintLabel(src, i, prints.length), fit: 'print', zoom: true,
    }));
    chart.forEach(src => slides.push({ src, label: 'Size chart', fit: 'contain' }));
    return buildGallery(p, slides);
  }

  // Wallpapers: room mockup first, then the zoomable pattern and a print-
  // scale close-up (p.gallery, written by Backend/wallpaperCatalog.js).
  
  function buildPoster3PackGallery(p) {
    const slides = (p.images || [p.image]).map((src, i) => ({
      src: src, label: i === 0 ? 'Mockup' : `Poster ${i}`, fit: 'contain', zoom: true
    }));
    return slides.length ? buildGallery(p, slides) : null;
  }

  function buildPosterGallery(p) {
    const posterArtUrl = (window.BrushImg && BrushImg.src) ? BrushImg.src(p, 1080) : (p.image || '');
    const framedMockup = `/img/framed-mockups/${p.id}.webp`;

    // 1st Slide: High-speed 1080px WebP derivative (falls back to original if no thumb)
    // 2nd Slide: Framed Poster on Spacejoy Wall (museum hardwood frame, uncropped contain fit)
    const slides = [
      { src: posterArtUrl, label: 'Poster Art', fit: 'contain', zoom: true },
      { src: framedMockup, label: 'Framed on Wall', fit: 'framed', zoom: false }
    ];

    if (Array.isArray(p.gallery)) {
      p.gallery.forEach((g, idx) => {
        if (g && g.src && g.src !== originalArt && g.src !== framedMockup) {
          slides.push({
            src: g.src,
            label: g.label || `View ${idx + 3}`,
            fit: 'contain',
            zoom: true
          });
        }
      });
    }

    return buildGallery(p, slides, { hasFrameToggle: true });
  }

  function buildCollectibleGallery(p) {
    const slides = (p.gallery || []).map(g => ({
      src: g.src, label: g.label || 'View', fit: 'collectible', zoom: true
    }));
    return slides.length ? buildGallery(p, slides) : null;
  }

  function buildWallpaperGallery(p) {
    const labels = {
      room: 'In a room', pattern: 'Pattern', detail: 'Close-up',
      flat: 'The piece', front: 'Front', back: 'Back'
    };
    const slides = (p.gallery || []).map(g => ({
      src: g.src, label: g.label || labels[g.kind] || 'View', fit: 'cover', zoom: g.kind !== 'room'
    }));
    return slides.length ? buildGallery(p, slides) : null;
  }

  function buildMetalPosterGallery(p) {
    const slides = (p.gallery || []).map(g => ({
      src: g.src,
      label: g.label || (g.kind === 'design' ? 'Artwork' : 'Metal finish'),
      fit: 'contain',
      zoom: true
    }));
    return slides.length ? buildGallery(p, slides) : null;
  }

  function buildGallery(p, slides, opts = {}) {
    const name = escapeHtml(p.name);
    // Photos go through the resized-WebP pipeline (with fallback to the
    // original); the design sheet stays full-res so zoom stays crisp, and
    // keeps a plain src so its error handler can drop the slide.
    const imgFor = (sl, size) => (sl.optional || !window.BrushImg)
      ? `src="${escapeHtml(encodeURI(sl.src))}"`
      : BrushImg.urlAttrs(sl.src, size);
    const hasFrameToggle = Boolean(opts.hasFrameToggle);
    return `
      <div class="apparel-gallery" tabindex="0" aria-roledescription="carousel" aria-label="${name} images">
        <div class="ag-stage">
          ${hasFrameToggle ? `
            <div class="stage-frame-toggle" role="group" aria-label="Poster framing preview">
              <button type="button" class="stage-frame-btn is-active" data-frame-mode="unframed" aria-pressed="true" title="View print without frame">
                <i class="fa-solid fa-file-image"></i> <span>Art Print</span>
              </button>
              <button type="button" class="stage-frame-btn" data-frame-mode="framed" aria-pressed="false" title="View with archival museum frame">
                <i class="fa-solid fa-square-full"></i> <span>Gallery Frame</span>
              </button>
            </div>` : ''}
          ${slides.map((sl, i) => `
            <figure class="ag-slide ${i === 0 ? 'is-active' : ''}" data-fit="${sl.fit}" ${sl.zoom ? 'data-zoom' : ''} ${sl.optional ? 'data-optional' : ''} aria-hidden="${i === 0 ? 'false' : 'true'}">
              <img ${imgFor(sl, 1080)} alt="${name} — ${sl.label}" draggable="false" ${i === 0 ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">
            </figure>`).join('')}
          <button class="ag-nav ag-prev" type="button" aria-label="Previous image"><i class="fa-solid fa-chevron-left"></i></button>
          <button class="ag-nav ag-next" type="button" aria-label="Next image"><i class="fa-solid fa-chevron-right"></i></button>
          <span class="ag-hint"><i class="fa-solid fa-magnifying-glass-plus"></i> <span class="ag-hint-text">Hover to zoom</span></span>
        </div>
        <div class="ag-thumbs" role="tablist">
          ${slides.map((sl, i) => `
            <button class="ag-thumb ${i === 0 ? 'is-active' : ''}" type="button" role="tab" data-index="${i}" data-fit="${sl.fit}" ${sl.optional ? 'data-optional' : ''} aria-selected="${i === 0}" aria-label="${sl.label}">
              <img ${imgFor(sl, 480)} alt="" loading="lazy" decoding="async" draggable="false">
              <span>${sl.label}</span>
            </button>`).join('')}
        </div>
      </div>`;
  }

  function initApparelGallery(root) {
    const gallery = root.querySelector('.apparel-gallery');
    if (!gallery) return;
    const stage = gallery.querySelector('.ag-stage');
    const hintText = gallery.querySelector('.ag-hint-text');
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const ZOOM = 2.4;
    let index = 0;

    const slides = () => Array.from(gallery.querySelectorAll('.ag-slide'));
    const thumbs = () => Array.from(gallery.querySelectorAll('.ag-thumb'));
    if (!finePointer && hintText) hintText.textContent = 'Tap to zoom';

    // Drop the design-sheet slide if that product has no sheet yet.
    gallery.querySelectorAll('.ag-slide[data-optional] img').forEach((img) => {
      img.loading = 'eager';
      img.addEventListener('error', () => {
        const slide = img.closest('.ag-slide');
        const i = slides().indexOf(slide);
        slide.remove();
        const t = thumbs()[i];
        if (t) t.remove();
        thumbs().forEach((b, j) => { b.dataset.index = j; });
        go(Math.min(index, slides().length - 1));
      }, { once: true });
    });

    function resetZoom(slide) {
      if (!slide) return;
      slide.classList.remove('is-zoomed', 'is-locked');
      const img = slide.querySelector('img');
      img.style.transformOrigin = '';
    }

    function go(i) {
      const all = slides();
      if (!all.length) return;
      resetZoom(all[index]);
      index = (i + all.length) % all.length;
      all.forEach((s, j) => {
        s.classList.toggle('is-active', j === index);
        s.setAttribute('aria-hidden', j === index ? 'false' : 'true');
      });
      thumbs().forEach((t, j) => {
        t.classList.toggle('is-active', j === index);
        t.setAttribute('aria-selected', j === index ? 'true' : 'false');
      });
      const activeThumb = thumbs()[index];
      if (activeThumb) activeThumb.scrollIntoView({ block: 'nearest', inline: 'center' });
      syncHint();
    }

    // Zoom only on the Back/Front photos, and only while the pointer is over
    // the central part of the image — the outer band (where the arrows and
    // edges are) never triggers it.
    const ZONE_X = 0.2;  // ignore 20% on each side
    const ZONE_Y = 0.12; // ignore 12% top and bottom
    const canZoom = (slide) => !!(slide && slide.hasAttribute('data-zoom'));
    function inZone(clientX, clientY) {
      const r = stage.getBoundingClientRect();
      const x = (clientX - r.left) / r.width;
      const y = (clientY - r.top) / r.height;
      return x >= ZONE_X && x <= 1 - ZONE_X && y >= ZONE_Y && y <= 1 - ZONE_Y;
    }
    function syncHint() {
      gallery.classList.toggle('ag-no-zoom', !canZoom(slides()[index]));
    }

    function setOrigin(slide, clientX, clientY) {
      const rect = slide.getBoundingClientRect();
      const x = Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100));
      const y = Math.min(100, Math.max(0, ((clientY - rect.top) / rect.height) * 100));
      slide.querySelector('img').style.transformOrigin = `${x}% ${y}%`;
    }

    gallery.querySelector('.ag-prev').addEventListener('click', (e) => { e.stopPropagation(); go(index - 1); });
    gallery.querySelector('.ag-next').addEventListener('click', (e) => { e.stopPropagation(); go(index + 1); });
    gallery.querySelector('.ag-thumbs').addEventListener('click', (e) => {
      const b = e.target.closest('.ag-thumb');
      if (b) go(parseInt(b.dataset.index, 10));
    });

    gallery.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(index - 1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); go(index + 1); }
    });

    const stageFrameToggle = gallery.querySelector('.stage-frame-toggle');
    if (stageFrameToggle) {
      stageFrameToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const btn = e.target.closest('.stage-frame-btn');
        if (!btn) return;
        const mode = btn.dataset.frameMode;
        const isFramed = mode === 'framed';
        const modalCol = document.querySelector('.modal-image-col');
        if (modalCol) {
          modalCol.classList.toggle('is-gallery-framed', isFramed);
        }
        stageFrameToggle.querySelectorAll('.stage-frame-btn').forEach(b => {
          const act = b === btn;
          b.classList.toggle('is-active', act);
          b.setAttribute('aria-pressed', act ? 'true' : 'false');
        });

        if (variantSelectorsEl) {
          const frameGroup = variantSelectorsEl.querySelector('.swatch-group[data-group-key="frame"]');
          if (frameGroup) {
            const swatches = Array.from(frameGroup.querySelectorAll('.swatch-btn:not([hidden])'));
            if (isFramed) {
              const framedSwatch = swatches.find(s => s.dataset.value !== 'none') || swatches[1];
              if (framedSwatch && !framedSwatch.classList.contains('active')) {
                setActiveSwatch(frameGroup, framedSwatch.dataset.value);
                syncVariantAvailability();
                updateModalPrice();
              }
            } else {
              const noneSwatch = swatches.find(s => s.dataset.value === 'none');
              if (noneSwatch && !noneSwatch.classList.contains('active')) {
                setActiveSwatch(frameGroup, 'none');
                syncVariantAvailability();
                updateModalPrice();
              }
            }
          }
        }
      });
    }

    stage.style.setProperty('--ag-zoom', ZOOM);
    syncHint();

    // Desktop: zoom follows the cursor while hovering; click locks/unlocks.
    stage.addEventListener('mousemove', (e) => {
      if (!finePointer) return;
      const slide = slides()[index];
      if (!canZoom(slide)) return;
      const locked = slide.classList.contains('is-locked');
      const active = !e.target.closest('.ag-nav') && inZone(e.clientX, e.clientY);
      stage.classList.toggle('in-zoom-zone', active || locked);
      if (active || locked) {
        slide.classList.add('is-zoomed');
        setOrigin(slide, e.clientX, e.clientY);
      } else {
        resetZoom(slide);
      }
    });
    stage.addEventListener('mouseleave', () => {
      stage.classList.remove('in-zoom-zone');
      const slide = slides()[index];
      if (slide && !slide.classList.contains('is-locked')) resetZoom(slide);
    });

    // Touch: tap toggles zoom at the tapped point, drag pans while zoomed,
    // horizontal swipe (when not zoomed) changes slide.
    let touchStart = null;
    stage.addEventListener('touchstart', (e) => {
      if (e.target.closest('.ag-nav')) return;
      const t = e.touches[0];
      touchStart = { x: t.clientX, y: t.clientY, time: Date.now(), moved: false };
    }, { passive: true });
    stage.addEventListener('touchmove', (e) => {
      if (!touchStart) return;
      const t = e.touches[0];
      const slide = slides()[index];
      if (Math.abs(t.clientX - touchStart.x) > 8 || Math.abs(t.clientY - touchStart.y) > 8) touchStart.moved = true;
      if (slide && slide.classList.contains('is-zoomed')) {
        e.preventDefault();
        setOrigin(slide, t.clientX, t.clientY);
      }
    }, { passive: false });
    stage.addEventListener('touchend', (e) => {
      if (!touchStart) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - touchStart.x;
      const slide = slides()[index];
      const zoomed = slide && slide.classList.contains('is-zoomed');
      if (!touchStart.moved && canZoom(slide)) {
        if (zoomed) resetZoom(slide);
        else { slide.classList.add('is-zoomed', 'is-locked'); setOrigin(slide, t.clientX, t.clientY); }
      } else if (!zoomed && Math.abs(dx) > 50) {
        go(index + (dx < 0 ? 1 : -1));
      }
      touchStart = null;
    });

    stage.addEventListener('click', (e) => {
      if (!finePointer || e.target.closest('.ag-nav')) return;
      const slide = slides()[index];
      if (!canZoom(slide)) return;
      if (slide.classList.contains('is-locked')) {
        slide.classList.remove('is-locked');
        if (!inZone(e.clientX, e.clientY)) resetZoom(slide);
      } else if (inZone(e.clientX, e.clientY)) {
        slide.classList.add('is-zoomed', 'is-locked');
        setOrigin(slide, e.clientX, e.clientY);
      }
    });
  }

  // ---- Fit the media column to the artwork ----
  // A portrait poster in a fixed-width landscape column is height-bound, so it
  // leaves a wide empty band beside it. Rather than crop the art or letterbox
  // it, the COLUMN is sized to the art: width = the height it will actually
  // occupy x its aspect ratio, plus a gutter. The info column is flex:1, so it
  // absorbs whatever is left over.
  //
  // Measured from the FIRST slide only. Gallery slides differ wildly in shape
  // (a hoodie's sleeve print is 3x wider than its back mockup) and re-fitting
  // per slide would make the whole modal jump while the shopper pages through.
  const MEDIA_MIN_SHARE = 0.34;   // never squeeze the art to a sliver
  const MEDIA_MAX_SHARE = 0.68;   // never squeeze the info column either
  const INFO_MIN_PX = 430;        // title, price, swatches and Add all need room

  function fitModalMedia() {
    const modal = document.getElementById('product-modal');
    if (modal && !modal.classList.contains('open') && !modal.classList.contains('active')) return;

    const wrap = document.querySelector('.modal-content-wrapper');
    const col = wrap && wrap.querySelector('.modal-image-col');
    if (!wrap || !col) return;

    // Phones stack the columns, so the width split does not apply.
    if (window.matchMedia('(max-width: 768px)').matches) {
      wrap.style.removeProperty('--media-col');
      return;
    }

    const img = wrap.querySelector('.ag-slide img') || wrap.querySelector('.modal-plain-image');
    if (!img || !img.naturalWidth || !img.naturalHeight) return;
    const ratio = img.naturalWidth / img.naturalHeight;

    // A gallery spends part of its height on the thumbnail strip, so the art
    // only gets the stage. A plain image gets the column minus its gutter.
    const stage = wrap.querySelector('.ag-stage');
    const gutter = stage ? 0 : Math.round(Math.min(40, Math.max(18, innerHeight * 0.03))) * 2;
    const availH = (stage ? stage.clientHeight : col.clientHeight) - gutter;
    if (availH <= 0) return;

    const total = wrap.clientWidth;
    const ideal = availH * ratio + gutter;
    const width = Math.round(Math.min(
      Math.max(ideal, total * MEDIA_MIN_SHARE),
      total * MEDIA_MAX_SHARE,
      total - INFO_MIN_PX
    ));
    wrap.style.setProperty('--media-col', width + 'px');
  }

  // The natural size is only known once the image has decoded, and the split
  // depends on the viewport, so re-fit on both.
  function watchModalMedia(root) {
    fitModalMedia();
    root.querySelectorAll('img').forEach((im) => {
      if (im.complete && im.naturalWidth) return;
      im.addEventListener('load', fitModalMedia, { once: true });
    });
  }
  window.addEventListener('resize', fitModalMedia);

  // Exposed for pages that render their own product UI (poster reels).
  window.BrushOpenProduct = (id) => openProductModal(id);

  // The static product pages (/p/<id>-<slug>/, built by tools/product-pages.js)
  // hand off here: ?product=<id> opens that product's modal on arrival, so a
  // shared or indexed link lands on the real thing instead of the bare shop.
  (function openProductFromUrl() {
    let requested = new URLSearchParams(window.location.search).get('product')
      || (typeof window !== 'undefined' && window.__INITIAL_PRODUCT_ID__ ? String(window.__INITIAL_PRODUCT_ID__) : null);
    if (!requested) {
      try {
        requested = sessionStorage.getItem('brush_open_product');
        if (requested) sessionStorage.removeItem('brush_open_product');
      } catch (_) {}
    }
    if (!requested) return;
    openProductModal(requested, { immediate: true });
  })();

  async function openProductModal(productId, opts = {}) {
    if (window.BrushPageLoader) window.BrushPageLoader.start();

    // Guarded the same way as openCart() — harmless in practice today (the
    // overlay blocks clicks reaching another product card while open) but
    // keeps the lock/unlock pairing correct even if that ever changes.
    const wasOpen = productModal.classList.contains('open');
    productModal.classList.add('open');
    productModalOverlay.classList.add('open');
    productModal.style.display = 'block';
    productModalOverlay.style.display = 'block';
    if (!wasOpen) {
      lockPageScroll();
      if (window.BrushBack) BrushBack.opened('product');
    }

    const modalImageCol = document.querySelector('.modal-image-col');
    if (modalImageCol) {
      modalImageCol.classList.remove('is-gallery-framed');
      modalImageCol.removeAttribute('data-frame-color');
      modalImageCol.innerHTML = `
        <div class="modal-media-skeleton" aria-busy="true" aria-label="Loading product artwork">
          <div class="modal-skeleton-spinner">
            <div class="modal-spinner-ring"></div>
            <span class="modal-spinner-text">Loading artwork...</span>
          </div>
        </div>`;
    }

    try {
      let product = null;
      if (window.BrushCatalog) {
        try {
          const all = await window.BrushCatalog.getProducts();
          product = all && all.find(p => String(p.id) === String(productId));
        } catch (_) {}
      }
      if (!product) {
        try {
          const res = await fetch('/data/products.json');
          if (res.ok) {
            const all = await res.json();
            product = all && all.find(p => String(p.id) === String(productId));
          }
        } catch (_) {}
      }
      if (!product) {
        try {
          const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
          const timer = controller ? setTimeout(() => controller.abort(), 4000) : null;
          const res = await fetch(`${API_BASE}/products/${productId}`, controller ? { signal: controller.signal } : {});
          if (timer) clearTimeout(timer);
          if (res.ok) product = await res.json();
        } catch (_) {}
      }
      if (!product) throw new Error('Product not found: ' + productId);
      currentProduct = applyCatalogPrice(product);
      
      const modalImageCol = document.querySelector('.modal-image-col');
      if (modalImageCol) {
        modalImageCol.classList.remove('is-gallery-framed');
        modalImageCol.removeAttribute('data-frame-color');
      }
      const nextId = getNextProductId(productId);
      const modalProductType = (currentProduct.productType || 'poster').toLowerCase();

      const contentWrapper = document.querySelector('.modal-content-wrapper');
      if (contentWrapper) {
        contentWrapper.setAttribute('data-product-type', modalProductType);
      }
      const isPosterModal = modalProductType.startsWith('poster');

      const modalImgAttrs = `decoding="sync" onload="this.classList.add('loaded')"`; // modal images are strictly above the fold
      let imgHtml = `<img ${imgAttrsFor(currentProduct, 1080)} class="modal-plain-image" alt="${escapeHtml(currentProduct.name)}" ${modalImgAttrs}>`;

      const collectibleGallery = modalProductType.startsWith('collectible') ? buildCollectibleGallery(currentProduct) : null;
      const metalGallery = modalProductType.includes('metal') ? buildMetalPosterGallery(currentProduct) : null;
      // Wallpapers, tapestries and metal posters all carry a room mockup
      // plus flat/detail shots, so they share one gallery builder.
      const wallpaperGallery = /^(wallpaper|tapestr|metal)/.test(modalProductType) ? buildWallpaperGallery(currentProduct) : null;
      const isPackModal = modalProductType.includes('pack') || (currentProduct.category || '').toLowerCase().includes('pack') || (currentProduct.category || '').toLowerCase().includes('wall setup');
      const packGallery = (isPackModal || modalProductType === 'poster_3_pack' || modalProductType === 'poster_2_pack' || modalProductType.startsWith('poster_pack')) ? buildPoster3PackGallery(currentProduct) : null;
      const posterGallery = isSinglePosterProduct(currentProduct) ? buildPosterGallery(currentProduct) : null;
      if (packGallery) {
        modalImageCol.innerHTML = packGallery;
        initApparelGallery(modalImageCol);
      } else if (posterGallery) {
        modalImageCol.innerHTML = posterGallery;
        initApparelGallery(modalImageCol);
      } else if (modalProductType === 'apparel') {
        modalImageCol.innerHTML = buildApparelGallery(currentProduct);
        initApparelGallery(modalImageCol);
      } else if (modalProductType === 'hoodie') {
        modalImageCol.innerHTML = buildHoodieGallery(currentProduct);
        initApparelGallery(modalImageCol);
      } else if (collectibleGallery) {
        modalImageCol.innerHTML = collectibleGallery;
        initApparelGallery(modalImageCol);
      } else if (metalGallery) {
        modalImageCol.innerHTML = metalGallery;
        initApparelGallery(modalImageCol);
      } else if (wallpaperGallery) {
        modalImageCol.innerHTML = wallpaperGallery;
        initApparelGallery(modalImageCol);
      } else {
        modalImageCol.innerHTML = `<div class="modal-plain-image-wrapper">
          ${isPosterModal ? `
            <div class="stage-frame-toggle" role="group" aria-label="Poster framing preview">
              <button type="button" class="stage-frame-btn is-active" data-frame-mode="unframed" aria-pressed="true" title="View print without frame">
                <i class="fa-solid fa-file-image"></i> <span>Art Print</span>
              </button>
              <button type="button" class="stage-frame-btn" data-frame-mode="framed" aria-pressed="false" title="View with archival museum frame">
                <i class="fa-solid fa-square-full"></i> <span>Gallery Frame</span>
              </button>
            </div>` : ''}
          ${imgHtml}
          <span class="modal-zoom-hint"><i class="fa-solid fa-magnifying-glass-plus"></i> Click to zoom</span>
        </div>`;
        initPlainImageZoom(modalImageCol);
      }
      watchModalMedia(modalImageCol);
      
      document.getElementById('modal-title').textContent = currentProduct.name;
      const categoryTag = document.getElementById('modal-category-tag');
      if (categoryTag) {
        const typeCfg = Cart.typeConfigFor(currentProduct.productType);
        categoryTag.textContent = currentProduct.category || (typeCfg ? typeCfg.label : 'Art Print');
      }
      setModalPermalink(currentProduct);
      setModalUrl(currentProduct);
      document.getElementById('modal-description').textContent = currentProduct.description || 'Premium high-quality poster for your space.';
      document.getElementById('modal-original-price').textContent = currentProduct.originalPrice ? `₹${currentProduct.originalPrice}` : '';
      
      const stockStatus = document.getElementById('modal-stock-status');
      const addBtn = document.getElementById('modal-add-to-cart');
      const stock = currentProduct.stockQuantity !== undefined ? currentProduct.stockQuantity : 50;
      
      stockStatus.classList.remove('in-stock', 'low-stock', 'out-of-stock');
      if (stock <= 0) {
        if (currentProduct.productType === 'apparel' || currentProduct.productType === 'hoodie') {
          stockStatus.textContent = "Will be in stock soon";
        } else {
          stockStatus.textContent = "Out of Stock";
        }
        stockStatus.classList.add('out-of-stock');
        stockStatus.style.color = '';
        addBtn.disabled = true;
        addBtn.style.opacity = '0.5';
        addBtn.style.cursor = 'not-allowed';
      } else {
        addBtn.disabled = false;
        addBtn.style.opacity = '1';
        addBtn.style.cursor = 'pointer';
        
        if (stock < 10) {
          stockStatus.textContent = `Only ${stock} left!`;
          stockStatus.classList.add('low-stock');
          stockStatus.style.color = '';
        } else {
          stockStatus.textContent = "In Stock";
          stockStatus.classList.add('in-stock');
          stockStatus.style.color = '';
        }
      }
      
      renderVariantSelectors(currentProduct.productType || 'poster');
      initModalComboOffers(currentProduct);
      const arBtn = document.getElementById('modal-view-ar-btn');
      if (arBtn) {
        const isPoster = isPosterModal && !['lights', 'generic', 'apparel', 'hoodie', 'digital assets'].includes(modalProductType);
        arBtn.style.display = isPoster ? 'inline-flex' : 'none';
        if (window.innerWidth >= 992) {
          arBtn.disabled = true;
          arBtn.setAttribute('aria-disabled', 'true');
          arBtn.title = 'AR View is designed for mobile devices with cameras (iOS & Android)';
        } else {
          arBtn.disabled = false;
          arBtn.removeAttribute('aria-disabled');
          arBtn.title = 'View this poster in Augmented Reality on your wall';
        }
      }
      // Swap the modal's spec accordions for this product type's copy —
      // a hoodie gets fabric/GSM/size chart/print area, a poster gets
      // paper stock. See product-copy.js.
      if (window.ProductCopy) ProductCopy.render(currentProduct.productType, currentProduct.category);
      updateModalPrice();
      renderReviews();
      renderModalRating();
      resetStarInput();
      renderFrequentlyBoughtTogether(currentProduct);
      
      if (window.BrushTransition) window.BrushTransition.hide();
      if (window.BrushPageLoader) window.BrushPageLoader.done();
    } catch (err) {
      console.error(err);
      showToast('Failed to load product details');
      closeProductModal();
      if (window.BrushTransition) window.BrushTransition.hide();
      if (window.BrushPageLoader) window.BrushPageLoader.done();
    }
  }

  // ---- Product links -------------------------------------------------
  // Every product has its own page (/p/<id>-<slug>/, built by
  // tools/product-pages.js). While a product modal is open the address bar
  // shows that URL, so copying it — or hitting Share — gives a link that
  // opens THAT poster for the next person instead of the shop front.
  // replaceState is what BrushBack expects pages to use: it carries the URL
  // back down to the page's own history entry when the overlay closes.
  // Product URLs map to canonical static product pages (/p/<id>-<slug>/) for rich previews & sharing
  function slugify(text) {
    return String(text || '')
      .toLowerCase()
      .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'product';
  }

  function productUrl(p, absolute) {
    const search = new URLSearchParams(window.location.search);
    if (p && p.id) search.set('product', p.id);
    const path = `${window.location.pathname}?${search.toString()}`;
    return absolute ? window.location.origin + (path.startsWith('/') ? path : '/' + path) : path;
  }

  function shareUrl(p) {
    if (p && p.id && p.name) {
      return `${window.location.origin}/p/${p.id}-${slugify(p.name)}/`;
    }
    return productUrl(p, true);
  }

  function cleanNonProductUrl(urlStr) {
    try {
      const u = new URL(urlStr || window.location.href, window.location.origin);
      u.searchParams.delete('product');
      return u.pathname + (u.search ? u.search : '') + (u.hash ? u.hash : '');
    } catch (_) {
      return window.location.pathname || '/';
    }
  }

  let urlBeforeModal = null;
  function setModalUrl(p) {
    try {
      if (urlBeforeModal === null) {
        urlBeforeModal = cleanNonProductUrl(window.location.href);
      }
      history.replaceState(history.state, '', productUrl(p));
    } catch (_) { /* a browser that refuses replaceState just keeps its URL */ }
  }
  function restoreUrlAfterModal() {
    try {
      const target = urlBeforeModal || cleanNonProductUrl(window.location.href);
      history.replaceState(history.state, '', target);
    } catch (_) {}
    urlBeforeModal = null;
  }

  async function shareProduct(p) {
    const url = shareUrl(p);
    if (navigator.share) {
      try { await navigator.share({ title: p.name, text: `${p.name} — Brush`, url }); return; }
      catch (_) { /* dismissed: fall through to copying */ }
    }
    try {
      await navigator.clipboard.writeText(url);
      showToast('Link copied — share it anywhere');
    } catch (_) {
      window.prompt('Copy this link', url);
    }
  }

  function setModalPermalink(p) {
    const title = document.getElementById('modal-title');
    if (!title) return;
    let bar = document.getElementById('modal-link-actions');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'modal-link-actions';
      bar.className = 'modal-link-actions';
      title.insertAdjacentElement('afterend', bar);
    }
    bar.innerHTML = `
      <button type="button" class="modal-share-btn" id="modal-share-btn">
        <i class="fa-solid fa-share-nodes"></i> Share this ${/poster/i.test(String(p.productType || 'poster')) ? 'poster' : 'product'}
      </button>`;
    const btn = document.getElementById('modal-share-btn');
    if (btn) btn.addEventListener('click', () => shareProduct(p));
  }

  // Posters are bought on detail — the type, the grain, the edges. The single
  // modal image zooms on click and follows the pointer, the same gesture the
  // apparel gallery uses.
  function initPlainImageZoom(root) {
    const wrap = root.querySelector('.modal-plain-image-wrapper');
    const img = wrap && wrap.querySelector('img');
    if (!wrap || !img) return;

    const toggle = wrap.querySelector('.stage-frame-toggle');
    if (toggle) {
      toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const btn = e.target.closest('.stage-frame-btn');
        if (!btn) return;
        const isFramed = btn.dataset.frameMode === 'framed';
        const modalCol = document.querySelector('.modal-image-col');
        if (modalCol) modalCol.classList.toggle('is-gallery-framed', isFramed);
        toggle.querySelectorAll('.stage-frame-btn').forEach(b => {
          const act = b === btn;
          b.classList.toggle('is-active', act);
          b.setAttribute('aria-pressed', act ? 'true' : 'false');
        });
      });
    }

    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      const hint = wrap.querySelector('.modal-zoom-hint');
      if (hint) hint.remove();
      return;
    }
    const setOrigin = (e) => {
      const r = wrap.getBoundingClientRect();
      const x = Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100));
      const y = Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100));
      img.style.transformOrigin = `${x}% ${y}%`;
    };
    wrap.addEventListener('click', (e) => {
      if (e.target.closest('.stage-frame-toggle')) return;
      setOrigin(e);
      wrap.classList.toggle('is-zoomed');
    });
    wrap.addEventListener('mousemove', (e) => { if (wrap.classList.contains('is-zoomed')) setOrigin(e); });
    wrap.addEventListener('mouseleave', () => wrap.classList.remove('is-zoomed'));
  }

  function closeProductModal(fromHistory) {
    const wrap = document.querySelector('.modal-content-wrapper');
    if (wrap) wrap.style.removeProperty('--media-col');
    const wasOpen = productModal.classList.contains('open');
    productModal.classList.remove('open');
    productModalOverlay.classList.remove('open');
    productModal.style.display = '';
    productModalOverlay.style.display = '';
    if (wasOpen) {
      unlockPageScroll();
      restoreUrlAfterModal();
      if (fromHistory !== true && window.BrushBack) BrushBack.closed('product');
    }
    currentProduct = null;
  }
  if (window.BrushBack && productModal) BrushBack.register('product', () => closeProductModal(true), () => productModal.classList.contains('open'));

  // Back-forward cache restore: the page comes back exactly as it was left,
  // which could be mid-overlay with scrolling locked. Reset to a clean page.
  window.addEventListener('pageshow', (e) => {
    if (!e.persisted) return;
    if (productModal) { productModal.classList.remove('open'); productModalOverlay.classList.remove('open'); }
    if (cartDrawer) { cartDrawer.classList.remove('open'); cartOverlay.classList.remove('open'); }
    scrollLockCount = 0;
    scrollLockCount = 0;
    releaseScrollLock();
  });

  if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeProductModal);
  if (productModalOverlay) productModalOverlay.addEventListener('click', closeProductModal);

  // Close on Escape - same convention as the cart drawer's own Escape handler.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && productModal.classList.contains('open')) {
      closeProductModal();
    }
  });

  function setActiveSwatch(group, value) {
    group.querySelectorAll('.swatch-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.value === value);
    });
  }

  function getActiveSwatch(group) {
    return group.querySelector('.swatch-btn.active') || group.querySelector('.swatch-btn');
  }

  // Builds the modal's variant swatch groups from whatever this product's
  // type actually offers (poster: Size + Paper Quality, plate: Plate Size,
  // wallpaper: Roll Size) — reads Cart's shared PRODUCT_TYPES config so a
  // new type only has to be added in one place (cart.js) to show up here.
  const variantSelectorsEl = document.getElementById('variant-selectors');
  // Swatches honour each option's `onlyWith` rule (DTG only on the
  // Classic Crew, XS/3XL only on fits that stock them): options that don't
  // apply to the current choice are hidden, and the selection re-resolves
  // to a valid combination whenever an earlier group changes.
  let currentVariantType = 'poster';


  // Real print dimensions, so "A4" means something. Shown as scaled
  // rectangles under the size swatches — people buy a wall object and the
  // code names alone don't convey how big it is.
  const PRINT_SIZES_MM = {
    'A5': [148, 210], 'A4': [210, 297], 'A3': [297, 420],
    '12x18': [305, 457], '13x19': [330, 483]
  };

  function sizeScaleHtml(productType, typeConfig) {
    if (!/poster/i.test(String(productType))) return '';
    const group = (typeConfig.variantGroups || []).find(g => g.key === 'size');
    if (!group) return '';
    const sizes = group.options
      .filter(o => o.available !== false && PRINT_SIZES_MM[o.value])
      .map(o => ({ value: o.value, mm: PRINT_SIZES_MM[o.value] }));
    if (!sizes.length) return '';
    const tallest = Math.max(...sizes.map(s => s.mm[1]));
    return `
      <div class="size-scale-card">
        <div class="size-scale-header">
          <span class="size-scale-title"><i class="fa-solid fa-ruler-combined"></i> Wall Scale Guide</span>
          <span class="size-scale-note" id="size-scale-note"></span>
        </div>
        <div class="size-scale" id="size-scale" role="radiogroup" aria-label="Poster size scale guide">
          ${sizes.map(s => `
            <button type="button" class="size-scale-item" data-size="${escapeHtml(s.value)}" role="radio" aria-label="Select size ${escapeHtml(s.value)}" title="Select size ${escapeHtml(s.value)}">
              <span class="size-scale-box" style="height:${Math.round((s.mm[1] / tallest) * 56)}px;width:${Math.round((s.mm[0] / tallest) * 56)}px"></span>
              <span class="size-scale-label">${escapeHtml(s.value)}</span>
            </button>`).join('')}
          <div class="size-scale-ref" title="13-inch laptop reference for physical wall scale" aria-hidden="true">
            <span class="size-scale-laptop-box">
              <i class="fa-solid fa-laptop"></i>
            </span>
            <span class="size-scale-label">Laptop (13″)</span>
          </div>
        </div>
      </div>`;
  }

  function syncSizeScale(sizeValue) {
    const scale = document.getElementById('size-scale');
    if (!scale) return;
    scale.querySelectorAll('.size-scale-item').forEach(item => {
      const active = item.dataset.size === sizeValue;
      item.classList.toggle('is-active', active);
      item.setAttribute('aria-checked', active ? 'true' : 'false');
    });
    const note = document.getElementById('size-scale-note');
    const mm = PRINT_SIZES_MM[sizeValue];
    if (note && mm) {
      const inches = mm.map(v => (v / 25.4).toFixed(1));
      note.textContent = `${sizeValue} · ${mm[0] / 10} × ${mm[1] / 10} cm (${inches[0]} × ${inches[1]}″)`;
    } else if (note) {
      note.textContent = '';
    }
  }

  function renderVariantSelectors(productType) {
    if (!variantSelectorsEl) return;
    currentVariantType = productType;

    // The Music Set 10-pack (Product #540) has unique mixed print dimensions (2x A3, 2x A4, 6x A5).
    // All other poster packs (Minis, Pink, Artist, BYOP) offer the full A5 vs A4 toggle.
    const isFixedSizedMusicPack = currentProduct && (
      currentProduct.id === 540 ||
      /music aesthetic set/i.test(currentProduct.name || '')
    );

    if (isFixedSizedMusicPack) {
      variantSelectorsEl.innerHTML = `
        <div class="fixed-pack-spec-box" style="padding: 12px 14px; background: var(--bg-secondary); border: 1px solid var(--border-light); border-radius: var(--radius-md); margin-bottom: 0.5rem;">
          <div style="display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 0.88rem; color: var(--text-primary); margin-bottom: 6px;">
            <i class="fa-solid fa-layer-group" style="color: var(--accent);"></i>
            <span>Pre-Sized 10-Poster Gallery Wall Setup</span>
          </div>
          <div style="font-size: 0.82rem; color: var(--text-secondary); line-height: 1.45;">
            Includes <strong>2× A3</strong> (Lana Del Rey, Arctic Monkeys) + <strong>2× A4</strong> (Chill, Cat Yawn) + <strong>6× A5</strong> (Song Boards). Printed on museum-grade 300 GSM matte art paper.
          </div>
        </div>
      `;
      return;
    }

    const typeConfig = Cart.typeConfigFor(productType);
    const initial = Cart.resolveVariants(typeConfig, null).variants;
    variantSelectorsEl.innerHTML = typeConfig.variantGroups.map(group => `
      <div class="selector-group" data-group-wrap="${group.key}">
        <label id="variant-label-${group.key}">${group.label}</label>
        <div class="swatch-group swatch-group--${group.key}" data-group-key="${group.key}" role="group" aria-labelledby="variant-label-${group.key}">
          ${group.options.map(opt => `
            <button type="button" class="swatch-btn ${initial[group.key] === opt.value ? 'active' : ''}" data-value="${escapeHtml(opt.value)}" data-price="${opt.priceDelta}" aria-pressed="${initial[group.key] === opt.value}">
              ${opt.swatch ? `<span class="swatch-dot" style="--dot:${escapeHtml(opt.swatch)}" aria-hidden="true"></span>` : ''}<span class="swatch-label">${escapeHtml(opt.label)}</span>${opt.priceDelta ? ` <small>${opt.priceDelta > 0 ? `+₹${opt.priceDelta}` : `−₹${Math.abs(opt.priceDelta)}`}</small>` : ''}
            </button>
          `).join('')}
        </div>
      </div>
    `).join('') + sizeScaleHtml(productType, typeConfig) + (typeConfig.variantGroups.length ? '<p class="variant-note" id="variant-note"></p>' : '');
    syncVariantAvailability();
  }

  function syncVariantAvailability() {
    if (!variantSelectorsEl) return;
    const typeConfig = Cart.typeConfigFor(currentVariantType);
    const { variants } = Cart.resolveVariants(typeConfig, readSwatches());
    const chosen = {};
    typeConfig.variantGroups.forEach(group => {
      const groupEl = variantSelectorsEl.querySelector(`.swatch-group[data-group-key="${group.key}"]`);
      if (!groupEl) return;
      let visible = 0;
      group.options.forEach(opt => {
        const btn = groupEl.querySelector(`.swatch-btn[data-value="${CSS.escape(opt.value)}"]`);
        const ok = Cart.optionAllowed(opt, chosen);
        const stockOk = opt.available !== false;
        // Legacy sizes that can't be ordered used to be listed struck through —
        // nine dead options buried the four real ones. They're hidden now.
        btn.hidden = !ok || !stockOk;
        if (ok && !stockOk) {
          btn.disabled = true;
          btn.style.opacity = '0.5';
          btn.style.textDecoration = 'line-through';
          btn.title = 'Out of Stock';
        } else {
          btn.disabled = false;
          btn.style.opacity = '';
          btn.style.textDecoration = '';
          btn.title = '';
        }
        if (ok && stockOk) visible++;
        const on = variants[group.key] === opt.value;
        btn.classList.toggle('active', on);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      chosen[group.key] = variants[group.key];
      // A group with a single possible choice (e.g. Print on a Polo is
      // DTF-only) still shows, so shoppers can see what they're getting.
      groupEl.classList.toggle('is-single', visible === 1);
    });
    syncSizeScale(variants.size);
    const note = document.getElementById('variant-note');
    if (note) {
      note.textContent = normalizeTypeKey(currentVariantType) === 'apparel'
        ? 'Front chest logo + full back print. DTG is available on the Classic Crew only.'
        : (normalizeTypeKey(currentVariantType) === 'poster' ? 'Printed on 300 GSM art board. Inch sizes may crop the artwork slightly to fit.' : '');
    }
  }

  function normalizeTypeKey(t) {
    return Cart.typeConfigFor(t) === Cart.PRODUCT_TYPES.apparel ? 'apparel'
      : (Cart.typeConfigFor(t) === Cart.PRODUCT_TYPES.poster ? 'poster' : 'other');
  }

  function readSwatches() {
    const v = {};
    if (!variantSelectorsEl) return v;
    variantSelectorsEl.querySelectorAll('.swatch-group').forEach(group => {
      const active = group.querySelector('.swatch-btn.active');
      if (active) v[group.dataset.groupKey] = active.dataset.value;
    });
    return v;
  }

  function updateModalPrice() {
    if (!currentProduct || !variantSelectorsEl) return;
    const { price } = Cart.priceFor(currentProduct, readSwatches());
    const finalPrice = Math.max(10, price);
    const qtyInput = document.getElementById('modal-qty-input');
    const qty = qtyInput ? Math.max(1, parseInt(qtyInput.value, 10) || 1) : 1;
    const lineTotal = finalPrice * qty;

    document.getElementById('modal-price').textContent = `₹${finalPrice}`;
    const btnPrice = document.getElementById('modal-btn-price');
    if (btnPrice) {
      btnPrice.textContent = qty > 1 ? `₹${lineTotal} (${qty} items)` : `₹${finalPrice}`;
    }
    const orig = document.getElementById('modal-original-price');
    const discountBadge = document.getElementById('modal-discount-badge');
    if (orig) {
      const hasDiscount = currentProduct.originalPrice > finalPrice;
      orig.style.display = hasDiscount ? '' : 'none';
      if (discountBadge) {
        if (hasDiscount) {
          const pct = Math.round(((currentProduct.originalPrice - finalPrice) / currentProduct.originalPrice) * 100);
          discountBadge.textContent = `${pct}% OFF`;
          discountBadge.style.display = 'inline-flex';
        } else {
          discountBadge.style.display = 'none';
        }
      }
    }

    const taxInfo = document.getElementById('modal-tax-inclusive');
    if (taxInfo) {
      const typeConfig = Cart.typeConfigFor(currentProduct.productType);
      if (typeConfig && typeConfig.gstRate) {
        const ratePct = Math.round(typeConfig.gstRate * 100);
        // Reverse calculate tax amount from inclusive price
        const priorPrice = Math.round(finalPrice / (1 + typeConfig.gstRate));
        const taxVal = finalPrice - priorPrice;
        taxInfo.textContent = `Inclusive of all taxes (${ratePct}% GST: ₹${taxVal})`;
        taxInfo.style.display = '';
      } else {
        taxInfo.textContent = 'Inclusive of all taxes';
        taxInfo.style.display = '';
      }
    }
  }

  function initModalComboOffers(product) {
    const comboSection = document.getElementById('modal-combo-section');
    if (!comboSection) return;
    const type = (product.productType || product.category || 'poster').toLowerCase();
    const isPoster = type === 'poster' || type === 'posters';
    if (!isPoster) {
      comboSection.style.display = 'none';
      return;
    }
    comboSection.style.display = 'block';

    const qtyInput = document.getElementById('modal-qty-input');
    if (qtyInput) qtyInput.value = '1';

    const activeMsg = document.getElementById('modal-combo-active-msg');
    if (activeMsg) {
      activeMsg.style.display = 'none';
      activeMsg.innerHTML = '';
    }

    const cards = comboSection.querySelectorAll('.combo-tier-card');
    cards.forEach(card => card.classList.remove('selected'));

    const cartItems = Cart.getCart();
    const existingPosters = cartItems
      .filter(l => (l.productType || 'poster').toLowerCase() === 'poster')
      .reduce((sum, l) => sum + (Number(l.quantity) || 0), 0);

    if (existingPosters > 0) {
      const charges = Cart.getCharges('prepaid');
      if (charges.bundleFreeCount > 0) {
        if (activeMsg) {
          activeMsg.style.display = 'flex';
          activeMsg.innerHTML = `<i class="fa-solid fa-gift"></i> You currently have <strong>${charges.bundleFreeCount} FREE posters</strong> in your cart (${escapeHtml(charges.bundleLabel)})!`;
        }
      } else if (charges.bundleToNext > 0) {
        if (activeMsg) {
          activeMsg.style.display = 'flex';
          const nt = charges.bundleNextTier;
          if (nt && existingPosters >= nt.buy) {
            const freeWord = charges.bundleToNext === 1 ? 'your free poster' : `your ${charges.bundleToNext} free posters`;
            activeMsg.innerHTML = `<i class="fa-solid fa-gift" style="color: #10b981;"></i> You have ${existingPosters} posters in cart &bull; <strong>🎉 Offer unlocked! Add ${escapeHtml(freeWord)}</strong>!`;
          } else {
            let hint = 'the next combo offer';
            if (nt) {
              const nextFree = nt.free != null ? nt.free : (nt.get - nt.buy);
              hint = nextFree === 1
                ? `Buy ${nt.buy} Get ${nt.get} (1 FREE)`
                : `Buy ${nt.buy} Get ${nt.get} (${nextFree} FREE)`;
            }
            activeMsg.innerHTML = `<i class="fa-solid fa-sparkles"></i> You have ${existingPosters} poster${existingPosters > 1 ? 's' : ''} in cart &bull; <strong>Add ${charges.bundleToNext} more</strong> to get <strong>${escapeHtml(hint)}</strong>!`;
          }
        }
      }
    }
  }

  function syncComboCardSelection(qty) {
    const cards = document.querySelectorAll('#modal-combo-grid .combo-tier-card');
    cards.forEach(c => c.classList.remove('selected'));
    const activeMsg = document.getElementById('modal-combo-active-msg');
    if (qty >= 36) {
      document.querySelector('#modal-combo-grid .combo-tier-card[data-get="36"]')?.classList.add('selected');
      if (activeMsg) {
        activeMsg.style.display = 'flex';
        activeMsg.innerHTML = `<i class="fa-solid fa-crown"></i> <strong>Mega Combo: Buy 30 Get 6 Free!</strong> 6 lowest priced posters are FREE at checkout.`;
      }
    } else if (qty >= 24) {
      document.querySelector('#modal-combo-grid .combo-tier-card[data-get="24"]')?.classList.add('selected');
      if (activeMsg) {
        activeMsg.style.display = 'flex';
        activeMsg.innerHTML = `<i class="fa-solid fa-gift"></i> <strong>Buy 20 Get 4 Free!</strong> 4 lowest priced posters are FREE at checkout.`;
      }
    } else if (qty >= 13) {
      document.querySelector('#modal-combo-grid .combo-tier-card[data-get="13"]')?.classList.add('selected');
      if (activeMsg) {
        activeMsg.style.display = 'flex';
        activeMsg.innerHTML = `<i class="fa-solid fa-fire"></i> <strong>Recommended: Buy 10 Get 3 Free!</strong> 3 lowest priced posters are FREE at checkout.`;
      }
    } else if (qty >= 6) {
      document.querySelector('#modal-combo-grid .combo-tier-card[data-get="6"]')?.classList.add('selected');
      if (activeMsg) {
        activeMsg.style.display = 'flex';
        activeMsg.innerHTML = `<i class="fa-solid fa-gift"></i> <strong>Buy 5 Get 1 Free!</strong> Lowest priced poster is FREE at checkout.`;
      }
    } else {
      if (activeMsg) {
        activeMsg.style.display = 'none';
        activeMsg.innerHTML = '';
      }
    }
  }

  // Setup combo tier cards click listener
  const modalComboGrid = document.getElementById('modal-combo-grid');
  if (modalComboGrid) {
    modalComboGrid.addEventListener('click', (e) => {
      const card = e.target.closest('.combo-tier-card');
      if (!card) return;
      const getQty = parseInt(card.dataset.get, 10) || 1;
      const qtyInput = document.getElementById('modal-qty-input');
      if (qtyInput) {
        qtyInput.value = getQty;
      }
      syncComboCardSelection(getQty);
      updateModalPrice();
    });
  }

  // Setup modal quantity stepper
  const modalQtyMinus = document.getElementById('modal-qty-minus');
  const modalQtyPlus = document.getElementById('modal-qty-plus');
  const modalQtyInput = document.getElementById('modal-qty-input');

  if (modalQtyMinus && modalQtyInput) {
    modalQtyMinus.addEventListener('click', () => {
      const current = parseInt(modalQtyInput.value, 10) || 1;
      const val = Math.max(1, current - 1);
      modalQtyInput.value = val;
      syncComboCardSelection(val);
      updateModalPrice();
    });
  }

  if (modalQtyPlus && modalQtyInput) {
    modalQtyPlus.addEventListener('click', () => {
      const maxStock = currentProduct && currentProduct.stockQuantity !== undefined ? currentProduct.stockQuantity : 50;
      const current = parseInt(modalQtyInput.value, 10) || 1;
      const val = Math.min(maxStock, current + 1);
      modalQtyInput.value = val;
      syncComboCardSelection(val);
      updateModalPrice();
    });
  }

  if (modalQtyInput) {
    modalQtyInput.addEventListener('change', () => {
      const maxStock = currentProduct && currentProduct.stockQuantity !== undefined ? currentProduct.stockQuantity : 50;
      let val = parseInt(modalQtyInput.value, 10) || 1;
      val = Math.max(1, Math.min(maxStock, val));
      modalQtyInput.value = val;
      syncComboCardSelection(val);
      updateModalPrice();
    });
  }

  // One delegated listener handles every group regardless of how many the
  // current product type has, plus interactive wall scale guide clicks.
  if (variantSelectorsEl) {
    variantSelectorsEl.addEventListener('click', (e) => {
      const scaleBtn = e.target.closest('.size-scale-item');
      if (scaleBtn) {
        const sizeVal = scaleBtn.dataset.size;
        const sizeGroup = variantSelectorsEl.querySelector('.swatch-group[data-group-key="size"]');
        if (sizeGroup) {
          const targetSwatch = sizeGroup.querySelector(`.swatch-btn[data-value="${CSS.escape(sizeVal)}"]`);
          if (targetSwatch && !targetSwatch.disabled && !targetSwatch.hidden) {
            targetSwatch.click();
          }
        }
        return;
      }

      const btn = e.target.closest('.swatch-btn');
      if (!btn || btn.hidden) return;
      setActiveSwatch(btn.closest('.swatch-group'), btn.dataset.value);
      syncVariantAvailability();
      updateModalPrice();

      // Sync frame preview if framing variant changed
      const currentVariants = readSwatches();
      if (currentVariants.frame) {
        const isFramed = currentVariants.frame !== 'none';
        const color = currentVariants.frame.includes('white') ? 'white' : 'black';
        const modalCol = document.querySelector('.modal-image-col');
        if (modalCol) {
          modalCol.classList.toggle('is-gallery-framed', isFramed);
          modalCol.setAttribute('data-frame-color', color);
        }
        document.querySelectorAll('.stage-frame-btn').forEach(fb => {
          const active = isFramed ? fb.dataset.frameMode === 'framed' : fb.dataset.frameMode === 'unframed';
          fb.classList.toggle('is-active', active);
          fb.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
      }
    });
  }

  function getSelectedVariants() {
    return Cart.resolveVariants(Cart.typeConfigFor(currentVariantType), readSwatches()).variants;
  }

  const modalAddToCartBtn = document.getElementById('modal-add-to-cart');
  if (modalAddToCartBtn) {
    modalAddToCartBtn.addEventListener('click', () => {
      if (!currentProduct) return;
      if (currentProduct.stockQuantity !== undefined && currentProduct.stockQuantity <= 0) {
        showToast('Sorry, this product is currently out of stock.');
        return;
      }

      // Tactile button bounce & feedback
      modalAddToCartBtn.classList.add('is-added');
      setTimeout(() => {
        modalAddToCartBtn.classList.remove('is-added');
      }, 1200);

      const variants = getSelectedVariants();
      const finalPrice = Cart.priceFor(currentProduct, variants).price;
      const qtyInput = document.getElementById('modal-qty-input');
      const qty = qtyInput ? Math.max(1, parseInt(qtyInput.value, 10) || 1) : 1;

      // Capture the modal's poster position before closeProductModal() starts
      // its own close transition, which would otherwise move/fade it out from
      // under a getBoundingClientRect() read.
      flyToCart(document.querySelector('.modal-image-col .mockup-poster, .modal-image-col .modal-plain-image'));

      Cart.addItem(currentProduct, qty, variants, finalPrice);

      const isPoster = (currentProduct.productType || currentProduct.category || 'poster').toLowerCase().startsWith('poster');
      if (isPoster) {
        const charges = Cart.getCharges('prepaid');
        showToast(getPosterMilestoneMsg(charges.bundlePosterCount), { showCartBtn: true });
      } else {
        showToast(`${currentProduct.name} added to cart!`, { showCartBtn: true });
      }
      closeProductModal();
    });
  }

  const modalViewArBtn = document.getElementById('modal-view-ar-btn');
  if (modalViewArBtn) {
    modalViewArBtn.addEventListener('click', () => {
      if (window.innerWidth >= 992) {
        showToast('AR view requires a phone camera (open on mobile for AR)');
        return;
      }
      if (!currentProduct) return;
      const variants = getSelectedVariants ? getSelectedVariants() : {};
      const size = variants.size || 'A4';
      const selectedFrame = String(variants.frame || 'none');
      const frame = selectedFrame === 'none' || selectedFrame === 'unframed' ? 'unframed' : 'framed';
      const frameColor = selectedFrame.startsWith('white') ? 'white' : 'black';
      const productConfig = Cart.typeConfigFor(currentProduct.productType || currentProduct.category || 'poster');
      const arSizes = window.BrushAR ? window.BrushAR.POSTER_SIZES : {};
      const sizeGroup = (productConfig.variantGroups || []).find(group => group.key === 'size');
      const frameGroup = (productConfig.variantGroups || []).find(group => group.key === 'frame');
      const availableSizes = sizeGroup
        ? sizeGroup.options.filter(option => option.available !== false && arSizes[option.value]).map(option => option.value)
        : ['A4'];
      const frameColorsBySize = {};
      availableSizes.forEach(availableSize => {
        const allowedFrames = frameGroup
          ? frameGroup.options.filter(option => option.available !== false && option.value !== 'none' && Cart.optionAllowed(option, { size: availableSize }))
          : [];
        frameColorsBySize[availableSize] = [...new Set(allowedFrames.map(option => String(option.value).startsWith('white') ? 'white' : 'black'))];
      });
      if (window.BrushAR) {
        window.BrushAR.open({
          image: currentProduct.image,
          name: currentProduct.name,
          size: size,
          frame: frame,
          frameColor: frameColor,
          availableSizes: availableSizes,
          frameColorsBySize: frameColorsBySize,
          productId: currentProduct.id || currentProduct._id || currentProduct.name,
          onVariantChange: (newSize, newFrame, newColor) => {
            if (variantSelectorsEl) {
              if (newSize) {
                const sizeGroup = variantSelectorsEl.querySelector('.swatch-group[data-group-key="size"]');
                if (sizeGroup) setActiveSwatch(sizeGroup, newSize);
              }
              if (newFrame) {
                const frameGroup = variantSelectorsEl.querySelector('.swatch-group[data-group-key="frame"]');
                const frameValue = newFrame === 'unframed' ? 'none' : `${newColor || 'black'}_${newSize.toLowerCase()}`;
                if (frameGroup) setActiveSwatch(frameGroup, frameValue);
              }
              if (newColor) {
                const colorGroup = variantSelectorsEl.querySelector('.swatch-group[data-group-key="frameColor"]');
                if (colorGroup) setActiveSwatch(colorGroup, newColor);
              }
              syncVariantAvailability();
              updateModalPrice();
            }
          }
        });
      } else {
        showToast('Augmented reality engine loading...');
      }
    });
  }

  // ---- Frequently Bought Together (Flipkart-style Poster Bundle) ----
  let fbtCurrentItems = [];
  async function renderFrequentlyBoughtTogether(product) {
    const section = document.getElementById('modal-fbt-section');
    if (!section) return;
    if (!product) {
      section.style.display = 'none';
      section.innerHTML = '';
      return;
    }

    try {
      const allProducts = await getProducts();
      const currentType = (product.productType || 'poster').toLowerCase();
      const isPoster = currentType === 'poster';

      const sameType = allProducts.filter(p => {
        if (!p || String(p.id) === String(product.id)) return false;
        const pType = (p.productType || 'poster').toLowerCase();
        return pType === currentType && (p.stockQuantity === undefined || p.stockQuantity > 0);
      });

      // Popularity score helper incorporating CTR, Buy Rate, and 48hr rotation
      const getPop = (p) => (window.BrushAnalytics && typeof window.BrushAnalytics.computePopularityScore === 'function')
        ? window.BrushAnalytics.computePopularityScore(p)
        : (Number(p.orderFrequency) || 0);

      let related = sameType.filter(p => p.category && product.category && p.category.toLowerCase() === product.category.toLowerCase());
      related.sort((a, b) => getPop(b) - getPop(a));

      if (related.length < 2) {
        const others = sameType.filter(p => !related.some(r => String(r.id) === String(p.id)));
        others.sort((a, b) => getPop(b) - getPop(a));
        related = related.concat(others);
      }
      const bundleAddons = related.slice(0, 2);

      if (bundleAddons.length === 0) {
        section.style.display = 'none';
        section.innerHTML = '';
        return;
      }

      // EDITORIAL CURATED 3-PACK FOR POSTERS
      if (isPoster && bundleAddons.length >= 2) {
        const item0 = product;
        const item1 = bundleAddons[0];
        const item2 = bundleAddons[1];
        const trioIds = `${item0.id},${item1.id},${item2.id}`;

        section.innerHTML = `
          <div class="curated-trio-card">
            <div class="curated-trio-header">
              <div class="curated-trio-title-wrap">
                <span class="curated-trio-pill"><i class="fa-solid fa-wand-magic-sparkles"></i> Curated Gallery Trio</span>
                <h3 class="curated-trio-heading">Pairs Well With &mdash; Complete the 3-Pack</h3>
              </div>
              <span class="curated-trio-discount-badge">Save ₹248 &bull; 83% OFF</span>
            </div>

            <p class="curated-trio-subhead">Handpicked to complement each other. Get this complete 3-poster gallery set at our official 3-Pack bundle rate.</p>

            <div class="curated-trio-strip">
              <div class="curated-trio-thumb is-main" title="${escapeHtml(item0.name)}">
                <div class="curated-trio-poster-wrapper">
                  <img ${imgAttrsFor(item0, 300)} alt="${escapeHtml(item0.name)}" loading="lazy">
                  <span class="trio-thumb-label">This Piece</span>
                </div>
                <span class="trio-thumb-title">${escapeHtml(item0.name)}</span>
              </div>

              <div class="curated-trio-connector"><i class="fa-solid fa-plus"></i></div>

              <div class="curated-trio-thumb" title="${escapeHtml(item1.name)}">
                <div class="curated-trio-poster-wrapper">
                  <img ${imgAttrsFor(item1, 300)} alt="${escapeHtml(item1.name)}" loading="lazy">
                  <span class="trio-thumb-label companion">Curated Match</span>
                </div>
                <span class="trio-thumb-title">${escapeHtml(item1.name)}</span>
              </div>

              <div class="curated-trio-connector"><i class="fa-solid fa-plus"></i></div>

              <div class="curated-trio-thumb" title="${escapeHtml(item2.name)}">
                <div class="curated-trio-poster-wrapper">
                  <img ${imgAttrsFor(item2, 300)} alt="${escapeHtml(item2.name)}" loading="lazy">
                  <span class="trio-thumb-label companion">Curated Match</span>
                </div>
                <span class="trio-thumb-title">${escapeHtml(item2.name)}</span>
              </div>
            </div>

            <div class="curated-trio-footer">
              <div class="curated-trio-pricing">
                <div class="curated-trio-price-row">
                  <span class="curated-trio-price">₹49</span>
                  <span class="curated-trio-mrp">₹297</span>
                  <span class="curated-trio-unit">bundle price (3 posters)</span>
                </div>
                <div class="curated-trio-specs">
                  <span><i class="fa-solid fa-check"></i> 350 GSM Matte Art Paper</span>
                  <span><i class="fa-solid fa-check"></i> A5 Gallery Size</span>
                </div>
              </div>

              <div class="curated-trio-actions">
                <button type="button" class="curated-trio-add-btn" id="curated-trio-add-btn">
                  <i class="fa-solid fa-cart-plus"></i>
                  <span>Add 3-Pack to Cart &bull; <strong>₹49</strong></span>
                </button>
                <a href="build-pack.html?posters=${trioIds}" class="curated-trio-builder-btn" id="curated-trio-builder-btn">
                  <i class="fa-solid fa-wand-magic-sparkles"></i>
                  <span>Customize in Wall Builder</span>
                </a>
              </div>
            </div>
          </div>
        `;
        section.style.display = 'block';

        // Add 3-Pack button event
        const trioAddBtn = section.querySelector('#curated-trio-add-btn');
        if (trioAddBtn) {
          trioAddBtn.onclick = () => {
            const trioItem = {
              id: 9993,
              name: `Curated 3-Poster Pack (${item0.name} + 2 Complements)`,
              price: 49,
              category: 'Wall Setup Packs',
              productType: 'poster_3_pack',
              image: item0.image,
              variants: { size: 'A5', frame: 'none' },
              customPosters: [
                { id: item0.id, name: item0.name, image: item0.image, size: 'A5' },
                { id: item1.id, name: item1.name, image: item1.image, size: 'A5' },
                { id: item2.id, name: item2.name, image: item2.image, size: 'A5' }
              ],
              quantity: 1
            };

            const cartApi = (typeof Cart !== 'undefined' && Cart) || (typeof window !== 'undefined' && window.Cart);
            if (cartApi && typeof cartApi.addItem === 'function') {
              cartApi.addItem(trioItem, 1, { size: 'A5', frame: 'none' }, 49);
            }

            flyToCart(document.querySelector('.modal-image-col .mockup-poster, .modal-image-col .modal-plain-image'));
            showToast('Added Curated 3-Poster Pack to cart! (₹49)');
            closeProductModal();
          };
        }
        return;
      }

      // For non-poster items (apparel/hoodies), provide clean 2-item combo add-on
      const currentPrice = Cart.priceFor(product, null).price;
      fbtCurrentItems = [
        {
          id: String(product.id),
          product: product,
          name: product.name,
          price: currentPrice,
          image: product.image,
          selected: true,
          isMain: true
        },
        ...bundleAddons.map(item => ({
          id: String(item.id),
          product: item,
          name: item.name,
          price: Cart.priceFor(item, null).price,
          image: item.image,
          selected: true,
          isMain: false
        }))
      ];

      function buildFbtHtml() {
        const selectedItems = fbtCurrentItems.filter(item => item.selected);
        const selectedCount = selectedItems.length;
        const rawTotal = selectedItems.reduce((acc, item) => acc + item.price, 0);
        const bundleDiscount = selectedCount >= 2 ? Math.round(rawTotal * 0.1) : 0;
        const finalTotal = Math.max(0, rawTotal - bundleDiscount);

        const thumbsHtml = fbtCurrentItems.map((item, index) => `
          ${index > 0 ? `<div class="fbt-connector"><i class="fa-solid fa-plus"></i></div>` : ''}
          <div class="fbt-thumb-card ${item.selected ? 'is-selected' : 'is-unselected'}" data-fbt-id="${item.id}">
            <img ${imgAttrsFor(item.product, 300)} alt="${escapeHtml(item.name)}" loading="lazy">
            ${item.isMain ? '<span class="fbt-this-badge">This item</span>' : ''}
          </div>
        `).join('');

        const checkboxesHtml = fbtCurrentItems.map(item => `
          <label class="fbt-checkbox-row ${item.selected ? 'is-checked' : ''}">
            <input type="checkbox" class="fbt-checkbox" data-fbt-id="${item.id}" ${item.selected ? 'checked' : ''}>
            <span class="fbt-checkbox-custom"><i class="fa-solid fa-check"></i></span>
            <span class="fbt-item-title">${item.isMain ? '<strong>This item:</strong> ' : ''}${escapeHtml(item.name)}</span>
            <span class="fbt-item-price">₹${item.price}</span>
          </label>
        `).join('');

        return `
          <div class="fbt-card">
            <div class="fbt-header">
              <div class="fbt-title-wrap">
                <i class="fa-solid fa-layer-group fbt-badge-icon"></i>
                <h3 class="fbt-heading">Frequently Bought Together</h3>
              </div>
              <span class="fbt-pill">Combo Offer</span>
            </div>

            <div class="fbt-visual-strip">
              ${thumbsHtml}
            </div>

            <div class="fbt-items-list">
              ${checkboxesHtml}
            </div>

            <div class="fbt-summary-box">
              <div class="fbt-pricing-row">
                <span class="fbt-total-label">Total for ${selectedCount} item${selectedCount === 1 ? '' : 's'}:</span>
                <span class="fbt-final-price">₹${finalTotal}</span>
                ${bundleDiscount > 0 ? `
                  <span class="fbt-raw-price">₹${rawTotal}</span>
                  <span class="fbt-save-pill">Save ₹${bundleDiscount} (10% OFF)</span>
                ` : ''}
              </div>
              <button type="button" class="fbt-add-btn" id="fbt-add-btn" ${selectedCount === 0 ? 'disabled' : ''}>
                <i class="fa-solid fa-cart-plus"></i>
                <span>${selectedCount <= 1 ? 'Add Selected to Cart' : `Add all ${selectedCount} to Cart`} &bull; <strong>₹${finalTotal}</strong></span>
              </button>
            </div>
          </div>
        `;
      }

      section.innerHTML = buildFbtHtml();
      section.style.display = 'block';

      // Event delegation for checkbox changes
      section.onchange = (e) => {
        const checkbox = e.target.closest('.fbt-checkbox');
        if (!checkbox) return;
        const targetId = checkbox.dataset.fbtId;
        const found = fbtCurrentItems.find(it => String(it.id) === String(targetId));
        if (found) {
          found.selected = checkbox.checked;
          section.innerHTML = buildFbtHtml();
        }
      };

      // Handle thumbnail card click to toggle selection
      section.onclick = (e) => {
        const thumb = e.target.closest('.fbt-thumb-card');
        if (thumb) {
          const targetId = thumb.dataset.fbtId;
          const found = fbtCurrentItems.find(it => String(it.id) === String(targetId));
          if (found) {
            found.selected = !found.selected;
            section.innerHTML = buildFbtHtml();
            return;
          }
        }

        const addBtn = e.target.closest('#fbt-add-btn');
        if (addBtn) {
          const selectedItems = fbtCurrentItems.filter(item => item.selected);
          if (!selectedItems.length) return;

          // For the main item, use the user's currently selected modal variants
          selectedItems.forEach(item => {
            if (item.isMain) {
              const currentVariants = getSelectedVariants();
              const pPrice = Cart.priceFor(item.product, currentVariants).price;
              Cart.addItem(item.product, 1, currentVariants, pPrice);
            } else {
              // Complementary posters take default variant
              const defVariants = Cart.resolveVariants(Cart.typeConfigFor(item.product.productType || 'poster'), null).variants;
              const pPrice = Cart.priceFor(item.product, defVariants).price;
              Cart.addItem(item.product, 1, defVariants, pPrice);
            }
          });

          flyToCart(document.querySelector('.modal-image-col .mockup-poster, .modal-image-col .modal-plain-image'));
          showToast(`${selectedItems.length} item${selectedItems.length > 1 ? 's' : ''} added to cart!`);
          closeProductModal();
        }
      };

    } catch (err) {
      console.error('Failed to load Frequently Bought Together', err);
      section.style.display = 'none';
      section.innerHTML = '';
    }
  }

  function renderReviews() {
    const list = document.getElementById('reviews-list');
    const count = document.getElementById('review-count');
    const reviews = currentProduct.reviews || [];

    count.textContent = reviews.length;

    if (reviews.length === 0) {
      list.innerHTML = '<p style="color: var(--text-secondary); font-size: 0.9rem;">No reviews yet. Be the first to review!</p>';
      return;
    }

    list.innerHTML = reviews.map(r => {
      // Reviews come from unauthenticated shoppers, so `user`/`comment` must
      // never reach innerHTML unescaped — an attacker submitting a review
      // is the site's single largest stored-XSS surface otherwise, hit by
      // every visitor who opens that product. Rating is also clamped:
      // 'x'.repeat() throws on a negative count, which would break the
      // whole reviews list for a malformed/malicious rating value.
      const stars = Math.max(0, Math.min(5, Math.round(Number(r.rating)) || 0));
      const safeUser = escapeHtml(r.user);
      return `
      <div class="review-item">
        <div class="review-header">
          <span class="review-author">${safeUser}</span>
          <span class="review-date">${new Date(r.date).toLocaleDateString()}</span>
        </div>
        <div class="review-stars">${starsHtml(stars)}</div>
        <p class="review-text">${escapeHtml(r.comment)}</p>
        ${r.photo ? `<img class="review-photo" src="${escapeHtml(r.photo)}" alt="Photo from ${safeUser}'s review" loading="lazy">` : ''}
      </div>
    `;
    }).join('');
  }

  // ---- Interactive star picker (review form) ----
  const STAR_WORDS = ['', 'Poor', 'Fair', 'Good', 'Great', 'Loved it'];
  const starInput = document.querySelector('.star-input');
  const starCaption = document.getElementById('star-input-caption');
  const ratingHidden = document.getElementById('review-rating');

  function setStarCaption(v, preview) {
    if (!starCaption) return;
    starCaption.textContent = v ? `${v}/5 · ${STAR_WORDS[v]}` : 'Tap a star to rate';
    starCaption.classList.toggle('is-preview', !!preview);
  }
  function resetStarInput() {
    if (!starInput) return;
    starInput.querySelectorAll('input[type="radio"]').forEach(r => { r.checked = false; });
    if (ratingHidden) ratingHidden.value = '';
    starInput.classList.remove('needs-rating', 'shake');
    setStarCaption(0);
  }
  if (starInput) {
    starInput.querySelectorAll('input[type="radio"]').forEach(radio => {
      radio.addEventListener('change', () => {
        ratingHidden.value = radio.value;
        starInput.classList.remove('needs-rating');
        setStarCaption(Number(radio.value));
        const label = starInput.querySelector(`label[for="${radio.id}"]`);
        if (label) { label.classList.remove('pop'); void label.offsetWidth; label.classList.add('pop'); }
      });
    });
    starInput.querySelectorAll('label').forEach(label => {
      const v = Number(document.getElementById(label.htmlFor).value);
      label.addEventListener('mouseenter', () => setStarCaption(v, true));
    });
    starInput.addEventListener('mouseleave', () => setStarCaption(Number(ratingHidden.value) || 0));
  }

  // ---- Rating summary under the modal title ----
  function renderModalRating() {
    const title = document.getElementById('modal-title');
    if (!title || !currentProduct) return;
    let el = document.getElementById('modal-rating');
    if (!el) {
      el = document.createElement('button');
      el.type = 'button';
      el.id = 'modal-rating';
      el.className = 'modal-rating';
      title.insertAdjacentElement('afterend', el);
      el.addEventListener('click', () => {
        const target = document.querySelector('#product-modal .reviews-section');
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
    const { avg, count } = ratingStats(currentProduct);
    el.innerHTML = count
      ? `${starsHtml(avg)}<span class="modal-rating-value">${avg.toFixed(1)}</span><span class="modal-rating-count">${count} review${count === 1 ? '' : 's'}</span>`
      : `${starsHtml(0)}<span class="modal-rating-count">No reviews yet · be the first</span>`;
  }

  const reviewForm = document.getElementById('review-form');
  const reviewPhotoInput = document.getElementById('review-photo');
  const reviewPhotoPreview = document.getElementById('review-photo-preview');
  const reviewPhotoLabelText = document.getElementById('review-photo-label-text');

  if (reviewPhotoInput) {
    reviewPhotoInput.addEventListener('change', () => {
      const file = reviewPhotoInput.files[0];
      if (!file) {
        reviewPhotoPreview.hidden = true;
        reviewPhotoLabelText.textContent = 'Add a photo (optional)';
        return;
      }
      reviewPhotoPreview.src = URL.createObjectURL(file);
      reviewPhotoPreview.hidden = false;
      reviewPhotoLabelText.textContent = file.name;
    });
  }

  if (reviewForm) {
    reviewForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!currentProduct) return;

      const ratingInput = document.getElementById('review-rating');
      if (!ratingInput.value) {
        const starBox = reviewForm.querySelector('.star-input');
        if (starBox) {
          starBox.classList.remove('shake');
          void starBox.offsetWidth;
          starBox.classList.add('shake', 'needs-rating');
        }
        showToast('Please pick a star rating');
        return;
      }

      const btn = reviewForm.querySelector('button[type="submit"]') || reviewForm.querySelector('button');
      btn.textContent = 'Submitting...';
      btn.disabled = true;

      const payload = new FormData();
      payload.append('user', document.getElementById('review-name').value);
      payload.append('rating', document.getElementById('review-rating').value);
      payload.append('comment', document.getElementById('review-comment').value);
      if (reviewPhotoInput && reviewPhotoInput.files[0]) {
        payload.append('photo', reviewPhotoInput.files[0]);
      }

      try {
        const res = await fetch(`${API_BASE}/products/${currentProduct.id}/reviews`, {
          method: 'POST',
          body: payload
        });

        if (!res.ok) throw new Error('Failed to submit review');

        const newReview = await res.json();
        if (!currentProduct.reviews) currentProduct.reviews = [];
        currentProduct.reviews.push(newReview);
        if (newReview && newReview.ratingStats && newReview.ratingStats.average) {
          updateLandingRatingDisplay(newReview.ratingStats.average);
        } else {
          initLandingRatingStats();
        }

        reviewForm.reset();
        resetStarInput();
        reviewPhotoPreview.hidden = true;
        reviewPhotoLabelText.textContent = 'Add a photo (optional)';
        renderReviews();
        renderModalRating();
        showToast('Review submitted successfully!');
      } catch (err) {
        showToast('Error submitting review');
      } finally {
        btn.textContent = 'Submit Review';
        btn.disabled = false;
      }
    });
  }

  // ===== AUTHENTICATION & PROFILE =====
  const authModal = document.getElementById('auth-modal');
  const authModalOverlay = document.getElementById('auth-modal-overlay');
  const profileModal = document.getElementById('profile-modal');
  const profileModalOverlay = document.getElementById('profile-modal-overlay');
  
  document.addEventListener('click', (e) => {
    const accountBtn = e.target.closest('a[aria-label="Account"]');
    if (accountBtn) {
      e.preventDefault();
      const currentUser = localStorage.getItem('brushUser');
      if (currentUser) {
        openProfileModal(JSON.parse(currentUser));
      } else {
        openAuthModal();
      }
    }
    
    const ordersBtn = e.target.closest('a[aria-label="Orders"]');
    if (ordersBtn) {
      e.preventDefault();
      const currentUser = localStorage.getItem('brushUser');
      if (currentUser) {
        openOrdersModal(JSON.parse(currentUser));
      } else {
        openAuthModal();
        showToast('Please login to check order details.');
      }
    }
  });

  function updateAuthUI() {
    const btn = document.querySelector('a[aria-label="Account"]');
    if (!btn) return;
    const currentUser = localStorage.getItem('brushUser');
    if (currentUser) {
      const user = JSON.parse(currentUser);
      btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:24px;height:24px;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg><span class="nav-user-greeting">Hi, ${escapeHtml(String(user.name || user.userId || '').trim().split(/\s+/)[0])}</span>`;
      btn.classList.add('has-greeting');
    } else {
      btn.classList.remove('has-greeting');
      btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:24px;height:24px;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`;
    }
  }

  // Initial call on page load
  updateAuthUI();

  // Arrived here via checkout.html's "log in to continue" link (checkout
  // doesn't load this script, so it can't open the modal itself) - open
  // straight into it instead of leaving the visitor to find the account
  // icon on their own, then drop the param so a refresh doesn't reopen it.
  if (new URLSearchParams(window.location.search).get('login') === '1' && !localStorage.getItem('brushUser')) {
    openAuthModal();
    history.replaceState(null, '', window.location.pathname + window.location.hash);
  }

  // Same idea for the navbar's Account / Orders icons on pages without the
  // modals (global-navbar.js links them here with ?open=account|orders).
  const openParam = new URLSearchParams(window.location.search).get('open');
  if (openParam === 'account' || openParam === 'orders') {
    history.replaceState(null, '', window.location.pathname + window.location.hash);
    const stored = localStorage.getItem('brushUser');
    if (!stored) {
      openAuthModal();
    } else {
      // Deferred: the modal openers are declared further down this file.
      setTimeout(() => {
        const user = JSON.parse(stored);
        openParam === 'orders' ? openOrdersModal(user) : openProfileModal(user);
      }, 0);
    }
  }

  function openAuthModal() {
    if(authModal) authModal.classList.add('open');
    if(authModalOverlay) authModalOverlay.classList.add('open');
  }
  function closeAuthModal() {
    if(authModal) authModal.classList.remove('open');
    if(authModalOverlay) authModalOverlay.classList.remove('open');
  }
  
  const authCloseBtn = document.getElementById('auth-close-btn');
  if (authCloseBtn) authCloseBtn.addEventListener('click', closeAuthModal);
  if (authModalOverlay) authModalOverlay.addEventListener('click', closeAuthModal);

  const authTabs = document.querySelectorAll('.auth-tab');
  const authForms = document.querySelectorAll('.auth-form');
  authTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      authTabs.forEach(t => t.classList.remove('active'));
      authForms.forEach(f => f.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`${tab.dataset.target}-form`).classList.add('active');
    });
  });

  const loginForm = document.getElementById('login-form');
  const signupForm = document.getElementById('signup-form');
  const loginError = document.getElementById('login-error');
  const signupError = document.getElementById('signup-error');

  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('login-id').value;
      const password = document.getElementById('login-password').value;
      
      try {
        const res = await fetch(`${API_BASE}/auth/login`, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({id, password})
        });
        const data = await res.json();
        if(res.ok) {
          localStorage.setItem('brushUser', JSON.stringify(data));
          closeAuthModal();
          updateAuthUI();
          showToast('Logged in successfully!');
        } else {
          loginError.textContent = data.error || 'Login failed';
        }
      } catch (err) {
        loginError.textContent = 'Network error';
      }
    });
  }

  if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('signup-id').value;
      const name = document.getElementById('signup-name').value;
      const phone = document.getElementById('signup-phone').value;
      const address = document.getElementById('signup-address').value;
      const password = document.getElementById('signup-password').value;
      
      try {
        const res = await fetch(`${API_BASE}/auth/signup`, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({id, name, phone, address, password})
        });
        const data = await res.json();
        if(res.ok) {
          localStorage.setItem('brushUser', JSON.stringify(data));
          closeAuthModal();
          showToast('Account created successfully!');
        } else {
          signupError.textContent = data.error || 'Signup failed';
        }
      } catch (err) {
        signupError.textContent = 'Network error';
      }
    });
  }

  // Forgot Password / Reset Logic
  const forgotPasswordLink = document.getElementById('forgot-password-link');
  const backToLoginLink = document.getElementById('back-to-login-link');
  const resetForm = document.getElementById('reset-form');

  if (forgotPasswordLink) {
    forgotPasswordLink.addEventListener('click', () => {
      authTabs.forEach(t => t.classList.remove('active'));
      authForms.forEach(f => f.classList.remove('active'));
      resetForm.classList.add('active');
    });
  }

  if (backToLoginLink) {
    backToLoginLink.addEventListener('click', () => {
      authForms.forEach(f => f.classList.remove('active'));
      document.getElementById('login-form').classList.add('active');
      const loginTab = document.querySelector('.auth-tab[data-target="login"]');
      if (loginTab) loginTab.classList.add('active');
    });
  }

  if (resetForm) {
    resetForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = (document.getElementById('reset-id').value || '').trim();
      const err = document.getElementById('reset-error');
      const btn = resetForm.querySelector('button');

      btn.textContent = 'Sending...';
      btn.disabled = true;

      try {
        const res = await fetch(`${API_BASE}/auth/forgot-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to send reset link');

        err.style.color = 'var(--success)';
        err.textContent = 'If an account exists for that ID, a password reset link has been emailed to it.';
        resetForm.reset();
      } catch (error) {
        err.style.color = 'var(--sale-red)';
        err.textContent = error.message === 'Failed to fetch' ? "Couldn't reach the server. If you're on local, check if the backend is running or disabled by an adblocker." : error.message;
      } finally {
        btn.textContent = 'Send Reset Link';
        btn.disabled = false;
      }
    });
  }

  // Profile Modal
  function closeProfileModal() {
    if(profileModal) profileModal.classList.remove('open');
    if(profileModalOverlay) profileModalOverlay.classList.remove('open');
  }
  
  const profileCloseBtn = document.getElementById('profile-close-btn');
  if(profileCloseBtn) profileCloseBtn.addEventListener('click', closeProfileModal);
  if(profileModalOverlay) profileModalOverlay.addEventListener('click', closeProfileModal);

  // A 401 here means the session token is missing or no longer valid - either
  // a pre-existing login from before session tokens existed, or one that's
  // outlived a server restart (tokens are held in memory, not persisted).
  // Surfacing that as a real "log in again" prompt instead of a bare
  // "failed to load" message.
  function handleSessionExpiry() {
    localStorage.removeItem('brushUser');
    closeProfileModal();
    closeOrdersModal();
    showToast('Your session has expired. Please log in again.');
    openAuthModal();
  }

  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      const user = JSON.parse(localStorage.getItem('brushUser') || 'null');
      if (user && user.token) {
        fetch(`${API_BASE}/auth/logout`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${user.token}` }
        }).catch(() => {}); // best-effort - local logout proceeds regardless
      }
      localStorage.removeItem('brushUser');
      closeProfileModal();
      showToast('Logged out');
    });
  }

  async function openProfileModal(user) {
    if(profileModal) profileModal.classList.add('open');
    if(profileModalOverlay) profileModalOverlay.classList.add('open');
    
    document.getElementById('profile-id').value = user.userId;
    document.getElementById('profile-name').value = user.name || '';
    document.getElementById('profile-phone').value = user.phone || '';
    document.getElementById('profile-address').value = user.address || '';
    document.getElementById('profile-msg').textContent = '';
  }

  // Orders Modal
  const ordersModal = document.getElementById('orders-modal');
  const ordersModalOverlay = document.getElementById('orders-modal-overlay');

  function closeOrdersModal() {
    if(ordersModal) ordersModal.classList.remove('open');
    if(ordersModalOverlay) ordersModalOverlay.classList.remove('open');
  }

  const ordersCloseBtn = document.getElementById('orders-close-btn');
  if(ordersCloseBtn) ordersCloseBtn.addEventListener('click', closeOrdersModal);
  if(ordersModalOverlay) ordersModalOverlay.addEventListener('click', closeOrdersModal);

  // Close on Escape - same convention as the cart drawer, search overlay,
  // and product modal. None of these three had it either.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (authModal && authModal.classList.contains('open')) closeAuthModal();
    if (profileModal && profileModal.classList.contains('open')) closeProfileModal();
    if (ordersModal && ordersModal.classList.contains('open')) closeOrdersModal();
  });

  async function openOrdersModal(user) {
    // exposed so the navbar can open this in place instead of navigating home
    if(ordersModal) ordersModal.classList.add('open');
    if(ordersModalOverlay) ordersModalOverlay.classList.add('open');
    
    // Fetch orders
    const orderList = document.getElementById('orders-history-list');
    if (!orderList) return;
    
    orderList.innerHTML = '<p>Loading orders...</p>';
    try {
      const res = await fetch(`${API_BASE}/orders/user/${user.userId}`, {
        headers: { 'Authorization': `Bearer ${user.token}` }
      });
      if(res.ok) {
        const orders = await res.json();
        if(orders.length === 0) {
          orderList.innerHTML = '<p>No orders found.</p>';
        } else {
          orderList.innerHTML = orders.map(o => {
            const orderIdStr = String(o.orderId || o.id || o._id || '');
            let localReview = null;
            try {
              const cached = localStorage.getItem('brush_order_review_' + orderIdStr);
              if (cached) localReview = JSON.parse(cached);
            } catch (_) {}
            const rev = o.review || localReview;
            const hasReview = rev && (rev.rating != null || (rev.comment && rev.comment.trim()) || (Array.isArray(rev.images) && rev.images.length > 0));

            // Initialize in-memory review state for this order
            if (!window._orderReviewState) window._orderReviewState = {};
            window._orderReviewState[orderIdStr] = {
              rating: rev?.rating != null ? Number(rev.rating) : null,
              comment: rev?.comment || '',
              images: Array.isArray(rev?.images) ? [...rev.images] : []
            };

            const ratingHint = getRatingLabel(window._orderReviewState[orderIdStr].rating);
            const starsActive = window._orderReviewState[orderIdStr].rating || 0;

            const existingStarsHtml = (rev && rev.rating)
              ? Array.from({length: 5}, (_, i) => `<i class="fa-solid fa-star" style="color: ${i < rev.rating ? '#fbbf24' : '#444'}; font-size:0.85rem;"></i>`).join('') + ` <span style="font-size:0.75rem; color:var(--text-secondary); margin-left:4px; font-weight:600;">${rev.rating}/5</span>`
              : (hasReview ? '<span style="font-size:0.75rem; color:var(--text-secondary);">(No star rating)</span>' : '');

            const existingPhotosHtml = (rev && Array.isArray(rev.images) && rev.images.length > 0)
              ? `<div class="order-existing-photos">${rev.images.map(img => `<a href="${escapeHtml(img)}" target="_blank" rel="noopener"><img src="${escapeHtml(img)}" class="order-existing-photo" alt="Order review photo" loading="lazy"></a>`).join('')}</div>`
              : '';

            const revDate = rev?.updatedAt ? new Date(rev.updatedAt).toLocaleDateString() : '';

            return `
            <div class="order-item" id="order-card-${escapeHtml(orderIdStr)}" style="border-bottom: 1px solid var(--border-color); padding-bottom: 14px; margin-bottom: 14px;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                <strong style="font-size:0.95rem;">${escapeHtml(o.orderId)}</strong>
                <span style="color:var(--accent); font-weight: 700; font-size:1rem;">₹${escapeHtml(o.total)}</span>
              </div>
              <div style="font-size:0.8rem;color:var(--text-secondary);line-height:1.4;">
                Date: ${new Date(o.createdAt?._seconds ? o.createdAt._seconds*1000 : (o.createdAt || new Date())).toLocaleDateString()} &middot; Status: <span style="font-weight: 600; color: ${o.status === 'Cancelled' ? 'var(--sale-red)' : 'var(--accent)'}">${escapeHtml(o.status)}</span>
                <br><span style="margin-top:2px;display:inline-block;color:var(--text-primary);">Courier: <strong>${escapeHtml(o.courierPartner || 'DTDC')}</strong>${o.awbNumber ? ` &middot; Transit No: <strong>${escapeHtml(o.awbNumber)}</strong>` : ''}</span>
              </div>
              
              <div style="margin-top:8px; display:flex; flex-direction:column; gap:8px;">
                ${(o.items || []).map(i => {
                  const hasCustom = Array.isArray(i.customPosters) && i.customPosters.length > 0;
                  return `
                    <div style="background:var(--bg-card); border:1px solid var(--border); border-radius:6px; padding:8px 10px;">
                      <div style="display:flex; justify-content:space-between; font-size:0.85rem; font-weight:600;">
                        <span>${Number(i.quantity) || 1}x ${escapeHtml(i.name)}</span>
                        <span>₹${Number(i.subtotal != null ? i.subtotal : (i.price * i.quantity)) || 0}</span>
                      </div>
                      ${hasCustom ? `
                        <div style="margin-top:6px; padding-top:6px; border-top:1px dashed var(--border);">
                          <div style="font-size:0.75rem; font-weight:600; color:var(--text-secondary); margin-bottom:5px;">
                            <i class="fa-solid fa-layer-group"></i> Pack Posters (${i.customPosters.length} Items):
                          </div>
                          <div style="display:flex; flex-wrap:wrap; gap:5px; margin-bottom:6px;">
                            ${i.customPosters.map((cp, idx) => `
                              <div style="position:relative; width:34px; height:46px; border-radius:3px; overflow:hidden; border:1px solid var(--border); flex-shrink:0;" title="${escapeHtml(cp.name || cp.title || `Poster ${idx+1}`)} — Size: ${escapeHtml(cp.size || 'A5')}">
                                <img src="${escapeHtml(cp.image)}" style="width:100%; height:100%; object-fit:cover; display:block;" loading="lazy">
                                <span style="position:absolute; bottom:1px; right:1px; background:rgba(0,0,0,0.82); color:#fff; font-size:0.5rem; font-weight:700; padding:1px 2px; border-radius:2px; line-height:1;">${escapeHtml(cp.size || 'A5')}</span>
                              </div>
                            `).join('')}
                          </div>
                          <details style="font-size:0.75rem; color:var(--text-secondary);">
                            <summary style="cursor:pointer; font-weight:500;">View Poster List & Sizes</summary>
                            <ol style="margin:4px 0 0 16px; padding:0; line-height:1.4;">
                              ${i.customPosters.map((cp, idx) => {
                                const sku = cp.sku || (cp.id ? String(cp.id) : '');
                                return `
                                  <li style="margin-bottom:3px;">${escapeHtml(cp.name || cp.title || 'Poster')} &mdash; <strong>Size: ${escapeHtml(cp.size || 'A5')}</strong>${sku ? ` &middot; <code style="font-family:monospace; font-weight:700; color:var(--accent); font-size:0.75rem;">SKU: ${escapeHtml(sku)}</code>` : ''}</li>
                                `;
                              }).join('')}
                            </ol>
                          </details>
                        </div>
                      ` : ''}
                    </div>
                  `;
                }).join('')}
              </div>

              <div style="margin-top: 10px; display: flex; flex-wrap: wrap; gap: 8px; align-items: center;">
                <a href="track.html?awb=${encodeURIComponent(o.awbNumber || o.orderId)}&orderId=${encodeURIComponent(o.orderId)}${(o.customer && o.customer.email) ? `&verify=${encodeURIComponent(o.customer.email)}` : ''}" target="_blank" style="display:inline-flex; align-items:center; gap:5px; font-size:0.78rem; font-weight:600; color:var(--accent); text-decoration:none; padding:4px 10px; border-radius:4px; border:1px solid var(--accent);">
                  <i class="fa-solid fa-location-crosshairs"></i> Track Shipment
                </a>
                <a href="/api/orders/${encodeURIComponent(o.orderId)}/invoice" target="_blank" style="display:inline-flex; align-items:center; gap:5px; font-size:0.78rem; font-weight:600; color:var(--text-primary); text-decoration:none; padding:4px 10px; border-radius:4px; border:1px solid var(--border); background:var(--bg-card);">
                  <i class="fa-solid fa-file-invoice-dollar"></i> Download Invoice (PDF)
                </a>
                <button type="button" class="order-rate-review-btn ${hasReview ? 'is-reviewed' : ''}" id="order-rate-btn-${escapeHtml(orderIdStr)}" onclick="window.toggleOrderReviewForm('${escapeHtml(orderIdStr)}')">
                  <i class="fa-solid fa-star"></i> <span>${hasReview ? 'Edit Review' : 'Rate & Review'}</span>
                </button>
              </div>

              <!-- Saved Review Summary Card -->
              <div id="order-review-display-${escapeHtml(orderIdStr)}" class="order-existing-review" style="${hasReview ? '' : 'display:none;'}">
                <div class="order-existing-review-header">
                  <span style="font-weight:700; font-size:0.8rem; color:var(--text-primary); display:flex; align-items:center; gap:5px;">
                    <i class="fa-solid fa-circle-check" style="color:var(--accent);"></i> Your Order Review
                  </span>
                  <span class="order-existing-date">${escapeHtml(revDate)}</span>
                </div>
                <div class="order-existing-stars" id="order-display-stars-${escapeHtml(orderIdStr)}">${existingStarsHtml}</div>
                <div class="order-existing-comment" id="order-display-comment-${escapeHtml(orderIdStr)}">${escapeHtml(rev?.comment || '')}</div>
                <div id="order-display-photos-${escapeHtml(orderIdStr)}">${existingPhotosHtml}</div>
              </div>

              <!-- Rate & Review Form (Collapsible) -->
              <div id="order-review-form-${escapeHtml(orderIdStr)}" class="order-review-form-wrap" style="display:none;">
                <div class="order-review-header">
                  <span class="order-review-title"><i class="fa-solid fa-star" style="color:#fbbf24;"></i> Rate & Review Order</span>
                  <span style="font-size:0.72rem; color:var(--text-secondary); background:rgba(255,255,255,0.06); padding:2px 8px; border-radius:12px;">All fields optional</span>
                </div>

                <!-- Star Rating (Optional) -->
                <div>
                  <div style="font-size:0.75rem; font-weight:600; color:var(--text-secondary); margin-bottom:4px;">
                    Star Rating (Optional &mdash; tap to select or unselect)
                  </div>
                  <div class="order-star-select" id="star-select-${escapeHtml(orderIdStr)}">
                    ${[1, 2, 3, 4, 5].map(star => `
                      <button type="button" class="order-star-btn ${star <= starsActive ? 'active' : ''}" data-star="${star}" onclick="window.setOrderReviewRating('${escapeHtml(orderIdStr)}', ${star})" title="${star} Star${star > 1 ? 's' : ''}">
                        <i class="fa-solid fa-star"></i>
                      </button>
                    `).join('')}
                    <span class="order-star-hint" id="star-hint-${escapeHtml(orderIdStr)}">${ratingHint}</span>
                  </div>
                </div>

                <!-- Comment (Optional) -->
                <div>
                  <div style="font-size:0.75rem; font-weight:600; color:var(--text-secondary); margin-bottom:4px;">
                    Review & Comments (Optional)
                  </div>
                  <textarea class="order-review-comment" id="order-review-comment-${escapeHtml(orderIdStr)}" rows="3" placeholder="Share your experience with print quality, frame finish, or delivery...">${escapeHtml(rev?.comment || '')}</textarea>
                </div>

                <!-- Images (Optional) -->
                <div>
                  <div style="font-size:0.75rem; font-weight:600; color:var(--text-secondary); margin-bottom:4px;">
                    Photos (Optional &mdash; up to 5)
                  </div>
                  <div class="order-review-upload-row">
                    <label class="order-review-upload-btn">
                      <i class="fa-solid fa-camera"></i>
                      <span>Add Photos</span>
                      <input type="file" accept="image/*" multiple style="display:none;" onchange="window.handleOrderReviewImages('${escapeHtml(orderIdStr)}', this)">
                    </label>
                    <span style="font-size:0.72rem; color:var(--text-secondary);">Upload snapshots of your framed art or prints on wall</span>
                  </div>
                  <div class="order-review-previews" id="order-review-previews-${escapeHtml(orderIdStr)}"></div>
                </div>

                <!-- Form Submit/Cancel -->
                <div class="order-review-actions">
                  <button type="button" class="order-review-submit-btn" id="order-review-submit-btn-${escapeHtml(orderIdStr)}" onclick="window.submitOrderReview('${escapeHtml(orderIdStr)}')">
                    <i class="fa-solid fa-check"></i> Submit Review
                  </button>
                  <button type="button" class="order-review-cancel-btn" onclick="window.toggleOrderReviewForm('${escapeHtml(orderIdStr)}')">
                    Cancel
                  </button>
                  <span id="order-review-msg-${escapeHtml(orderIdStr)}" style="font-size:0.75rem; margin-left:auto;"></span>
                </div>
              </div>
            </div>
            `;
          }).join('');

          // Initialize previews for existing saved photos
          orders.forEach(o => {
            const orderIdStr = String(o.orderId || '');
            if (window._renderOrderReviewPreviews) {
              window._renderOrderReviewPreviews(orderIdStr);
            }
          });
        }
      } else if (res.status === 401) {
        handleSessionExpiry();
      } else {
        orderList.innerHTML = '<p>Failed to load orders.</p>';
      }
    } catch(err) {
      orderList.innerHTML = '<p>Error loading orders.</p>';
    }
  }

  window.openOrdersModal = openOrdersModal;

  // Order Rate & Review Helpers (star rating, comment, and images are all optional)
  window._orderReviewState = window._orderReviewState || {};

  function getRatingLabel(val) {
    if (val === 5) return '5 Stars &mdash; Excellent';
    if (val === 4) return '4 Stars &mdash; Very Good';
    if (val === 3) return '3 Stars &mdash; Good';
    if (val === 2) return '2 Stars &mdash; Fair';
    if (val === 1) return '1 Star &mdash; Poor';
    return 'Select rating (optional)';
  }

  window.toggleOrderReviewForm = function(orderId) {
    const form = document.getElementById(`order-review-form-${orderId}`);
    if (!form) return;
    const isHidden = form.style.display === 'none' || !form.style.display;
    form.style.display = isHidden ? 'flex' : 'none';
    if (isHidden && window._renderOrderReviewPreviews) {
      window._renderOrderReviewPreviews(orderId);
    }
  };

  window.setOrderReviewRating = function(orderId, star) {
    if (!window._orderReviewState[orderId]) {
      window._orderReviewState[orderId] = { rating: null, comment: '', images: [] };
    }
    const current = window._orderReviewState[orderId].rating;
    // Toggling: clicking the active star clears rating since rating is optional
    const newRating = current === star ? null : star;
    window._orderReviewState[orderId].rating = newRating;

    const container = document.getElementById(`star-select-${orderId}`);
    if (container) {
      const starBtns = container.querySelectorAll('.order-star-btn');
      starBtns.forEach(btn => {
        const s = Number(btn.getAttribute('data-star'));
        if (newRating != null && s <= newRating) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
      const hint = document.getElementById(`star-hint-${orderId}`);
      if (hint) hint.innerHTML = getRatingLabel(newRating);
    }
  };

  window.handleOrderReviewImages = function(orderId, inputEl) {
    if (!inputEl || !inputEl.files || inputEl.files.length === 0) return;
    if (!window._orderReviewState[orderId]) {
      window._orderReviewState[orderId] = { rating: null, comment: '', images: [] };
    }
    const files = Array.from(inputEl.files);

    files.forEach(file => {
      if (window._orderReviewState[orderId].images.length >= 5) {
        if (typeof showToast === 'function') showToast('Maximum 5 images allowed');
        return;
      }
      if (!file.type.startsWith('image/')) return;

      const reader = new FileReader();
      reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
          const maxDim = 800;
          let w = img.width;
          let h = img.height;
          if (w > maxDim || h > maxDim) {
            if (w > h) {
              h = Math.round((h * maxDim) / w);
              w = maxDim;
            } else {
              w = Math.round((w * maxDim) / h);
              h = maxDim;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.75);

          if (window._orderReviewState[orderId].images.length < 5) {
            window._orderReviewState[orderId].images.push(dataUrl);
            window._renderOrderReviewPreviews(orderId);
          }
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
    inputEl.value = '';
  };

  window.removeOrderReviewImage = function(orderId, index) {
    if (!window._orderReviewState[orderId] || !window._orderReviewState[orderId].images) return;
    window._orderReviewState[orderId].images.splice(index, 1);
    window._renderOrderReviewPreviews(orderId);
  };

  window._renderOrderReviewPreviews = function(orderId) {
    const previewContainer = document.getElementById(`order-review-previews-${orderId}`);
    if (!previewContainer) return;
    const imgs = (window._orderReviewState[orderId] && window._orderReviewState[orderId].images) || [];
    if (imgs.length === 0) {
      previewContainer.innerHTML = '';
      return;
    }
    previewContainer.innerHTML = imgs.map((imgSrc, idx) => `
      <div class="order-review-preview-thumb">
        <img src="${imgSrc}" alt="Preview ${idx + 1}">
        <button type="button" class="order-review-remove-img" onclick="window.removeOrderReviewImage('${escapeHtml(orderId)}', ${idx})" title="Remove image">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
    `).join('');
  };

  window.submitOrderReview = async function(orderId) {
    const btn = document.getElementById(`order-review-submit-btn-${orderId}`);
    const msg = document.getElementById(`order-review-msg-${orderId}`);
    const commentEl = document.getElementById(`order-review-comment-${orderId}`);

    const state = window._orderReviewState[orderId] || { rating: null, comment: '', images: [] };
    const rating = state.rating;
    const comment = commentEl ? commentEl.value.trim() : '';
    const images = state.images || [];

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
    }
    if (msg) msg.textContent = '';

    try {
      let token = '';
      try {
        const u = JSON.parse(localStorage.getItem('brushUser'));
        if (u && u.token) token = u.token;
      } catch (_) {}

      const res = await fetch(`${API_BASE}/orders/${encodeURIComponent(orderId)}/review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ rating, comment, images })
      });

      if (!res.ok) {
        let errorMsg = 'Failed to save review';
        try {
          const errData = await res.json();
          if (errData && errData.error) errorMsg = errData.error;
        } catch (_) {}
        throw new Error(errorMsg);
      }
      const data = await res.json();
      const savedReview = data.review || { rating, comment, images, updatedAt: new Date().toISOString() };

      // Cache locally for instant feedback
      try {
        localStorage.setItem('brush_order_review_' + orderId, JSON.stringify(savedReview));
      } catch (_) {}

      // Update review display
      const displayWrap = document.getElementById(`order-review-display-${orderId}`);
      if (displayWrap) {
        const hasContent = savedReview.rating != null || (savedReview.comment && savedReview.comment.trim()) || (savedReview.images && savedReview.images.length > 0);
        if (hasContent) {
          const starsHtml = savedReview.rating
            ? Array.from({length: 5}, (_, i) => `<i class="fa-solid fa-star" style="color: ${i < savedReview.rating ? '#fbbf24' : '#444'}; font-size:0.85rem;"></i>`).join('') + ` <span style="font-size:0.75rem; color:var(--text-secondary); margin-left:4px; font-weight:600;">${savedReview.rating}/5</span>`
            : '<span style="font-size:0.75rem; color:var(--text-secondary);">(No star rating)</span>';

          const commentHtml = savedReview.comment
            ? `<div class="order-existing-comment">${escapeHtml(savedReview.comment)}</div>`
            : '';

          const photosHtml = (savedReview.images && savedReview.images.length > 0)
            ? `<div class="order-existing-photos">${savedReview.images.map(img => `<a href="${escapeHtml(img)}" target="_blank" rel="noopener"><img src="${escapeHtml(img)}" class="order-existing-photo" alt="Order review photo" loading="lazy"></a>`).join('')}</div>`
            : '';

          displayWrap.innerHTML = `
            <div class="order-existing-review-header">
              <span style="font-weight:700; font-size:0.8rem; color:var(--text-primary); display:flex; align-items:center; gap:5px;">
                <i class="fa-solid fa-circle-check" style="color:var(--accent);"></i> Your Order Review
              </span>
              <span class="order-existing-date">${new Date().toLocaleDateString()}</span>
            </div>
            <div class="order-existing-stars">${starsHtml}</div>
            ${commentHtml}
            ${photosHtml}
          `;
          displayWrap.style.display = 'block';
        } else {
          displayWrap.style.display = 'none';
        }
      }

      // Update trigger button
      const rateBtn = document.getElementById(`order-rate-btn-${orderId}`);
      if (rateBtn) {
        rateBtn.classList.add('is-reviewed');
        rateBtn.innerHTML = '<i class="fa-solid fa-star"></i> <span>Edit Review</span>';
      }

      // Update live landing rating display
      if (data && data.ratingStats && data.ratingStats.average) {
        updateLandingRatingDisplay(data.ratingStats.average);
      } else if (typeof initLandingRatingStats === 'function') {
        initLandingRatingStats();
      }

      // Hide review form
      const form = document.getElementById(`order-review-form-${orderId}`);
      if (form) form.style.display = 'none';

      if (typeof showToast === 'function') {
        showToast('Review saved successfully! Thank you.');
      }
    } catch (err) {
      console.error('Error submitting order review:', err);
      // Optimistically preserve in localStorage so user written review is never lost
      try {
        const fallbackReview = { rating, comment, images, updatedAt: new Date().toISOString() };
        localStorage.setItem('brush_order_review_' + orderId, JSON.stringify(fallbackReview));
      } catch (_) {}
      if (msg) {
        msg.textContent = err.message || 'Error saving review. Please try again.';
        msg.style.color = 'var(--sale-red)';
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-check"></i> Submit Review';
      }
    }
  };

  const profileForm = document.getElementById('profile-form');
  if (profileForm) {
    profileForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const user = JSON.parse(localStorage.getItem('brushUser'));
      if(!user) return;
      
      const name = document.getElementById('profile-name').value;
      const phone = document.getElementById('profile-phone').value;
      const address = document.getElementById('profile-address').value;
      
      try {
        const res = await fetch(`${API_BASE}/auth/profile/${user.userId}`, {
          method: 'PUT',
          headers: {'Content-Type': 'application/json', 'Authorization': `Bearer ${user.token}`},
          body: JSON.stringify({name, phone, address})
        });
        if(res.ok) {
          user.name = name;
          user.phone = phone;
          user.address = address;
          localStorage.setItem('brushUser', JSON.stringify(user));
          document.getElementById('profile-msg').textContent = 'Profile updated!';
          document.getElementById('profile-msg').style.color = 'var(--success)';
        } else if (res.status === 401) {
          handleSessionExpiry();
        } else {
          document.getElementById('profile-msg').textContent = 'Update failed';
          document.getElementById('profile-msg').style.color = 'var(--sale-red)';
        }
      } catch (err) {
        document.getElementById('profile-msg').textContent = 'Network error';
        document.getElementById('profile-msg').style.color = 'var(--sale-red)';
      }
    });
  }

  const changePasswordForm = document.getElementById('change-password-form');
  if (changePasswordForm) {
    changePasswordForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const currentUser = JSON.parse(localStorage.getItem('brushUser'));
      if (!currentUser) return;
      
      const currentPassword = document.getElementById('current-profile-password').value;
      const newPassword = document.getElementById('new-profile-password').value;
      const msg = document.getElementById('change-password-msg');
      const btn = changePasswordForm.querySelector('button');

      btn.textContent = 'Updating...';
      btn.disabled = true;

      try {
        const res = await fetch(`${API_BASE}/auth/change-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentUser.token}` },
          body: JSON.stringify({ currentPassword, newPassword })
        });
        if (res.status === 401) {
          handleSessionExpiry();
          return;
        }
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to update password');

        msg.style.color = 'var(--success)';
        msg.textContent = 'Password updated successfully!';
        changePasswordForm.reset();
        setTimeout(() => { msg.textContent = ''; }, 3000);
      } catch (error) {
        msg.style.color = 'var(--sale-red)';
        msg.textContent = error.message;
      } finally {
        btn.textContent = 'Update Password';
        btn.disabled = false;
      }
    });
  }

  // FAQ Accordion
  const faqQuestions = document.querySelectorAll('.faq-question');
  faqQuestions.forEach(btn => {
    btn.addEventListener('click', () => {
      const faqItem = btn.parentElement;
      const isActive = faqItem.classList.contains('active');
      
      // Close all other FAQs
      document.querySelectorAll('.faq-item').forEach(item => {
        item.classList.remove('active');
      });
      
      // Toggle current FAQ
      if (!isActive) {
        faqItem.classList.add('active');
      }
    });
  });

}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initBrushMain);
} else {
  initBrushMain();
}

// --- Comprehensive IP & Content Protection ---
(function() {
  function getShield() {
    let s = document.getElementById('screen-capture-shield');
    if (!s) {
      s = document.createElement('div');
      s.id = 'screen-capture-shield';
      s.setAttribute('aria-hidden', 'true');
      s.innerHTML = '<div class="shield-title">Content Protected</div><div class="shield-subtitle">Screenshots and recordings of proprietary artwork and designs are prohibited.</div>';
      document.body.appendChild(s);
    }
    return s;
  }

  let shieldTimer = null;
  function triggerShield(durationMs = 2000) {
    const shield = getShield();
    if (!shield) return;
    shield.classList.add('shield-active');
    if (shieldTimer) clearTimeout(shieldTimer);
    shieldTimer = setTimeout(() => {
      shield.classList.remove('shield-active');
    }, durationMs);
  }

  // Prevent Right Click
  document.addEventListener('contextmenu', function(e) {
    e.preventDefault();
  }, { capture: true });

  // Prevent Image Dragging
  document.addEventListener('dragstart', function(e) {
    if (e.target && e.target.tagName && e.target.tagName.toLowerCase() === 'img') {
      e.preventDefault();
    }
  }, { capture: true });

  // Clear clipboard to disrupt PrintScreen / copied imagery
  function clearClipboard() {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText('');
      }
    } catch (_) {}
  }

  // Intercept screenshot and recording shortcut keys
  document.addEventListener('keydown', function(e) {
    const key = (e.key || '').toLowerCase();
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;

    // Prevent Save (Ctrl+S / Cmd+S)
    if ((e.ctrlKey || e.metaKey) && key === 's') {
      e.preventDefault();
      return;
    }

    // Prevent Print (Ctrl+P / Cmd+P)
    if ((e.ctrlKey || e.metaKey) && key === 'p') {
      e.preventDefault();
      triggerShield(1800);
      return;
    }

    // Prevent Developer Tools inspection (F12, Ctrl+Shift+I / Cmd+Opt+I, Ctrl+Shift+C / Cmd+Opt+C, Ctrl+Shift+J / Cmd+Opt+J, Ctrl+U)
    if (
      e.key === 'F12' ||
      ((e.ctrlKey || e.metaKey) && e.shiftKey && (key === 'i' || key === 'c' || key === 'j')) ||
      ((e.altKey && e.metaKey) && (key === 'i' || key === 'c' || key === 'j')) ||
      ((e.ctrlKey || e.metaKey) && key === 'u')
    ) {
      e.preventDefault();
      triggerShield(1200);
      return;
    }

    // Windows / Linux PrintScreen key
    if (e.key === 'PrintScreen' || key === 'printscreen') {
      clearClipboard();
      triggerShield(2500);
      e.preventDefault();
      return;
    }

    // Windows Snipping Tool (Win + Shift + S) or Game Bar Recording (Win + Alt + R / Win + G)
    if (e.shiftKey && (key === 's' || key === 'r') && (e.metaKey || e.ctrlKey)) {
      clearClipboard();
      triggerShield(2500);
    }

    // macOS Screenshot & Recording shortcuts:
    // Cmd + Shift + 3 (Full screen capture)
    // Cmd + Shift + 4 (Crosshair selection screenshot)
    // Cmd + Shift + 5 (Screen recording / screenshot HUD)
    // Cmd + Shift + 6 (Touch bar screenshot)
    if (e.metaKey && e.shiftKey && (key === '3' || key === '4' || key === '5' || key === '6')) {
      clearClipboard();
      triggerShield(3000);
      e.preventDefault();
    }
  }, { capture: true });

  document.addEventListener('keyup', function(e) {
    if (e.key === 'PrintScreen' || (e.key || '').toLowerCase() === 'printscreen') {
      clearClipboard();
      triggerShield(2500);
    }
  }, { capture: true });

  // Blur/Focus trigger: many external screen-capture tools and snipping utilities
  // steal OS window focus to draw selection boxes or display recording overlays.
  // We flash the protective shield briefly on window blur when modal or zoomed.
  window.addEventListener('blur', function() {
    // If a design modal or gallery is open, protect artwork from background grab
    const modal = document.getElementById('product-modal');
    if (modal && modal.classList.contains('active')) {
      triggerShield(1500);
    }
  });

  // Block screen-recording / display-capture APIs if invoked from webpage
  if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
    const origGetDisplayMedia = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getDisplayMedia = function() {
      triggerShield(4000);
      return Promise.reject(new DOMException('Screen capture is restricted on this site.', 'NotAllowedError'));
    };
  }

  // Before print event protection
  window.addEventListener('beforeprint', function() {
    triggerShield(4000);
  });
})();

// =========================================
// Reach Out Modals Logic
// =========================================
function initReachoutModals() {
  const reachoutOverlay = document.getElementById('reachout-modal-overlay');
  const reachoutModals = document.querySelectorAll('.reachout-modal');

  window.closeReachoutModals = function() {
    if (reachoutOverlay) reachoutOverlay.classList.remove('active');
    reachoutModals.forEach(m => m.classList.remove('active'));
  };

  if (reachoutOverlay) {
    // Open buttons
    document.querySelectorAll('.reachout-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-modal');
        const targetModal = document.getElementById(targetId);
        if (targetModal) {
          reachoutOverlay.classList.add('active');
          targetModal.classList.add('active');
        }
      });
    });

    // Close buttons inside modals
    document.querySelectorAll('.reachout-close-btn').forEach(btn => {
      btn.addEventListener('click', closeReachoutModals);
    });

    // Close on overlay click
    reachoutOverlay.addEventListener('click', closeReachoutModals);
  }

  window.handleReachoutSubmit = async function(event, type) {
    event.preventDefault();
    const form = event.target;
    const btn = form.querySelector('button[type="submit"]');
    const origText = btn ? btn.innerHTML : 'Submit';
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Submitting...';
    }

    try {
      const payload = { type };
      if (type === 'artist') {
        payload.name = (document.getElementById('artist-name') || {}).value;
        payload.email = (document.getElementById('artist-email') || {}).value;
        payload.portfolio = (document.getElementById('artist-portfolio') || {}).value;
        payload.style = (document.getElementById('artist-style') || {}).value;
      } else if (type === 'poster_request') {
        payload.name = (document.getElementById('request-name') || {}).value;
        payload.email = (document.getElementById('request-email') || {}).value;
        payload.theme = (document.getElementById('request-theme') || {}).value;
        payload.details = (document.getElementById('request-details') || {}).value;
      } else if (type === 'curator') {
        payload.name = (document.getElementById('curator-name') || {}).value;
        payload.email = (document.getElementById('curator-email') || {}).value;
        payload.platform = (document.getElementById('curator-platform') || {}).value;
        payload.collab = (document.getElementById('curator-collab') || {}).value;
      }

      const res = await fetch(`${API_BASE}/reachout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit');

      showToast(data.message || 'Application submitted successfully! Confirmation sent to your email.');
      form.reset();
      window.closeReachoutModals();
    } catch (err) {
      showToast(err.message || 'Submission error. Please try again.');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = origText;
      }
    }
  };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initReachoutModals);
} else {
  initReachoutModals();
}

// ==========================================================================
// INTERACTIVE STICKER BOMB WALL (DRAG & ARRANGE PLAYGROUND)
// ==========================================================================
function initStickerWall() {
  const wall = document.getElementById('stickerBombWall');
  if (!wall) return;

  let activeSticker = null;
  let startX = 0, startY = 0;
  let initialLeft = 0, initialTop = 0;
  let maxZIndex = 50;

  wall.addEventListener('pointerdown', (e) => {
    const sticker = e.target.closest('.wall-sticker-item');
    if (!sticker) return;

    e.preventDefault();
    activeSticker = sticker;
    try {
      activeSticker.setPointerCapture(e.pointerId);
    } catch (err) {}
    activeSticker.classList.add('is-dragging');

    startX = e.clientX;
    startY = e.clientY;
    initialLeft = activeSticker.offsetLeft;
    initialTop = activeSticker.offsetTop;

    activeSticker.style.zIndex = ++maxZIndex;
  });

  wall.addEventListener('pointermove', (e) => {
    if (!activeSticker) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    const wallRect = wall.getBoundingClientRect();
    const stickerWidth = activeSticker.offsetWidth || 100;
    const stickerHeight = activeSticker.offsetHeight || 100;

    let nextLeft = initialLeft + dx;
    let nextTop = initialTop + dy;

    // Boundary constraints with gentle overdrag tolerance
    nextLeft = Math.max(-10, Math.min(wallRect.width - stickerWidth + 10, nextLeft));
    nextTop = Math.max(-10, Math.min(wallRect.height - stickerHeight + 10, nextTop));

    activeSticker.style.left = nextLeft + 'px';
    activeSticker.style.top = nextTop + 'px';
  });

  const stopDrag = () => {
    if (activeSticker) {
      activeSticker.classList.remove('is-dragging');
      activeSticker = null;
    }
  };

  wall.addEventListener('pointerup', stopDrag);
  wall.addEventListener('pointercancel', stopDrag);

  // Shuffle button
  const shuffleBtn = document.getElementById('stickerWallShuffle');
  if (shuffleBtn) {
    shuffleBtn.addEventListener('click', () => {
      const stickers = wall.querySelectorAll('.wall-sticker-item');
      const wallRect = wall.getBoundingClientRect();
      const w = wallRect.width;
      const h = wallRect.height;
      if (!w || !h) return;

      const cols = 5;
      const rows = 4;
      const cellW = (w - 140) / cols;
      const cellH = (h - 140) / rows;

      stickers.forEach((stk, idx) => {
        stk.style.transition = 'left 0.45s cubic-bezier(0.34, 1.56, 0.64, 1), top 0.45s cubic-bezier(0.34, 1.56, 0.64, 1), transform 0.45s ease';

        const col = idx % cols;
        const row = Math.floor(idx / cols);
        const jitterX = (Math.random() - 0.5) * (cellW * 0.45);
        const jitterY = (Math.random() - 0.5) * (cellH * 0.45);
        const rot = (Math.random() - 0.5) * 36;

        stk.style.left = Math.max(12, Math.min(w - 110, 20 + col * cellW + cellW * 0.2 + jitterX)) + 'px';
        stk.style.top = Math.max(12, Math.min(h - 110, 20 + row * cellH + cellH * 0.2 + jitterY)) + 'px';
        stk.style.transform = `rotate(${rot.toFixed(1)}deg)`;

        setTimeout(() => {
          stk.style.transition = '';
        }, 500);
      });
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initStickerWall);
} else {
  initStickerWall();
}
