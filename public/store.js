// ========================================
// BRUSH — Store (all_products.html)
//
// Marketplace-style catalogue: product-type tabs across the top, faceted
// filters (genre, price, rating, discount, availability) in a sidebar that
// becomes a bottom sheet on phones, a sort bar, removable filter chips and
// a product grid. All state lives in the URL (?type=&category=&sort=&q=
// &page=) so any view can be shared, bookmarked or reached from the
// navbar's deep links.
//
// Cards keep the .product-card / .quick-add-btn / data-* contract that
// script.js reads, so the product modal and quick-add work unchanged.
// ========================================
(function () {
  const PAGE_SIZE = 24;

  // Tabs. `match` maps whatever productType string a product carries
  // ('poster', 'Posters', undefined, 'wallpaper', ...) onto a tab.
  const TYPES = [
    { key: 'all', label: 'All Lighting', icon: 'fa-border-all' },
    { key: 'chandeliers', label: 'Chandeliers', icon: 'fa-gem' },
    { key: 'wall-lamps', label: 'Wall Lamps', icon: 'fa-lightbulb' },
    { key: 'pendants', label: 'Pendant Lights', icon: 'fa-shapes' },
    { key: 'ceiling-fans', label: 'Ceiling Fans', icon: 'fa-fan' },
    { key: 'track-lights', label: 'Spot & Track', icon: 'fa-crosshairs' },
    { key: 'cob-downlights', label: 'COB & Downlights', icon: 'fa-circle-dot' },
    { key: 'profile-lights', label: 'Profile & Linear', icon: 'fa-ruler-horizontal' },
    { key: 'strip-rope', label: 'Strip & Rope', icon: 'fa-braid' },
    { key: 'outdoor-lights', label: 'Outdoor Lights', icon: 'fa-tree' },
    { key: 'table-floor', label: 'Table & Floor', icon: 'fa-couch' },
    { key: 'smart-utility', label: 'Smart & Utility', icon: 'fa-shield-halved' },
  ];

  const SORTS = [
    { key: 'popular', label: 'Popularity' },
    { key: 'relevance', label: 'Relevance' },
    { key: 'price-asc', label: 'Price — Low to High' },
    { key: 'price-desc', label: 'Price — High to Low' },
    { key: 'newest', label: 'Newest First' },
  ];

  const PRICE_BUCKETS = [
    { key: 'u1000', label: 'Under ₹1,000', min: 0, max: 999 },
    { key: '1000-3000', label: '₹1,000 – ₹3,000', min: 1000, max: 3000 },
    { key: '3000-8000', label: '₹3,000 – ₹8,000', min: 3001, max: 8000 },
    { key: '8000-15000', label: '₹8,000 – ₹15,000', min: 8001, max: 15000 },
    { key: 'o15000', label: 'Over ₹15,000', min: 15001, max: Infinity },
  ];

  const RATINGS = [{ key: '4', label: '4★ & above', min: 4 }, { key: '3', label: '3★ & above', min: 3 }];
  const DISCOUNTS = [{ key: '50', label: '50% or more', min: 50 }, { key: '30', label: '30% or more', min: 30 }];

  const FAQ_COMMON_RETURNS = (thing) => ({ icon: 'fa-box-open', q: `What if my ${thing} arrives damaged or wrong?`, a: `Every piece is made to order, so we don't offer change-of-mind returns — but if your order arrives damaged or incorrect, we'll replace it once you share an unboxing video. See our <a href="/policies/#cancellation-returns">full returns policy</a>.` });

  const COPY = {
    all: {
      title: 'All Lighting Fixtures',
      intro: 'Curated architectural luminaires, luxury crystal chandeliers, hanging pendants, decorative wall sconces, modern ceiling fans, magnetic tracks, and LED profiles from 8M Lights catalogue with tested LEDs and live factory pricing.',
      faq: [
        { icon: 'fa-certificate', q: 'Are all fixtures tested and warrantied?', a: 'Yes. Every luminaire undergoes a 100% illumination, driver, and finish inspection at our Patna showroom prior to dispatch, backed by a 1 to 3-year warranty.' },
        { icon: 'fa-truck-fast', q: 'How long does delivery take?', a: 'In-stock fixtures are dispatched within 24 hours. Delivery takes 2–4 working days in Patna and Bihar, and 4–7 working days across the rest of India.' },
        FAQ_COMMON_RETURNS('lighting fixture'),
      ],
    },
    chandeliers: {
      title: 'Luxury Chandeliers',
      intro: 'Grand crystal chandeliers, modern celestial rings, and architectural jhumars engineered for double-height ceilings, living rooms, and banquet halls.',
      faq: [
        { icon: 'fa-gem', q: 'What crystal quality is used?', a: 'Our chandeliers feature genuine K9 high-refraction optical crystals with precision-cut facets for brilliant dispersion.' },
        { icon: 'fa-lightbulb', q: 'Are bulbs included?', a: 'Most modern models feature integrated high-CRI 3-colour changing LEDs (3000K, 4000K, 6500K). Models with E14/E27 holders clearly state if bulbs are separate.' },
        FAQ_COMMON_RETURNS('chandelier'),
      ],
    },
    'wall-lamps': {
      title: 'Decorative Wall Lamps & Sconces',
      intro: 'Aesthetic up-down accent lights, modern picture lights, and ambient bedside sconces.',
      faq: [
        { icon: 'fa-paint-roller', q: 'How do picture and mirror lights mount?', a: 'They include pre-drilled brackets and concealed hardware for flush wall mounting directly over artwork or vanity mirrors.' },
        FAQ_COMMON_RETURNS('wall lamp'),
      ],
    },
    pendants: {
      title: 'Pendant & Hanging Lights',
      intro: 'Minimalist linear drops, modern glass orbs, and cluster pendants designed for dining tables, kitchen islands, and stairwells.',
      faq: [
        { icon: 'fa-arrows-up-down', q: 'Is the hanging wire adjustable?', a: 'Yes, hanging cords and suspension cables are fully height-adjustable up to 1.5–2 meters.' },
        FAQ_COMMON_RETURNS('pendant light'),
      ],
    },
    'ceiling-fans': {
      title: 'Ceiling & Chandelier Fans',
      intro: 'Silent BLDC motor fans with hand-carved natural wooden palm blades, retractable acrylic blades, and integrated LED lighting.',
      faq: [
        { icon: 'fa-volume-xmark', q: 'Are BLDC motor fans silent?', a: 'Yes. High-efficiency brushless BLDC motors operate below 35 dB with up to 60% energy savings and full remote control.' },
        FAQ_COMMON_RETURNS('ceiling fan'),
      ],
    },
    'track-lights': {
      title: 'Spot & Magnetic Track Lights',
      intro: 'Modular 48V magnetic architectural tracks, adjustable zoom spotlights, and focus luminaires for commercial showrooms and galleries.',
      faq: [
        { icon: 'fa-magnet', q: 'Can track heads be repositioned freely?', a: 'Yes. Magnetic click-and-lock luminaires can be snapped in, removed, and repositioned anywhere along the live track without tools.' },
        FAQ_COMMON_RETURNS('track light'),
      ],
    },
    'cob-downlights': {
      title: 'COB & Concealed Downlights',
      intro: 'Deep anti-glare architectural downlights with high-CRI (>90) Bridgelux and Cree COB chips.',
      faq: [
        { icon: 'fa-eye-slash', q: 'What is deep anti-glare?', a: 'The LED emitter is recessed deep within a micro-baffle reflector (UGR < 16) so light illuminates your room without blinding glare.' },
        FAQ_COMMON_RETURNS('downlight'),
      ],
    },
    'profile-lights': {
      title: 'Profile & Linear Lights',
      intro: 'Anodized aluminium extrusions, hexagonal gym luminaires, and seamless continuous linear lighting.',
      faq: [
        { icon: 'fa-ruler-horizontal', q: 'Can profile lights be cut to custom lengths?', a: 'Yes. Aluminium channels and diffusers can be cut on-site to any exact room dimension.' },
        FAQ_COMMON_RETURNS('profile light'),
      ],
    },
    'strip-rope': {
      title: 'Strip & Cove Rope Lights',
      intro: 'High-density 120/240 LED/m cove ropes, flexible silicone neon strips, and driver power supplies.',
      faq: [
        { icon: 'fa-water', q: 'Are rope lights waterproof?', a: 'Our silicone neon and PVC cove ropes carry IP65 weatherproofing, suitable for exterior elevations and wet areas.' },
        FAQ_COMMON_RETURNS('strip light'),
      ],
    },
    'outdoor-lights': {
      title: 'Outdoor & Landscape Lights',
      intro: 'Heavy-duty solar flood fixtures, gate pillar lamps, underwater fountain LEDs, garden spikes, and facade wall washers.',
      faq: [
        { icon: 'fa-sun', q: 'How long do solar flood lights run on battery?', a: 'Integrated LiFePO4 batteries provide 8–12 hours of continuous dusk-to-dawn illumination on a full day charge.' },
        FAQ_COMMON_RETURNS('outdoor light'),
      ],
    },
    'table-floor': {
      title: 'Table & Floor Lamps',
      intro: 'Rechargeable cordless touch-dim table lamps, reading floor standing fixtures, and sculptural corner luminaires.',
      faq: [
        { icon: 'fa-battery-full', q: 'How long does a rechargeable table lamp last?', a: 'Built-in USB-C rechargeable batteries provide 6 to 12 hours of continuous illumination on a single charge.' },
        FAQ_COMMON_RETURNS('table lamp'),
      ],
    },
    'smart-utility': {
      title: 'Smart Locks & Utility Lighting',
      intro: 'Biometric fingerprint cabinet and drawer locks, automatic wardrobe sensors, emergency drivers, and smart home automation controls.',
      faq: [
        { icon: 'fa-fingerprint', q: 'How many fingerprints can smart locks register?', a: 'Biometric cabinet and drawer locks store up to 10–20 authorized fingerprints with instant 0.3s response.' },
        FAQ_COMMON_RETURNS('utility hardware'),
      ],
    },
  };

  // ---- helpers ----
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');

  function typeKey(p) {
    const c = String(p.category || '').toLowerCase();
    if (c.includes('chandelier')) return 'chandeliers';
    if (c.includes('wall lamp') || c.includes('wall light') || c.includes('picture light')) return 'wall-lamps';
    if (c.includes('pendant') || c.includes('hanging')) return 'pendants';
    if (c.includes('fan')) return 'ceiling-fans';
    if (c.includes('track') || c.includes('spot')) return 'track-lights';
    if (c.includes('cob') || c.includes('downlight')) return 'cob-downlights';
    if (c.includes('profile') || c.includes('linear')) return 'profile-lights';
    if (c.includes('strip') || c.includes('rope')) return 'strip-rope';
    if (c.includes('outdoor') || c.includes('landscape') || c.includes('flood') || c.includes('solar')) return 'outdoor-lights';
    if (c.includes('table') || c.includes('floor')) return 'table-floor';
    if (c.includes('smart') || c.includes('utility') || c.includes('lock') || c.includes('sensor')) return 'smart-utility';
    return 'all';
  }
  function ratingOf(p) {
    const v = (p.reviews || []).map(r => Number(r.rating)).filter(x => x >= 1 && x <= 5);
    return v.length ? { avg: v.reduce((a, b) => a + b, 0) / v.length, count: v.length } : { avg: 4.8, count: 12 };
  }
  const discountOf = (p) => (p.originalPrice > p.price ? Math.round((1 - p.price / p.originalPrice) * 100) : 0);
  const stockOf = (p) => (p.stockQuantity !== undefined ? p.stockQuantity : 50);
  const keywordText = (p) => (Array.isArray(p.keywords) ? p.keywords.join(' ') : String(p.keywords || '')).toLowerCase();
  const typeParamToKey = (v) => {
    if (!v) return 'all';
    const t = String(v).toLowerCase();
    if (t.includes('chandelier')) return 'chandeliers';
    if (t.includes('wall')) return 'wall-lamps';
    if (t.includes('pendant')) return 'pendants';
    if (t.includes('fan')) return 'ceiling-fans';
    if (t.includes('track') || t.includes('spot')) return 'track-lights';
    if (t.includes('cob') || t.includes('downlight')) return 'cob-downlights';
    if (t.includes('profile')) return 'profile-lights';
    if (t.includes('strip') || t.includes('rope')) return 'strip-rope';
    if (t.includes('outdoor')) return 'outdoor-lights';
    if (t.includes('table') || t.includes('floor')) return 'table-floor';
    if (t.includes('smart') || t.includes('utility') || t.includes('lock')) return 'smart-utility';
    return TYPES.some(x => x.key === t) ? t : 'all';
  };

  // ---- state ----
  let products = [];
  let byType = {};
  const state = {
    type: 'all',
    collection: '',   // 'bestsellers' | 'new-arrivals' | 'top-grossing'
    genres: new Set(),
    genreQuery: '',   // loose ?category= from a deep link that matched no facet exactly
    prices: new Set(),
    rating: '',
    discount: '',
    inStock: false,
    sort: 'popular',
    q: '',
    page: 1,
  };

  const $ = (id) => document.getElementById(id);
  const els = {};

  const normalizeCollection = (val) => {
    if (!val) return '';
    const v = String(val).toLowerCase().trim();
    if (v === 'bestsellers' || v === 'bestseller' || v === 'best-sellers' || v === 'best-seller') return 'bestsellers';
    if (v === 'new' || v === 'new-arrivals' || v === 'newarrivals' || v === 'new-arrival' || v === 'newarrival') return 'new-arrivals';
    if (v === 'grossing' || v === 'top-grossing' || v === 'topgrossing' || v === 'top-sellers' || v === 'topsellers') return 'top-grossing';
    return '';
  };

  // ---- URL state ----
  function readUrl() {
    const u = new URLSearchParams(window.location.search);
    state.type = typeParamToKey(u.get('type'));
    state.collection = normalizeCollection(u.get('collection') || u.get('curation'));
    state.q = u.get('search') || u.get('q') || '';
    state.sort = SORTS.some(s => s.key === u.get('sort')) ? u.get('sort') : (state.collection === 'new-arrivals' ? 'newest' : 'popular');
    state.page = Math.max(1, parseInt(u.get('page'), 10) || 1);
    state.genres = new Set();
    state.genreQuery = '';
    const cat = u.get('category');
    if (cat) {
      cat.split(',').forEach(c => {
        const exact = genreFacets(state.type).find(g => g.name.toLowerCase() === c.toLowerCase());
        const loose = exact || genreFacets(state.type).find(g => g.name.toLowerCase().includes(c.toLowerCase()) || c.toLowerCase().includes(g.name.toLowerCase()));
        if (loose) state.genres.add(loose.name);
        else state.genreQuery = c;
      });
    }
    state.prices = new Set((u.get('price') || '').split(',').filter(k => PRICE_BUCKETS.some(b => b.key === k)));
    state.rating = RATINGS.some(r => r.key === u.get('rating')) ? u.get('rating') : '';
    state.discount = DISCOUNTS.some(d => d.key === u.get('discount')) ? u.get('discount') : '';
    state.inStock = u.get('instock') === '1';
  }

  function writeUrl() {
    const u = new URLSearchParams();
    const curProduct = new URLSearchParams(window.location.search).get('product');
    if (curProduct) u.set('product', curProduct);
    if (state.type !== 'all') u.set('type', TYPES.find(t => t.key === state.type).label === 'Apparel' ? 'Apparel' : TYPES.find(t => t.key === state.type).label);
    if (state.collection) u.set('collection', state.collection);
    const cats = [...state.genres];
    if (state.genreQuery) cats.push(state.genreQuery);
    if (cats.length) u.set('category', cats.join(','));
    if (state.prices.size) u.set('price', [...state.prices].join(','));
    if (state.rating) u.set('rating', state.rating);
    if (state.discount) u.set('discount', state.discount);
    if (state.inStock) u.set('instock', '1');
    if (state.sort !== 'popular') u.set('sort', state.sort);
    if (state.q) u.set('search', state.q);
    if (state.page > 1) u.set('page', state.page);
    const qs = u.toString();
    // Keep history.state: an open overlay's Back-button entry lives there.
    history.replaceState(history.state, '', window.location.pathname + (qs ? '?' + qs : ''));
  }


  // ---- search ------------------------------------------------------------
  // The scorer lives in search-core.js so the navbar suggestions rank the same
  // way this grid does.
  const norm = (s) => (window.BrushSearch ? window.BrushSearch.norm(s) : String(s || '').toLowerCase().trim());
  const expand = (q) => (window.BrushSearch ? window.BrushSearch.expand(q) : [String(q || '').toLowerCase().trim()]);
  const score = (p, terms) => (window.BrushSearch ? window.BrushSearch.score(p, terms) : 1);
  const buildVocab = (list) => { if (window.BrushSearch && window.BrushSearch.buildVocab) window.BrushSearch.buildVocab(list); };
  const getStopWords = () => (window.BrushSearch && window.BrushSearch.STOP ? window.BrushSearch.STOP : new Set());
  let searchInfo = { dropped: [], used: '' };

  // ---- filtering ----
  function getProductCategories(p) {
    if (!p) return [];
    const set = new Set();
    const list = [];
    const add = (str) => {
      if (!str || typeof str !== 'string') return;
      const clean = str.trim();
      if (!clean) return;
      const lower = clean.toLowerCase();
      if (!set.has(lower)) {
        set.add(lower);
        list.push(clean);
      }
    };
    if (Array.isArray(p.categories)) {
      p.categories.forEach(c => {
        if (typeof c === 'string') c.split(/[,|]/).forEach(add);
      });
    }
    if (typeof p.category === 'string') {
      p.category.split(/[,|]/).forEach(add);
    }
    return list;
  }

  function genreFacets(type) {
    const counts = {};
    (type === 'all' ? products : (byType[type] || [])).forEach(p => {
      getProductCategories(p).forEach(c => {
        if (c && c.toLowerCase() !== 'apparel') counts[c] = (counts[c] || 0) + 1;
      });
    });
    return Object.entries(counts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }

  const nowTime = Date.now();
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  function isRecentProduct(p) {
    const s = Date.parse(p && p.createdAt);
    return !isNaN(s) && s > 0 && (nowTime - s) <= THIRTY_DAYS_MS;
  }

  function getTimestamp(p) {
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
  }

  function matches(p, skip) {
    // 1. Hard constraint: Product category / type isolation
    if (state.type !== 'all' && typeKey(p) !== state.type) return false;

    // 2. Hard constraint: Search query
    if (state.q) {
      p.__score = score(p, expand(state.q));
      if (!p.__score) return false;
    }

    // 3. Hard constraint: Customer-selected Genre / Category
    if (skip !== 'genre') {
      const pCats = getProductCategories(p);
      if (state.genres.size) {
        const matchesAny = pCats.some(c => state.genres.has(c));
        if (!matchesAny) return false;
      }
      if (state.genreQuery) {
        const g = state.genreQuery.toLowerCase();
        const hay = `${p.name || ''} ${pCats.join(' ')} ${p.description || ''} ${keywordText(p)}`.toLowerCase();
        if (!(hay.includes(g) || (g === 'new' && p.showInNewArrivals))) return false;
      }
    }

    // 4. Hard constraint: Customer-selected Price range
    if (skip !== 'price' && state.prices.size) {
      if (![...state.prices].some(k => { const b = PRICE_BUCKETS.find(x => x.key === k); return p.price >= b.min && p.price <= b.max; })) return false;
    }

    // 5. Hard constraint: Customer-selected Rating, Discount, Availability
    if (state.rating && ratingOf(p).avg < Number(state.rating)) return false;
    if (state.discount && discountOf(p) < Number(state.discount)) return false;
    if (state.inStock && stockOf(p) <= 0) return false;

    // Soft merchandising conditions (new-arrivals, bestsellers, grossing) are NEVER
    // filtered out here. They are handled in sorted() via tiered ranking & progressive fallback.
    return true;
  }

  const BESTSELLER_PRIORITY = [
    122, 135, 504, 143, 345, 619, 614, 535, 153, 133, 157, 208, 156, 313, 206, 529,
    223, 533, 177, 532, 137, 337, 134, 294, 144, 2, 4, 6, 43, 318, 302, 307
  ];
  const bsRank = id => {
    const idx = BESTSELLER_PRIORITY.indexOf(Number(id));
    return idx === -1 ? 999 : idx;
  };

  function sorted(list) {
    const withIdx = list.map((p, i) => ({ p, i }));
    const dummy = (p) => (window.BrushImg && BrushImg.isDummy(p) ? 1 : 0);
    const out = (p) => (stockOf(p) <= 0 ? 1 : 0);
    const ts = (p) => getTimestamp(p);
    const idNum = (p) => Number(p.id) || 0;

    const cmp = {
      relevance: (a, b) => {
        const outDiff = out(a.p) - out(b.p);
        if (outDiff !== 0) return outDiff;

        if (state.q) {
          const scoreDiff = (b.p.__score || 0) - (a.p.__score || 0);
          if (scoreDiff !== 0) return scoreDiff;
        }

        // Soft collection priority within relevance
        if (state.collection === 'new-arrivals') {
          const timeDiff = ts(b.p) - ts(a.p);
          if (timeDiff !== 0) return timeDiff;
          return (idNum(b.p) - idNum(a.p)) || a.i - b.i;
        }

        if (state.collection === 'bestsellers') {
          const isBs = p => Boolean(p.showInBestsellers || /best/i.test(p.badge || '') || bsRank(p.id) < 999);
          const tierA = isBs(a.p) ? 1 : 2;
          const tierB = isBs(b.p) ? 1 : 2;
          if (tierA !== tierB) return tierA - tierB;
          const rankDiff = bsRank(a.p.id) - bsRank(b.p.id);
          if (rankDiff !== 0) return rankDiff;
        }

        if (state.collection === 'top-grossing') {
          const tierA = a.p.showInGrossing ? 1 : 2;
          const tierB = b.p.showInGrossing ? 1 : 2;
          if (tierA !== tierB) return tierA - tierB;
        }

        return dummy(a.p) - dummy(b.p) || a.i - b.i;
      },
      popular: (a, b) => {
        const outDiff = out(a.p) - out(b.p);
        if (outDiff !== 0) return outDiff;

        if (state.q) {
          const scoreDiff = (b.p.__score || 0) - (a.p.__score || 0);
          if (scoreDiff !== 0) return scoreDiff;
        }

        // Soft collection priority within popularity
        if (state.collection === 'new-arrivals') {
          const timeDiff = ts(b.p) - ts(a.p);
          if (timeDiff !== 0) return timeDiff;
          return (idNum(b.p) - idNum(a.p)) || a.i - b.i;
        }

        if (state.collection === 'bestsellers') {
          const isBs = p => Boolean(p.showInBestsellers || /best/i.test(p.badge || '') || bsRank(p.id) < 999);
          const tierA = isBs(a.p) ? 1 : 2;
          const tierB = isBs(b.p) ? 1 : 2;
          if (tierA !== tierB) return tierA - tierB;
          const rankDiff = bsRank(a.p.id) - bsRank(b.p.id);
          if (rankDiff !== 0) return rankDiff;
        }

        if (state.collection === 'top-grossing') {
          const tierA = a.p.showInGrossing ? 1 : 2;
          const tierB = b.p.showInGrossing ? 1 : 2;
          if (tierA !== tierB) return tierA - tierB;
        }

        let sa, sb;
        if (window.BrushAnalytics && window.BrushAnalytics.computePopularityScore) {
          sa = window.BrushAnalytics.computePopularityScore(a.p);
          sb = window.BrushAnalytics.computePopularityScore(b.p);
        } else {
          const ra = ratingOf(a.p), rb = ratingOf(b.p);
          sa = (ra.count * ra.avg) + (Number(a.p.orderFrequency) || 0) * 10 + (/best/i.test(a.p.badge || '') ? 25 : 0) + (a.p.showInBestsellers ? 25 : 0) + (a.p.showInGrossing ? 15 : 0);
          sb = (rb.count * rb.avg) + (Number(b.p.orderFrequency) || 0) * 10 + (/best/i.test(b.p.badge || '') ? 25 : 0) + (b.p.showInBestsellers ? 25 : 0) + (b.p.showInGrossing ? 15 : 0);
        }
        return (Math.abs(sb - sa) > 0.001 ? sb - sa : 0) ||
          (bsRank(a.p.id) - bsRank(b.p.id)) ||
          a.i - b.i;
      },
      // Explicit customer-selected sort overrides all internal tiers
      'price-asc': (a, b) => out(a.p) - out(b.p) || (Number(a.p.price) - Number(b.p.price)) || (idNum(a.p) - idNum(b.p)) || a.i - b.i,
      'price-desc': (a, b) => out(a.p) - out(b.p) || (Number(b.p.price) - Number(a.p.price)) || (idNum(a.p) - idNum(b.p)) || a.i - b.i,
      newest: (a, b) => {
        const outDiff = out(a.p) - out(b.p);
        if (outDiff !== 0) return outDiff;
        const timeDiff = ts(b.p) - ts(a.p);
        if (timeDiff !== 0) return timeDiff;
        return (idNum(b.p) - idNum(a.p)) || a.i - b.i;
      },
    }[state.sort] || cmp.popular;
    return withIdx.sort(cmp).map(x => x.p);
  }

  // ---- rendering ----
  function renderTabs() {
    els.tabs.innerHTML = TYPES.map(t => {
      const n = t.key === 'all' ? products.length : (byType[t.key] || []).length;
      if (t.key !== 'all' && !n && products.length) return '';
      return `<button type="button" class="store-tab${state.type === t.key ? ' active' : ''}" data-type="${t.key}" role="tab" aria-selected="${state.type === t.key}">
        <span class="store-tab-icon"><i class="fa-solid ${t.icon}" aria-hidden="true"></i></span>
        <span class="store-tab-label">${t.label}</span>
      </button>`;
    }).join('');
  }

  function checkbox(name, value, label, count, checked) {
    return `<label class="facet-option"><input type="checkbox" name="${name}" value="${esc(value)}" ${checked ? 'checked' : ''}><span>${esc(label)}</span>${count !== undefined ? `<span class="facet-count">${count}</span>` : ''}</label>`;
  }
  function radio(name, value, label, checked) {
    return `<label class="facet-option"><input type="radio" name="${name}" value="${esc(value)}" ${checked ? 'checked' : ''}><span>${esc(label)}</span></label>`;
  }

  function renderFacets() {
    const scope = products.filter(p => state.type === 'all' || typeKey(p) === state.type);
    const genres = genreFacets(state.type);
    const genreCount = (name) => products.filter(p => (p.category || '').trim() === name && matches(p, 'genre')).length;
    const priceCount = (b) => products.filter(p => p.price >= b.min && p.price <= b.max && matches(p, 'price')).length;
    const prices = PRICE_BUCKETS.filter(b => scope.some(p => p.price >= b.min && p.price <= b.max));

    const genreItems = genres.map(g => checkbox('genre', g.name, g.name, genreCount(g.name), state.genres.has(g.name)));
    const MAX = 8;
    els.facets.innerHTML = `
      <div class="facet-head">
        <h2>Filters</h2>
        <button type="button" class="facet-clear" data-action="clear"${activeCount() ? '' : ' hidden'}>Clear all</button>
      </div>
      <div class="facet-group">
        <label class="facet-search">
          <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
          <input type="search" id="store-search" placeholder="Search in ${esc((COPY[state.type] || COPY.all).title.toLowerCase())}…" value="${esc(state.q)}" aria-label="Search products" autocomplete="off">
        </label>
      </div>
      ${genres.length ? `<fieldset class="facet-group">
        <legend>Genre</legend>
        <div class="facet-list${genres.length > MAX ? ' is-collapsible' : ''}">${genreItems.join('')}</div>
        ${genres.length > MAX ? `<button type="button" class="facet-more" data-action="more">+ ${genres.length - MAX} more</button>` : ''}
      </fieldset>` : ''}
      ${prices.length > 1 ? `<fieldset class="facet-group">
        <legend>Price</legend>
        <div class="facet-list">${prices.map(b => checkbox('price', b.key, b.label, priceCount(b), state.prices.has(b.key))).join('')}</div>
      </fieldset>` : ''}
      <fieldset class="facet-group">
        <legend>Customer rating</legend>
        <div class="facet-list">${RATINGS.map(r => radio('rating', r.key, r.label, state.rating === r.key)).join('')}</div>
      </fieldset>
      <fieldset class="facet-group">
        <legend>Discount</legend>
        <div class="facet-list">${DISCOUNTS.map(d => radio('discount', d.key, d.label, state.discount === d.key)).join('')}</div>
      </fieldset>
      <fieldset class="facet-group">
        <legend>Availability</legend>
        <div class="facet-list">${checkbox('instock', '1', 'In stock only', undefined, state.inStock)}</div>
      </fieldset>`;
  }

  const COLLECTION_LABELS = {
    'bestsellers': 'Bestsellers',
    'new-arrivals': 'New Arrivals',
    'top-grossing': 'Top Grossing',
  };

  function activeCount() {
    return (state.collection ? 1 : 0) + state.genres.size + (state.genreQuery ? 1 : 0) + state.prices.size + (state.rating ? 1 : 0) + (state.discount ? 1 : 0) + (state.inStock ? 1 : 0);
  }

  function renderChips() {
    const chips = [];
    if (state.collection) chips.push({ label: COLLECTION_LABELS[state.collection] || state.collection, clear: () => { state.collection = ''; } });
    state.genres.forEach(g => chips.push({ label: g, clear: () => state.genres.delete(g) }));
    if (state.genreQuery) chips.push({ label: state.genreQuery, clear: () => { state.genreQuery = ''; } });
    state.prices.forEach(k => chips.push({ label: PRICE_BUCKETS.find(b => b.key === k).label, clear: () => state.prices.delete(k) }));
    if (state.rating) chips.push({ label: RATINGS.find(r => r.key === state.rating).label, clear: () => { state.rating = ''; } });
    if (state.discount) chips.push({ label: DISCOUNTS.find(d => d.key === state.discount).label, clear: () => { state.discount = ''; } });
    if (state.inStock) chips.push({ label: 'In stock', clear: () => { state.inStock = false; } });
    if (state.q) chips.push({ label: `“${state.q}”`, clear: () => { state.q = ''; } });
    renderChips.clearers = chips.map(c => c.clear);
    els.chips.innerHTML = chips.length
      ? chips.map((c, i) => `<button type="button" class="filter-chip" data-chip="${i}" aria-label="Remove filter ${esc(c.label)}">${esc(c.label)} <i class="fa-solid fa-xmark" aria-hidden="true"></i></button>`).join('') +
        `<button type="button" class="filter-chip filter-chip--clear" data-action="clear">Clear all</button>`
      : '';
    els.chips.hidden = !chips.length;
    const n = activeCount();
    els.filterBadge.textContent = n;
    els.filterBadge.hidden = !n;
  }

  function renderSort() {
    els.sortBar.innerHTML = `<span class="sort-label">Sort by</span>` + SORTS.map(s =>
      `<button type="button" class="sort-opt${state.sort === s.key ? ' active' : ''}" data-sort="${s.key}" aria-pressed="${state.sort === s.key}">${s.label}</button>`).join('');
    els.sortSheetList.innerHTML = SORTS.map(s => radio('sort-m', s.key, s.label, state.sort === s.key)).join('');
    els.sortCurrent.textContent = SORTS.find(s => s.key === state.sort).label;
  }

  function cardHtml(p, index) {
    const r = ratingOf(p);
    const off = discountOf(p);
    const isOut = stockOf(p) <= 0;
    const t = typeKey(p);
    const isPack = t === 'packs' || String(p.productType || '').toLowerCase().includes('pack') || String(p.category || '').toLowerCase().includes('pack') || String(p.category || '').toLowerCase().includes('wall setup') || String(p.productType || '').toLowerCase().includes('split');
    const isSplit = isPack && Number(p.id) !== 540 && (String(p.productType || '').toLowerCase().includes('split') || String(p.productType || '').toLowerCase().includes('poster_3_pack') || String(p.productType || '').toLowerCase().includes('poster_2_pack') || String(p.name || '').toLowerCase().includes('split') || String(p.image || '').toLowerCase().includes('split'));
    const isSplit2 = isSplit && (String(p.productType || '').includes('2') || String(p.name || '').includes('2-Pack') || String(p.name || '').includes('2 Piece') || [738, 739, 740].includes(Number(p.id)));
    const splitCardClass = isSplit ? (isSplit2 ? ' is-split-card is-split-2' : ' is-split-card is-split-3') : '';
    const imgAttrs = (t === 'apparel' && p.backImage) ? BrushImg.urlAttrs(p.backImage, 480) : BrushImg.attrs(p, isSplit ? 1080 : 480);
    const isMetal = t.includes('metal') || String(p.category || '').toLowerCase().includes('metal') || String(p.productType || '').toLowerCase().includes('metal');
    const isMetalPoster = isMetal && Boolean(p.designImage);
    const isSinglePoster = (t === 'posters' || t === 'poster') && !isPack && !isMetal;
    const fit = (t === 'stickers' || t === 'collectibles') ? ' is-contain' : (isSplit ? ' is-split-card-media' : (isPack ? ' is-pack-card' : ''));
    const rawBadge = p.badge || '';
    const displayBadge = (!isRecentProduct(p) && /new/i.test(rawBadge)) ? (rawBadge === 'New' || rawBadge === 'New Arrival' ? '' : rawBadge) : rawBadge;
    const isAboveFold = typeof index === 'number' && index < 6;
    const loadAttr = isAboveFold ? 'fetchpriority="high" loading="eager"' : 'loading="lazy"';
    return `
      <article class="store-card product-card${isOut ? ' is-out' : ''}${splitCardClass}" data-id="${esc(p.id)}" data-name="${esc(p.name)}" data-price="${esc(p.price)}" data-original="${esc(p.originalPrice || p.price)}" data-image="${esc(BrushImg.original(p))}" data-stock="${stockOf(p)}" data-product-type="${esc(p.productType || 'poster')}" tabindex="0" aria-label="${esc(p.name)}, ${inr(p.price)}">
        <div class="store-card-media${fit}">
          ${displayBadge ? `<span class="store-card-badge">${esc(displayBadge)}</span>` : ''}
          <img ${imgAttrs} class="plain-product-image${t === 'apparel' ? ' apparel-card-img' : ''}" alt="${esc(p.name)} ${esc(p.category || '')}" width="480" height="600" ${loadAttr} decoding="async">
          ${isMetalPoster ? `<img class="product-card-hover-mockup metal-artwork-hover" data-mockup="/${esc(encodeURI(p.designImage))}" alt="${esc(p.name)} Artwork" width="480" height="600" loading="lazy" decoding="async">` : (isSinglePoster ? `<img class="product-card-hover-mockup" data-mockup="/img/framed-mockups/${p.id}.webp" alt="${esc(p.name)} Framed on Spacejoy Wall" width="480" height="600" loading="lazy" decoding="async">` : '')}
          ${isSplit ? `<span class="split-view-badge"><i class="fa-solid fa-expand"></i> Room View</span>` : ''}
          ${isOut ? '<span class="store-card-soldout">Out of stock</span>' : ''}
        </div>
        <div class="product-card-info store-card-body">
          <h3>${esc(p.name)}</h3>
          <p class="store-card-meta">${esc(p.category || TYPES.find(x => x.key === t)?.label || '')}</p>
          ${r.count && window.BrushStars ? `<div class="card-rating">${window.BrushStars(r.avg, 'stars-sm')}<span>${r.avg.toFixed(1)} (${r.count})</span></div>` : ''}
          <div class="product-pricing">
            <span class="price-current">${inr(p.price)}</span>
            ${off ? `<span class="price-original">${inr(p.originalPrice)}</span><span class="price-discount">${off}% off</span>` : ''}
          </div>
          <button type="button" class="quick-add-btn store-card-add" ${isOut ? 'disabled' : ''} aria-label="${isOut ? 'Out of stock' : 'Add ' + esc(p.name) + ' to cart'}">${isOut ? 'Out of stock' : 'Add to cart'}</button>
        </div>
      </article>`;
  }

  function renderGrid() {
    searchInfo = { dropped: [], used: state.q || '' };
    let list = sorted(products.filter(p => matches(p)));

    // A blank page is never a useful answer. Drop the least productive word,
    // then — if it is still empty — the filters, and say so rather than
    // pretending the shop has nothing.
    if (!list.length && state.q) {
      const stopWords = getStopWords();
      const words = norm(state.q).split(' ').filter(w => w && !stopWords.has(w));
      if (words.length > 1) {
        const keep = words
          .map(w => ({ w, n: products.filter(p => score(p, expand(w))).length }))
          .sort((a, b) => b.n - a.n);
        if (keep[0].n) {
          searchInfo.dropped = keep.slice(1).map(x => x.w);
          searchInfo.used = keep[0].w;
          const real = state.q; state.q = keep[0].w;
          list = sorted(products.filter(p => matches(p)));
          state.q = real;
        }
      }
      if (!list.length && (state.genres.size || state.prices.size || state.rating || state.discount || state.inStock)) {
        searchInfo.relaxedFilters = true;
        const snap = { g: state.genres, pr: state.prices, r: state.rating, d: state.discount, st: state.inStock };
        state.genres = new Set(); state.prices = new Set();
        state.rating = ''; state.discount = ''; state.inStock = false;
        list = sorted(products.filter(p => matches(p)));
        state.genres = snap.g; state.prices = snap.pr;
        state.rating = snap.r; state.discount = snap.d; state.inStock = snap.st;
      }
    }
    const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    state.page = Math.min(state.page, totalPages);

    currentGridList = list;
    renderedPage = state.page;
    renderedIds.clear();

    const initialSlice = list.slice(0, renderedPage * PAGE_SIZE);
    initialSlice.forEach(p => renderedIds.add(String(p.id)));

    const note = searchInfo.dropped.length
      ? ` — showing matches for “${esc(searchInfo.used)}”, nothing matched “${esc(searchInfo.dropped.join(' '))}”`
      : (searchInfo.relaxedFilters ? ' — filters set aside to show these' : '');
    els.count.textContent = list.length
      ? `Showing 1–${initialSlice.length} of ${list.length} ${list.length === 1 ? 'product' : 'products'}${note}`
      : 'No products';
    els.sheetCount.textContent = `${list.length} ${list.length === 1 ? 'product' : 'products'}`;

    if (!list.length) {
      els.grid.innerHTML = `
        <div class="store-empty">
          <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
          <h3>No matches${state.q ? ` for “${esc(state.q)}”` : ''}</h3>
          <p>Browse a genre instead — these are the biggest:</p>
          <div class="store-empty-chips">${
            genreFacets(state.type).slice(0, 8)
              .map(g => `<button type="button" class="chip" data-empty-genre="${esc(g.name)}">${esc(g.name)} <span class="chip-count">${g.count}</span></button>`)
              .join('')
          }</div>
          ${activeCount() || state.q ? '<button type="button" class="btn-ghost" data-action="clear">Clear all filters</button>' : ''}
        </div>`;
      if (infiniteScrollObserver) infiniteScrollObserver.disconnect();
    } else {
      const cardsMarkup = initialSlice.map(cardHtml).join('');
      const sentinelMarkup = renderedPage < totalPages
        ? `<div class="store-scroll-sentinel store-feed-loader" id="store-scroll-sentinel"><i class="fa-solid fa-spinner fa-spin"></i> Loading more designs…</div>`
        : (list.length > PAGE_SIZE ? `<div class="store-feed-end"><i class="fa-solid fa-circle-check"></i> You've reached the end · All ${list.length} products displayed</div>` : '');

      els.grid.innerHTML = cardsMarkup + sentinelMarkup;
      bindInfiniteScroll(totalPages);
    }

    renderPagination(totalPages);
    if (window.BrushPageLoader) window.BrushPageLoader.done();
  }

  let currentGridList = [];
  let renderedPage = 1;
  let isAppendingPage = false;
  let infiniteScrollObserver = null;
  const renderedIds = new Set();

  function bindInfiniteScroll(totalPages) {
    if (infiniteScrollObserver) {
      infiniteScrollObserver.disconnect();
      infiniteScrollObserver = null;
    }
    const sentinel = $('store-scroll-sentinel');
    if (!sentinel || renderedPage >= totalPages) return;

    infiniteScrollObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && !isAppendingPage && renderedPage < totalPages) {
          appendNextPage(totalPages);
        }
      });
    }, { rootMargin: '450px 0px' });

    infiniteScrollObserver.observe(sentinel);
  }

  function appendNextPage(totalPages) {
    if (isAppendingPage || renderedPage >= totalPages) return;
    isAppendingPage = true;
    renderedPage++;
    state.page = renderedPage;

    const start = (renderedPage - 1) * PAGE_SIZE;
    const nextBatch = currentGridList.slice(start, start + PAGE_SIZE);

    const sentinel = $('store-scroll-sentinel');
    if (nextBatch.length && sentinel && sentinel.parentNode === els.grid) {
      const fragment = document.createDocumentFragment();
      nextBatch.forEach((p, idx) => {
        if (!renderedIds.has(String(p.id))) {
          renderedIds.add(String(p.id));
          const temp = document.createElement('div');
          temp.innerHTML = cardHtml(p, start + idx);
          while (temp.firstChild) {
            fragment.appendChild(temp.firstChild);
          }
        }
      });
      els.grid.insertBefore(fragment, sentinel);
    }

    const currentCount = renderedIds.size;
    els.count.textContent = `Showing 1–${currentCount} of ${currentGridList.length} ${currentGridList.length === 1 ? 'product' : 'products'}`;
    els.sheetCount.textContent = `${currentGridList.length} ${currentGridList.length === 1 ? 'product' : 'products'}`;

    renderPagination(totalPages);
    writeUrl();

    if (renderedPage >= totalPages) {
      if (sentinel) {
        sentinel.className = 'store-feed-end';
        sentinel.innerHTML = `<i class="fa-solid fa-circle-check"></i> You've reached the end · All ${currentGridList.length} products displayed`;
      }
      if (infiniteScrollObserver) {
        infiniteScrollObserver.disconnect();
        infiniteScrollObserver = null;
      }
    }
    isAppendingPage = false;
  }

  function renderPagination(totalPages) {
    if (totalPages <= 1) { els.pagination.innerHTML = ''; return; }
    const pages = [];
    for (let p = 1; p <= totalPages; p++) {
      if (p === 1 || p === totalPages || Math.abs(p - state.page) <= 1) pages.push(p);
      else if (pages[pages.length - 1] !== '…') pages.push('…');
    }
    els.pagination.innerHTML = `
      <span class="page-status">Page ${state.page} of ${totalPages}</span>
      <div class="page-buttons">
        <button type="button" class="page-btn page-btn--nav" data-page="${state.page - 1}" ${state.page === 1 ? 'disabled' : ''}><i class="fa-solid fa-chevron-left" aria-hidden="true"></i> Prev</button>
        ${pages.map(p => p === '…' ? '<span class="page-ellipsis">…</span>'
          : `<button type="button" class="page-btn${p === state.page ? ' active' : ''}" data-page="${p}" ${p === state.page ? 'aria-current="page"' : ''} aria-label="Page ${p}">${p}</button>`).join('')}
        <button type="button" class="page-btn page-btn--nav" data-page="${state.page + 1}" ${state.page === totalPages ? 'disabled' : ''}>Next <i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button>
      </div>`;
  }

  const COLLECTION_COPY = {
    'bestsellers': {
      title: 'Bestsellers',
      intro: 'Our most popular, trending prints and designs, ordered by community popularity.',
    },
    'new-arrivals': {
      title: 'New Arrivals',
      intro: 'Fresh prints and latest designs straight off the press.',
    },
    'top-grossing': {
      title: 'Top Grossing Picks',
      intro: 'Our highest-performing collections, hand-picked by the team.',
    },
  };

  function renderCopy() {
    const copy = COPY[state.type] || COPY.all;
    const colCopy = state.collection ? COLLECTION_COPY[state.collection] : null;

    if (colCopy) {
      els.title.textContent = state.type !== 'all' ? `${colCopy.title} — ${copy.title}` : colCopy.title;
      els.crumb.textContent = colCopy.title;
      els.intro.textContent = colCopy.intro;
    } else {
      els.title.textContent = state.genres.size === 1 && !state.genreQuery ? `${[...state.genres][0]} ${copy.title === 'All Products' ? '' : copy.title}`.trim() : copy.title;
      els.crumb.textContent = copy.title;
      els.intro.textContent = copy.intro;
    }

    document.title = `${els.title.textContent} — Brush`;
    els.reelsPromo.hidden = state.type !== 'posters';
    const reelsHref = 'poster-reels.html' + (state.genres.size === 1 ? '?genre=' + encodeURIComponent([...state.genres][0]) : '');
    els.reelsPromo.querySelector('a').href = reelsHref;
    els.faq.innerHTML = copy.faq.map(item => `
      <div class="faq-item">
        <button type="button" class="faq-question">
          <span class="faq-q-text"><i class="${item.iconStyle || 'fa-solid'} ${item.icon}" aria-hidden="true"></i> ${item.q}</span>
          <i class="fa-solid fa-chevron-down faq-toggle-icon" aria-hidden="true"></i>
        </button>
        <div class="faq-answer"><div class="faq-answer-inner"><p>${item.a}</p></div></div>
      </div>`).join('');
  }

  function render(opts = {}) {
    renderTabs();
    renderCopy();
    if (!opts.keepFacets) renderFacets();
    renderChips();
    renderSort();
    renderGrid();
    writeUrl();
  }

  function update(mutator, opts = {}) {
    if (window.BrushPageLoader) window.BrushPageLoader.start();
    mutator();
    state.page = opts.keepPage ? state.page : 1;
    render(opts);
    if (opts.scroll) scrollToResults();
  }

  function scrollToResults() {
    const top = els.results.getBoundingClientRect().top + window.scrollY - 96;
    if (window.lenis) window.lenis.scrollTo(top); else window.scrollTo({ top, behavior: 'smooth' });
  }

  // ---- mobile sheets ----
  let openSheet = null;
  function setSheet(sheet, fromHistory) {
    if (openSheet === sheet) return;
    const wasOpen = !!openSheet;
    if (openSheet) {
      openSheet.classList.remove('open');
      if (window.BrushScrollLock) BrushScrollLock.unlock();
    }
    openSheet = sheet;
    els.sheetBackdrop.classList.toggle('open', !!sheet);
    if (sheet) {
      sheet.classList.add('open');
      if (window.BrushScrollLock) BrushScrollLock.lock();
      if (!wasOpen && window.BrushBack) BrushBack.opened('sheet');
      const focusable = sheet.querySelector('input, button');
      if (focusable) focusable.focus({ preventScroll: true });
    } else if (wasOpen && fromHistory !== true && window.BrushBack) {
      BrushBack.closed('sheet');
    }
  }
  const mobile = window.matchMedia('(max-width: 900px)');

  // ---- events ----
  function bind() {
    els.tabs.addEventListener('click', (e) => {
      const b = e.target.closest('.store-tab');
      if (!b || b.dataset.type === state.type) return;
      update(() => {
        state.type = b.dataset.type;
        state.genres.clear(); state.genreQuery = ''; state.prices.clear();
      });
      b.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    });

    // Facets: filters apply instantly on desktop; inside the mobile sheet
    // they also apply live (the result count updates behind the sheet) and
    // "Show results" just closes it.
    els.facets.addEventListener('change', (e) => {
      const i = e.target;
      if (i.name === 'genre') update(() => { i.checked ? state.genres.add(i.value) : state.genres.delete(i.value); state.genreQuery = ''; }, { keepFacets: true });
      else if (i.name === 'price') update(() => { i.checked ? state.prices.add(i.value) : state.prices.delete(i.value); }, { keepFacets: true });
      else if (i.name === 'rating') update(() => { state.rating = i.value; }, { keepFacets: true });
      else if (i.name === 'discount') update(() => { state.discount = i.value; }, { keepFacets: true });
      else if (i.name === 'instock') update(() => { state.inStock = i.checked; }, { keepFacets: true });
      refreshFacetCounts();
    });
    let searchTimer;
    els.facets.addEventListener('input', (e) => {
      if (e.target.id !== 'store-search') return;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { update(() => { state.q = e.target.value.trim(); }, { keepFacets: true }); refreshFacetCounts(); }, 40);
    });
    // Radios can't be un-ticked natively — clicking the checked one clears it.
    els.facets.addEventListener('click', (e) => {
      const i = e.target.closest('input[type="radio"]');
      if (i && i.dataset.wasChecked === '1') {
        i.checked = false;
        update(() => { state[i.name] = ''; }, { keepFacets: true });
        refreshFacetCounts();
      }
      els.facets.querySelectorAll('input[type="radio"]').forEach(r => { r.dataset.wasChecked = r.checked ? '1' : ''; });
      const more = e.target.closest('[data-action="more"]');
      if (more) {
        const list = more.previousElementSibling;
        list.classList.toggle('is-expanded');
        more.textContent = list.classList.contains('is-expanded') ? 'Show less' : `+ ${list.children.length - 8} more`;
      }
    });
    els.facets.addEventListener('pointerdown', (e) => {
      const i = e.target.closest('label')?.querySelector('input[type="radio"]');
      if (i) i.dataset.wasChecked = i.checked ? '1' : '';
    });

    document.addEventListener('click', (e) => {
      if (e.target.closest('[data-action="clear"]')) {
        update(() => {
          state.collection = '';
          state.genres.clear(); state.genreQuery = ''; state.prices.clear();
          state.rating = ''; state.discount = ''; state.inStock = false; state.q = '';
        });
        return;
      }
      const chip = e.target.closest('[data-chip]');
      if (chip) { update(() => renderChips.clearers[Number(chip.dataset.chip)]()); return; }
    });

    els.sortBar.addEventListener('click', (e) => {
      const b = e.target.closest('[data-sort]');
      if (b) update(() => { state.sort = b.dataset.sort; }, { keepFacets: true });
    });
    els.sortSheetList.addEventListener('change', (e) => {
      update(() => { state.sort = e.target.value; }, { keepFacets: true });
      setTimeout(() => setSheet(null), 150);
    });

    els.pagination.addEventListener('click', (e) => {
      const b = e.target.closest('[data-page]');
      if (!b || b.disabled) return;
      update(() => { state.page = Number(b.dataset.page); }, { keepFacets: true, keepPage: true, scroll: true });
    });

    // Keyboard: Enter on a focused card opens it, like a click.
    // genre chips on the empty state
    els.grid.addEventListener('click', (e) => {
      const g = e.target.closest('[data-empty-genre]');
      if (!g) return;
      update(() => { state.q = ''; state.genres = new Set([g.dataset.emptyGenre]); });
    });

    els.grid.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.classList.contains('store-card')) e.target.click();
    });

    if (window.BrushBack) BrushBack.register('sheet', () => setSheet(null, true), () => !!openSheet);
    window.addEventListener('pageshow', (e) => { if (e.persisted) setSheet(null, true); });
    $('open-filters').addEventListener('click', () => setSheet(els.facetsPanel));
    $('open-sort').addEventListener('click', () => setSheet(els.sortSheet));
    els.sheetBackdrop.addEventListener('click', () => setSheet(null));
    document.querySelectorAll('[data-close-sheet]').forEach(b => b.addEventListener('click', () => setSheet(null)));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && openSheet) setSheet(null); });
    mobile.addEventListener('change', () => { if (!mobile.matches) setSheet(null); });

    els.faq.addEventListener('click', (e) => {
      const btn = e.target.closest('.faq-question');
      if (!btn) return;
      const item = btn.parentElement;
      const wasActive = item.classList.contains('active');
      els.faq.querySelectorAll('.faq-item').forEach(i => i.classList.remove('active'));
      if (!wasActive) item.classList.add('active');
    });
  }

  // Update only the counts/visibility in the facet panel so a click
  // doesn't rebuild the list under the user's finger.
  function refreshFacetCounts() {
    els.facets.querySelectorAll('input[name="genre"]').forEach(i => {
      const n = products.filter(p => (p.category || '').trim() === i.value && matches(p, 'genre')).length;
      const c = i.parentElement.querySelector('.facet-count'); if (c) c.textContent = n;
    });
    els.facets.querySelectorAll('input[name="price"]').forEach(i => {
      const b = PRICE_BUCKETS.find(x => x.key === i.value);
      const n = products.filter(p => p.price >= b.min && p.price <= b.max && matches(p, 'price')).length;
      const c = i.parentElement.querySelector('.facet-count'); if (c) c.textContent = n;
    });
    const clear = els.facets.querySelector('.facet-clear');
    if (clear) clear.hidden = !activeCount();
  }

  async function init() {
    ['tabs', 'facets', 'chips', 'sortBar', 'grid', 'count', 'pagination', 'title', 'crumb', 'intro', 'faq', 'results', 'reelsPromo', 'filterBadge', 'sortSheet', 'sortSheetList', 'sortCurrent', 'sheetBackdrop', 'sheetCount']
      .forEach(k => { els[k] = $('store-' + k.replace(/[A-Z]/g, m => '-' + m.toLowerCase())); });
    els.facetsPanel = $('store-facets-panel');
    bind();

    try {
      const load = window.BrushCatalog
        ? window.BrushCatalog.getProducts()
        : (window.BrushGetProducts ? window.BrushGetProducts() : fetch(API_BASE + '/products').then(r => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)))));
      const raw = await load;
      const rawList = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.products) ? raw.products : []);
      const rawProducts = rawList.map(p => (typeof Cart !== 'undefined' ? { ...p, price: Cart.priceFor(p, null).price } : p));
      // Digital assets live exclusively on their dedicated /buy-digital-assets/ page
      // and do not appear in the main merchandise product grids.
      products = rawProducts.filter(p => {
        const pt = String(p.productType || '').toLowerCase();
        const cat = String(p.category || '').toLowerCase();
        return !pt.includes('digital') && !cat.includes('digital');
      });
      buildVocab(products);
    } catch (err) {
      console.error('Store load error:', err);
      els.grid.innerHTML = `<div class="store-empty"><i class="fa-solid fa-plug-circle-xmark" aria-hidden="true"></i><h3>Couldn't load products</h3><p>Our catalogue server may be waking up. Please try again in a few seconds.</p><button type="button" class="btn-ghost" onclick="location.reload()">Retry</button></div>`;
      els.count.textContent = '';
      return;
    }
    byType = {};
    products.forEach(p => { (byType[typeKey(p)] = byType[typeKey(p)] || []).push(p); });
    readUrl();
    render();
    refreshFacetCounts();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
