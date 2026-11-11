// ========================================
// BRUSH — Browse Posters (poster-reels.html)
//
// A full-screen, one-poster-at-a-time feed, like short-video reels:
// swipe / scroll / arrow-key to the next poster, double-tap (or the bag
// button) to add it to the cart in the chosen size, heart to save it.
// Posters only. The feed is endless: the catalogue is ordered from newest
// to oldest and appended in batches, looping once it has all been shown.
// ========================================
(function () {
  const BATCH = 6;
  const LIKED_KEY = 'brush_liked_posters';
  const HINT_KEY = 'brush_reels_hint_seen';
  const SIZES = ['A5', 'A4', 'A3'];

  const feed = document.getElementById('reels-feed');
  const genreSelect = document.getElementById('reels-genre');
  const hint = document.getElementById('reels-hint');

  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
  const isPoster = (p) => { const t = String(p.productType || '').toLowerCase(); return !t || t.startsWith('poster'); };
  const stockOf = (p) => (p.stockQuantity !== undefined ? p.stockQuantity : 50);

  let posters = [];
  let pool = [];        // current genre, in feed order
  let queue = [];       // what's left to append before the next loop
  let rendered = 0;
  let activeSlide = null;
  const sizeFor = {};   // chosen size per poster id

  let liked = new Set();
  try { liked = new Set(JSON.parse(localStorage.getItem(LIKED_KEY)) || []); } catch (e) {}
  const saveLiked = () => { try { localStorage.setItem(LIKED_KEY, JSON.stringify([...liked])); } catch (e) {} };

  function sizeOptions() {
    const cfg = (typeof Cart !== 'undefined' && Cart.PRODUCT_TYPES && Cart.PRODUCT_TYPES.poster) || null;
    const opts = cfg ? cfg.variantGroups[0].options.filter(o => SIZES.includes(o.value)) : SIZES.map(v => ({ value: v, label: v }));
    return SIZES.map(v => opts.find(o => o.value === v)).filter(Boolean);
  }

  const priceOf = (p, size) => (typeof Cart !== 'undefined' ? Cart.priceFor(p, { size }).price : p.price);

  function slideHtml(p, n) {
    const size = sizeFor[p.id] || 'A4';
    const price = priceOf(p, size);
    const off = p.originalPrice > price ? Math.round((1 - price / p.originalPrice) * 100) : 0;
    const out = stockOf(p) <= 0;
    const thumb = BrushImg.src(p, 480);
    const full = BrushImg.src(p, 1080);
    return `
      <section class="reel" data-id="${esc(p.id)}" data-n="${n}" aria-roledescription="poster" aria-label="${esc(p.name)}">
        <div class="reel-bg" data-bg="${esc(thumb)}" aria-hidden="true"></div>
        <div class="reel-stage">
          <figure class="reel-poster">
            <img data-src="${esc(full)}" data-orig="${esc(BrushImg.original(p))}" data-fallback="img/placeholders/fallback.webp" onerror="BrushImg.onError(this)" alt="${esc(p.name)} poster" width="1080" height="1350" decoding="async" draggable="false">
          </figure>
          <div class="reel-burst" aria-hidden="true"><i class="fa-solid fa-bag-shopping"></i></div>
        </div>
        <div class="reel-overlay">
          <div class="reel-info">
            ${p.category ? `<span class="reel-genre">${esc(p.category)}</span>` : ''}
            <h2 class="reel-title">${esc(p.name)}</h2>
            <div class="reel-price">
              <strong class="reel-price-now">${inr(price)}</strong>
              ${off ? `<s>${inr(p.originalPrice)}</s><span class="reel-off">${off}% off</span>` : ''}
            </div>
            <div class="reel-sizes" role="radiogroup" aria-label="Size">
              ${sizeOptions().map(o => `<button type="button" class="reel-size${o.value === size ? ' active' : ''}" data-size="${o.value}" role="radio" aria-checked="${o.value === size}">${o.label}</button>`).join('')}
            </div>
            <button type="button" class="hero-cta reel-add" ${out ? 'disabled' : ''}>${out ? 'Out of stock' : '<i class="fa-solid fa-bag-shopping" aria-hidden="true"></i> Add to cart'}</button>
          </div>
          <div class="reel-rail">
            <button type="button" class="reel-action reel-like${liked.has(String(p.id)) ? ' active' : ''}" aria-pressed="${liked.has(String(p.id))}" aria-label="Save poster"><i class="fa-${liked.has(String(p.id)) ? 'solid' : 'regular'} fa-heart" aria-hidden="true"></i><span>Save</span></button>
            <button type="button" class="reel-action reel-cart" ${out ? 'disabled' : ''} aria-label="Add to cart"><i class="fa-solid fa-cart-plus" aria-hidden="true"></i><span>Add</span></button>
            <button type="button" class="reel-action reel-details" aria-label="View details"><i class="fa-solid fa-circle-info" aria-hidden="true"></i><span>Details</span></button>
            <button type="button" class="reel-action reel-share" aria-label="Share poster"><i class="fa-solid fa-share-nodes" aria-hidden="true"></i><span>Share</span></button>
          </div>
        </div>
      </section>`;
  }

  // ---- feed building ----
  function appendBatch() {
    if (!pool.length) return;
    let html = '';
    for (let i = 0; i < BATCH; i++) {
      if (!queue.length) {
        // Loop the catalogue, but never start the new round with the
        // poster that ended the last one.
        const last = pool.length > 1 && rendered ? feed.lastElementChild?.dataset.id : null;
        queue = pool.slice();
        if (last && String(queue[0].id) === last) queue.push(queue.shift());
      }
      html += slideHtml(queue.shift(), rendered++);
    }
    feed.insertAdjacentHTML('beforeend', html);
    feed.querySelectorAll('.reel:not([data-observed])').forEach(s => { s.dataset.observed = '1'; io.observe(s); });
  }

  function buildFeed(firstId) {
    const g = genreSelect.value;
    // Filter and sort: latest added first (higher id), with real
    // artwork and in-stock posters still leading dummy / out-of-stock ones.
    pool = posters
      .filter(p => !g || (p.category || '') === g)
      .sort((a, b) =>
        (BrushImg.isDummy(a) ? 1 : 0) - (BrushImg.isDummy(b) ? 1 : 0)
        || (stockOf(a) <= 0 ? 1 : 0) - (stockOf(b) <= 0 ? 1 : 0)
        || (Number(b.id) || 0) - (Number(a.id) || 0)
      );
    queue = pool.slice();
    if (firstId) {
      const i = queue.findIndex(p => String(p.id) === String(firstId));
      if (i > 0) queue.unshift(queue.splice(i, 1)[0]);
    }
    rendered = 0;
    feed.innerHTML = '';
    feed.scrollTop = 0;
    if (!pool.length) {
      feed.innerHTML = `<div class="reels-empty"><p>No posters in this genre yet.</p><button type="button" class="btn-ghost" data-reset-genre>Show all genres</button></div>`;
      return;
    }
    appendBatch();
    appendBatch();
  }

  // ---- lazy media + active slide ----
  function loadMedia(slide) {
    if (!slide || slide.dataset.loaded) return;
    slide.dataset.loaded = '1';
    const img = slide.querySelector('.reel-poster img');
    img.src = img.dataset.src;
    const bg = slide.querySelector('.reel-bg');
    bg.style.backgroundImage = `url("${bg.dataset.bg}")`;
  }

  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting || entry.intersectionRatio < 0.6) return;
      const slide = entry.target;
      activeSlide = slide;
      feed.querySelectorAll('.reel.is-active').forEach(s => s.classList.remove('is-active'));
      slide.classList.add('is-active');
      // Current poster plus the next two, so a swipe never lands on a blank.
      loadMedia(slide);
      loadMedia(slide.nextElementSibling);
      loadMedia(slide.nextElementSibling?.nextElementSibling);
      if (Number(slide.dataset.n) >= rendered - 3) appendBatch();
      history.replaceState(history.state, '', `${location.pathname}?${new URLSearchParams({ ...(genreSelect.value ? { genre: genreSelect.value } : {}), p: slide.dataset.id })}`);
    });
  }, { root: feed, threshold: [0.6] });

  // ---- actions ----
  const productFor = (slide) => posters.find(p => String(p.id) === slide.dataset.id);

  function addToCart(slide, viaDoubleTap) {
    const p = productFor(slide);
    if (!p || stockOf(p) <= 0 || typeof Cart === 'undefined') return;
    const size = sizeFor[p.id] || 'A4';
    Cart.addItem({ ...p, productType: p.productType || 'poster' }, 1, { size });
    const burst = slide.querySelector('.reel-burst');
    burst.classList.remove('play');
    void burst.offsetWidth;
    burst.classList.add('play');
    const btn = slide.querySelector('.reel-add');
    btn.classList.add('added');
    btn.innerHTML = '<i class="fa-solid fa-check" aria-hidden="true"></i> Added';
    setTimeout(() => {
      btn.classList.remove('added');
      btn.innerHTML = '<i class="fa-solid fa-bag-shopping" aria-hidden="true"></i> Add to cart';
    }, 1400);
    const badge = document.querySelector('.reels-cart .cart-count');
    if (badge) { badge.classList.remove('cart-pop'); void badge.offsetWidth; badge.classList.add('cart-pop'); }
    if (window.showToast) showToast(`${p.name} (${size}) added to cart${viaDoubleTap ? ' — keep swiping!' : ''}`);
    if (navigator.vibrate) navigator.vibrate(12);
  }

  function toggleLike(slide) {
    const id = slide.dataset.id;
    const on = !liked.has(id);
    on ? liked.add(id) : liked.delete(id);
    saveLiked();
    feed.querySelectorAll(`.reel[data-id="${CSS.escape(id)}"] .reel-like`).forEach(b => {
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on);
      b.querySelector('i').className = `fa-${on ? 'solid' : 'regular'} fa-heart`;
    });
  }

  function slugify(text) {
    return String(text || '')
      .toLowerCase()
      .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'product';
  }

  async function share(slide) {
    const p = productFor(slide);
    const url = p && p.id && p.name
      ? `${location.origin}/p/${p.id}-${slugify(p.name)}/`
      : `${location.origin}${location.pathname}?p=${encodeURIComponent(slide.dataset.id)}`;
    try {
      if (navigator.share) await navigator.share({ title: `${p.name} — Brush`, text: `Check out this poster on Brush`, url });
      else { await navigator.clipboard.writeText(url); if (window.showToast) showToast('Link copied'); }
    } catch (e) { /* user cancelled */ }
  }

  function selectSize(slide, size) {
    const p = productFor(slide);
    sizeFor[p.id] = size;
    slide.querySelectorAll('.reel-size').forEach(b => {
      const on = b.dataset.size === size;
      b.classList.toggle('active', on);
      b.setAttribute('aria-checked', on);
    });
    const price = priceOf(p, size);
    slide.querySelector('.reel-price-now').textContent = inr(price);
  }

  feed.addEventListener('click', (e) => {
    const slide = e.target.closest('.reel');
    if (e.target.closest('[data-reset-genre]')) { genreSelect.value = ''; buildFeed(); return; }
    if (!slide) return;
    const size = e.target.closest('.reel-size');
    if (size) return selectSize(slide, size.dataset.size);
    if (e.target.closest('.reel-add, .reel-cart')) return addToCart(slide, false);
    if (e.target.closest('.reel-like')) return toggleLike(slide);
    if (e.target.closest('.reel-share')) return share(slide);
    if (e.target.closest('.reel-details') && window.BrushOpenProduct) return window.BrushOpenProduct(slide.dataset.id);
  });

  // Double-tap on the poster adds it to the cart (and saves it), with a
  // burst on the poster — the reels "double-tap to like", but for a store.
  let lastTap = { t: 0, x: 0, y: 0 };
  feed.addEventListener('pointerup', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const stage = e.target.closest('.reel-stage');
    if (!stage) return;
    const now = performance.now();
    const near = Math.abs(e.clientX - lastTap.x) < 40 && Math.abs(e.clientY - lastTap.y) < 40;
    if (now - lastTap.t < 320 && near) {
      const slide = stage.closest('.reel');
      addToCart(slide, true);
      if (!liked.has(slide.dataset.id)) toggleLike(slide);
      lastTap = { t: 0, x: 0, y: 0 };
    } else {
      lastTap = { t: now, x: e.clientX, y: e.clientY };
    }
  });
  feed.addEventListener('dblclick', (e) => { if (e.target.closest('.reel-stage')) e.preventDefault(); });

  function go(dir) {
    const target = dir > 0 ? activeSlide?.nextElementSibling : activeSlide?.previousElementSibling;
    if (target) target.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }

  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea, select') || document.querySelector('.product-modal.open, .cart-drawer.open, .auth-modal.open')) return;
    if (['ArrowDown', 'PageDown', 'j'].includes(e.key)) { e.preventDefault(); go(1); }
    else if (['ArrowUp', 'PageUp', 'k'].includes(e.key)) { e.preventDefault(); go(-1); }
    else if ((e.key === 'a' || e.key === 'Enter') && activeSlide && !e.target.closest('button, a')) { e.preventDefault(); addToCart(activeSlide, false); }
    else if (e.key === 'l' && activeSlide) toggleLike(activeSlide);
  });
  document.getElementById('reels-prev').addEventListener('click', () => go(-1));
  document.getElementById('reels-next').addEventListener('click', () => go(1));

  genreSelect.addEventListener('change', () => buildFeed());

  function showHint() {
    let seen = false;
    try { seen = localStorage.getItem(HINT_KEY) === '1'; } catch (e) {}
    if (seen) return;
    hint.hidden = false;
    const dismiss = () => {
      hint.classList.add('hide');
      setTimeout(() => { hint.hidden = true; }, 400);
      try { localStorage.setItem(HINT_KEY, '1'); } catch (e) {}
    };
    setTimeout(dismiss, 3500);
    feed.addEventListener('scroll', dismiss, { once: true, passive: true });
    hint.addEventListener('click', dismiss, { once: true });
  }

  async function init() {
    try {
      const all = await (window.BrushGetProducts ? window.BrushGetProducts() : fetch(API_BASE + '/products').then(r => r.json()));
      posters = all.filter(isPoster);
    } catch (e) {
      feed.innerHTML = `<div class="reels-empty"><p>Couldn't load posters — our catalogue server may be waking up.</p><button type="button" class="btn-ghost" onclick="location.reload()">Retry</button></div>`;
      return;
    }
    const genres = {};
    posters.forEach(p => { if (p.category) genres[p.category] = (genres[p.category] || 0) + 1; });
    genreSelect.insertAdjacentHTML('beforeend', Object.entries(genres).sort((a, b) => b[1] - a[1])
      .map(([g, n]) => `<option value="${esc(g)}">${esc(g)} (${n})</option>`).join(''));
    const params = new URLSearchParams(location.search);
    const g = params.get('genre');
    if (g && genres[g]) genreSelect.value = g;
    buildFeed(params.get('p'));
    feed.focus({ preventScroll: true });
    showHint();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
