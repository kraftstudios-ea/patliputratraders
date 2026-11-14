/**
 * BRUSH — Progressive Product Feed & Pagination Engine
 *
 * Implements intelligent, progressive product feeds across all categories:
 * - Hard Constraints (Strict Exclusion):
 *   - Category / Product Type (posters, metal, apparel, stickers, etc.)
 *   - Customer-selected filters (genre, price range, rating, discount, stock, search)
 *   - Public visibility / published status
 *   - Digital assets isolation (served only on /buy-digital-assets/)
 * - Soft Constraints (Ranking & Progressive Fallback):
 *   - New Arrivals (complete chronological ordering without date cutoffs or tag truncation)
 *   - Bestsellers (Tier 1 bestsellers -> Tier 2 progressive popularity fallback)
 *   - Top Grossing (Tier 1 grossing -> Tier 2 progressive popularity fallback)
 *   - Featured / Curated Discovery
 * - Stable Multi-Tier Sorting & Pagination (consistent page sizes, no duplicates, accurate hasMore)
 */

const BESTSELLER_PRIORITY = [
  122, 135, 504, 143, 345, 619, 614, 535, 153, 133, 157, 208, 156, 313, 206, 529,
  223, 533, 177, 532, 137, 337, 134, 294, 144, 2, 4, 6, 43, 318, 302, 307
];

const BESTSELLER_SET = new Set(BESTSELLER_PRIORITY);

function bsRank(id) {
  const idx = BESTSELLER_PRIORITY.indexOf(Number(id));
  return idx === -1 ? 999 : idx;
}

/**
 * Standardized category mapping matching public/store.js typeKey
 */
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

function typeKey(p) {
  if (!p) return 'all';
  const c = String(p.category || '').toLowerCase();
  const t = String(p.productType || '').toLowerCase();
  if (c.includes('chandelier') || t.includes('chandelier')) return 'chandeliers';
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
  if (t === 'lights') return 'lights';
  return 'lights';
}

/**
 * Extract monotonic chronological timestamp
 */
function getProductTimestamp(p) {
  if (!p) return 0;
  if (p.createdAt) {
    const t = Date.parse(p.createdAt);
    if (!isNaN(t) && t > 0) return t;
  }
  if (p.updatedAt) {
    const t = Date.parse(p.updatedAt);
    if (!isNaN(t) && t > 0) return t;
  }
  // Synthetic fallback: ensure products with higher IDs (added later) order higher
  return (Number(p.id) || 0) * 1000;
}

function ratingOf(p) {
  const v = (p.reviews || []).map(r => Number(r.rating)).filter(x => x >= 1 && x <= 5);
  return v.length ? { avg: v.reduce((a, b) => a + b, 0) / v.length, count: v.length } : { avg: 0, count: 0 };
}

function discountOf(p) {
  const price = Number(p.price) || 0;
  const original = Number(p.originalPrice || p.price) || 0;
  return original > price ? Math.round((1 - price / original) * 100) : 0;
}

function stockOf(p) {
  return p.stockQuantity !== undefined ? Number(p.stockQuantity) : 50;
}

function popularityScore(p) {
  const r = ratingOf(p);
  const freq = Number(p.orderFrequency) || 0;
  const badgeBest = /best/i.test(p.badge || '') ? 25 : 0;
  const flagBest = p.showInBestsellers ? 25 : 0;
  const flagGross = p.showInGrossing ? 15 : 0;
  return (r.count * r.avg) + (freq * 10) + badgeBest + flagBest + flagGross;
}

/**
 * Evaluates HARD constraints only.
 * Soft merchandising conditions (new-arrivals, bestsellers, grossing) are NEVER filtered here.
 */
function matchesHardConstraints(p, filters = {}) {
  if (!p) return false;

  // Published / visibility check
  if (p.isPublished === false || p.status === 'draft' || p.status === 'archived') {
    return false;
  }

  const pType = typeKey(p);

  // Digital assets are isolated to their dedicated page unless explicitly requested
  const requestedType = filters.type ? String(filters.type).toLowerCase() : 'all';
  if (requestedType !== 'digital' && pType === 'digital') {
    return false;
  }

  // 1. Requested category / type (Hard constraint)
  if (requestedType && requestedType !== 'all') {
    if (pType !== requestedType) return false;
  }

  // 2. Customer-selected Genre / Category (Hard constraint)
  if (filters.category || filters.genre) {
    const rawCat = filters.category || filters.genre;
    const genres = Array.isArray(rawCat)
      ? rawCat.map(g => String(g).trim().toLowerCase())
      : String(rawCat).split(',').map(g => g.trim().toLowerCase()).filter(Boolean);

    if (genres.length > 0) {
      const pCats = getProductCategories(p).map(c => c.toLowerCase());
      const matchesGenre = genres.some(g =>
        pCats.some(c => c === g || c.includes(g) || g.includes(c))
      );
      if (!matchesGenre) return false;
    }
  }

  // 3. Customer-selected Search Query (Hard constraint)
  if (filters.search || filters.q) {
    const q = String(filters.search || filters.q).trim().toLowerCase();
    if (q) {
      const keywords = Array.isArray(p.keywords) ? p.keywords.join(' ') : String(p.keywords || '');
      const haystack = `${p.name || ''} ${p.category || ''} ${p.description || ''} ${keywords}`.toLowerCase();
      const terms = q.split(/\s+/).filter(Boolean);
      const matchesSearch = terms.every(t => haystack.includes(t));
      if (!matchesSearch) return false;
    }
  }

  // 4. Customer-selected Price Range (Hard constraint)
  const price = Number(p.price) || 0;
  if (filters.minPrice !== undefined && filters.minPrice !== null && filters.minPrice !== '') {
    if (price < Number(filters.minPrice)) return false;
  }
  if (filters.maxPrice !== undefined && filters.maxPrice !== null && filters.maxPrice !== '') {
    if (price > Number(filters.maxPrice)) return false;
  }

  // 5. Customer-selected Rating (Hard constraint)
  if (filters.rating) {
    const minRating = Number(filters.rating);
    if (!isNaN(minRating) && minRating > 0) {
      if (ratingOf(p).avg < minRating) return false;
    }
  }

  // 6. Customer-selected Discount (Hard constraint)
  if (filters.discount) {
    const minDiscount = Number(filters.discount);
    if (!isNaN(minDiscount) && minDiscount > 0) {
      if (discountOf(p) < minDiscount) return false;
    }
  }

  // 7. Customer-selected Availability (Hard constraint)
  if (filters.inStock === true || filters.inStock === 'true' || filters.inStock === '1' || filters.instock === '1') {
    if (stockOf(p) <= 0) return false;
  }

  return true;
}

/**
 * Intelligent Ranking and Progressive Fallback
 */
function rankAndSortProducts(products, options = {}) {
  const collection = String(options.collection || options.curation || '').toLowerCase().trim();
  const sort = String(options.sort || '').toLowerCase().trim();

  // Out-of-stock items sink in every sort
  const out = p => (stockOf(p) <= 0 ? 1 : 0);
  const ts = p => getProductTimestamp(p);
  const idNum = p => Number(p.id) || 0;

  // Case 1: Explicit user-selected sort overrides internal merchandising tiers
  if (sort === 'price-asc') {
    return [...products].sort((a, b) => out(a) - out(b) || (Number(a.price) - Number(b.price)) || (idNum(a) - idNum(b)));
  }
  if (sort === 'price-desc') {
    return [...products].sort((a, b) => out(a) - out(b) || (Number(b.price) - Number(a.price)) || (idNum(a) - idNum(b)));
  }
  if (sort === 'newest') {
    return [...products].sort((a, b) => out(a) - out(b) || (ts(b) - ts(a)) || (idNum(b) - idNum(a)));
  }
  if (sort === 'popular') {
    return [...products].sort((a, b) => out(a) - out(b) || (popularityScore(b) - popularityScore(a)) || (idNum(b) - idNum(a)));
  }

  // Case 2: New Arrivals Feed
  // Must return the complete eligible poster/category collection in descending chronological order
  if (collection === 'new-arrivals' || collection === 'new') {
    return [...products].sort((a, b) => out(a) - out(b) || (ts(b) - ts(a)) || (idNum(b) - idNum(a)));
  }

  // Case 3: Bestsellers Feed (Progressive Fallback)
  // Tier 1: Flagged bestsellers / curated bestseller list
  // Tier 2: Remaining eligible products in this collection, ranked by popularity
  if (collection === 'bestsellers' || collection === 'bestseller') {
    const isBestsellerTier1 = p => Boolean(p.showInBestsellers || /best/i.test(p.badge || '') || BESTSELLER_SET.has(idNum(p)));

    return [...products].sort((a, b) => {
      const outDiff = out(a) - out(b);
      if (outDiff !== 0) return outDiff;

      const tierA = isBestsellerTier1(a) ? 1 : 2;
      const tierB = isBestsellerTier1(b) ? 1 : 2;
      if (tierA !== tierB) return tierA - tierB;

      if (tierA === 1) {
        const rankDiff = bsRank(a.id) - bsRank(b.id);
        if (rankDiff !== 0) return rankDiff;
      }

      const popDiff = popularityScore(b) - popularityScore(a);
      if (popDiff !== 0) return popDiff;

      return (Number(b.orderFrequency) || 0) - (Number(a.orderFrequency) || 0) || (idNum(b) - idNum(a));
    });
  }

  // Case 4: Top Grossing Feed (Progressive Fallback)
  // Tier 1: showInGrossing items
  // Tier 2: Progressive fallback to remaining products ordered by popularity
  if (collection === 'top-grossing' || collection === 'grossing') {
    return [...products].sort((a, b) => {
      const outDiff = out(a) - out(b);
      if (outDiff !== 0) return outDiff;

      const tierA = p => (p.showInGrossing ? 1 : 2);
      const diff = tierA(a) - tierA(b);
      if (diff !== 0) return diff;

      const popDiff = popularityScore(b) - popularityScore(a);
      if (popDiff !== 0) return popDiff;

      return (Number(b.orderFrequency) || 0) - (Number(a.orderFrequency) || 0) || (idNum(b) - idNum(a));
    });
  }

  // Case 5: Default Discovery Feed / Relevance
  // Tier 1: Featured / highlighted merchandising items in category
  // Tier 2: Progressive fallback to remaining items
  return [...products].sort((a, b) => {
    const outDiff = out(a) - out(b);
    if (outDiff !== 0) return outDiff;

    const tier = p => (p.showInBestsellers || p.showInGrossing || p.badge ? 1 : 2);
    const tierDiff = tier(a) - tier(b);
    if (tierDiff !== 0) return tierDiff;

    const popDiff = popularityScore(b) - popularityScore(a);
    if (popDiff !== 0) return popDiff;

    return (Number(b.orderFrequency) || 0) - (Number(a.orderFrequency) || 0) || (idNum(b) - idNum(a));
  });
}

/**
 * Slice products with standard pagination metadata
 */
function paginateProducts(items, { page = 1, limit } = {}) {
  const total = items.length;
  const isAll = limit === 'all' || limit === 0 || limit === '0';
  const lim = isAll ? Math.max(1, total) : Math.max(1, Math.min(100, parseInt(limit, 10) || 24));
  const totalPages = Math.max(1, Math.ceil(total / lim));
  const p = Math.max(1, Math.min(totalPages, parseInt(page, 10) || 1));
  const start = (p - 1) * lim;
  const products = items.slice(start, start + lim);
  const hasMore = start + products.length < total;

  return {
    products,
    total,
    page: p,
    limit: lim,
    totalPages,
    hasMore
  };
}

/**
 * End-to-end catalogue query engine
 */
function queryCatalog(allProducts = [], query = {}) {
  // Step 1: Filter by Hard Constraints
  const eligible = allProducts.filter(p => matchesHardConstraints(p, query));

  // Step 2: Intelligent Ranking & Progressive Fallback
  const ranked = rankAndSortProducts(eligible, query);

  // Step 3: Pagination
  const wantsPagination = query.page !== undefined || query.limit !== undefined || query.paginated === 'true';
  if (!wantsPagination) {
    return {
      products: ranked,
      total: ranked.length,
      page: 1,
      limit: ranked.length,
      totalPages: 1,
      hasMore: false,
      isPaginated: false
    };
  }

  const result = paginateProducts(ranked, query);
  result.isPaginated = true;
  return result;
}

module.exports = {
  getProductCategories,
  typeKey,
  getProductTimestamp,
  matchesHardConstraints,
  rankAndSortProducts,
  paginateProducts,
  queryCatalog,
  BESTSELLER_PRIORITY
};
