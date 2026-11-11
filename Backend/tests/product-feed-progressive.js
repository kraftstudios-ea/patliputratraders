// ============================================================================
// BRUSH — Progressive Product Feed & Pagination Test Suite
//
// Automated verification covering:
// - Test A: New Arrivals chronological completeness & no truncation
// - Test B: Featured / Bestseller progressive fallback & no duplicates
// - Test C: Metal posters category isolation (zero paper posters)
// - Test D: Customer-selected genre hard constraint preservation
// - Test E: Multiple simultaneous filters strict enforcement
// - Test F: User explicit sort override across all tiers
// - Test G: Pagination page boundaries, zero duplicates, accurate hasMore
//
// Run:
//   node Backend/tests/product-feed-progressive.js
// ============================================================================

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const feed = require('../productFeed');

const catalogPath = path.resolve(__dirname, '../../public/data/products.json');
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

console.log(`\n============================================================`);
console.log(`BRUSH PRODUCT FEED & PAGINATION VERIFICATION SUITE`);
console.log(`Loaded ${catalog.length} products from catalogue`);
console.log(`============================================================\n`);

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  [PASS] Test ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] Test ${name}: ${err.message}`);
    if (err.stack) console.error(err.stack);
    process.exitCode = 1;
  }
}

// ----------------------------------------------------------------------------
// Test A: New Arrivals returns all eligible posters in descending chronological order
// ----------------------------------------------------------------------------
runTest('A: New Arrivals returns all eligible posters in descending chronological order without truncation', () => {
  const result = feed.queryCatalog(catalog, { type: 'posters', collection: 'new-arrivals', limit: 'all' });
  const allEligiblePosters = catalog.filter(p => feed.typeKey(p) === 'posters' && feed.matchesHardConstraints(p, { type: 'posters' }));

  assert(result.products.length > 300, `Expected >300 eligible posters, got ${result.products.length}`);
  assert.strictEqual(result.products.length, allEligiblePosters.length, `Expected all ${allEligiblePosters.length} eligible posters, got ${result.products.length}`);
  assert.strictEqual(result.total, allEligiblePosters.length, `Total count mismatch`);

  // Verify descending chronological order
  for (let i = 0; i < result.products.length - 1; i++) {
    const curr = result.products[i];
    const next = result.products[i + 1];

    const outCurr = curr.stockQuantity !== undefined && curr.stockQuantity <= 0 ? 1 : 0;
    const outNext = next.stockQuantity !== undefined && next.stockQuantity <= 0 ? 1 : 0;
    if (outCurr !== outNext) {
      assert(outCurr <= outNext, `In-stock product at index ${i + 1} came after out-of-stock product at index ${i}`);
      continue;
    }

    const tCurr = feed.getProductTimestamp(curr);
    const tNext = feed.getProductTimestamp(next);
    assert(tCurr >= tNext, `Descending order violated at index ${i}: ID ${curr.id} (${tCurr}) < ID ${next.id} (${tNext})`);

    if (tCurr === tNext) {
      assert(Number(curr.id) >= Number(next.id), `Secondary tie-break violated at index ${i}: ID ${curr.id} < ID ${next.id}`);
    }
  }

  // Ensure oldest posters from early months are present at the tail and NOT truncated
  const tail = result.products.slice(-5);
  const tailHasEarlyIds = tail.some(p => Number(p.id) < 200);
  assert(tailHasEarlyIds, `Tail of New Arrivals should contain earliest catalogue posters, got IDs: ${tail.map(p => p.id).join(', ')}`);
});

// ----------------------------------------------------------------------------
// Test B: Featured / Bestseller products prioritized first, followed by remaining eligible items
// ----------------------------------------------------------------------------
runTest('B: Featured / Bestseller products prioritized first, followed by remaining eligible items in category', () => {
  const result = feed.queryCatalog(catalog, { type: 'posters', collection: 'bestsellers', limit: 'all' });
  const allEligiblePosters = catalog.filter(p => feed.typeKey(p) === 'posters' && feed.matchesHardConstraints(p, { type: 'posters' }));

  assert.strictEqual(result.products.length, allEligiblePosters.length, 'Bestsellers feed must not truncate catalogue');

  const isBestsellerTier1 = p => Boolean(p.showInBestsellers || /best/i.test(p.badge || '') || feed.BESTSELLER_PRIORITY.includes(Number(p.id)));

  // Identify boundary between Tier 1 and Tier 2
  let inTier2 = false;
  let tier1Count = 0;
  let tier2Count = 0;

  for (let i = 0; i < result.products.length; i++) {
    const p = result.products[i];
    const isT1 = isBestsellerTier1(p);

    if (!inTier2 && !isT1) {
      inTier2 = true;
    }

    if (!inTier2) {
      assert(isT1, `Product at index ${i} (ID ${p.id}) should be Tier 1 bestseller`);
      tier1Count++;
    } else {
      tier2Count++;
    }
  }

  assert(tier1Count > 10, `Expected >10 Tier 1 bestsellers, got ${tier1Count}`);
  assert(tier2Count > 200, `Expected progressive fallback to contain >200 Tier 2 posters, got ${tier2Count}`);

  // Zero duplicate IDs
  const seenIds = new Set();
  for (const p of result.products) {
    assert(!seenIds.has(p.id), `Duplicate product ID ${p.id} found across tiers`);
    seenIds.add(p.id);
  }
});

// ----------------------------------------------------------------------------
// Test C: Metal posters feed displays all metal posters and never regular paper posters
// ----------------------------------------------------------------------------
runTest('C: Metal posters feed displays all metal posters and never regular paper posters', () => {
  const result = feed.queryCatalog(catalog, { type: 'metal', limit: 'all' });
  const allMetalInCatalog = catalog.filter(p => feed.typeKey(p) === 'metal');

  assert(result.products.length > 0, 'Metal posters collection should not be empty');
  assert.strictEqual(result.products.length, allMetalInCatalog.length, `Expected ${allMetalInCatalog.length} metal posters, got ${result.products.length}`);

  for (const p of result.products) {
    const k = feed.typeKey(p);
    assert.strictEqual(k, 'metal', `Product ${p.id} (${p.name}) in metal feed has non-metal typeKey: ${k}`);
  }

  // Ensure no paper posters leaked in
  const anyPaper = result.products.some(p => feed.typeKey(p) === 'posters');
  assert(!anyPaper, 'Regular paper poster leaked into metal poster collection!');
});

// ----------------------------------------------------------------------------
// Test D: Customer-selected genre strictly preserves genre and does not append non-genre products
// ----------------------------------------------------------------------------
runTest('D: Customer-selected genre strictly preserves genre and does not append non-genre products', () => {
  const result = feed.queryCatalog(catalog, { category: 'Anime', collection: 'bestsellers', limit: 'all' });

  assert(result.products.length > 0, 'Anime category should have products');
  for (const p of result.products) {
    const cat = String(p.category || '').trim().toLowerCase();
    assert(cat === 'anime' || cat.includes('anime'), `Product ${p.id} with category "${p.category}" leaked into Anime filter`);
  }

  // Same check for Space & Sci-Fi
  const sciFiResult = feed.queryCatalog(catalog, { category: 'Space & Sci-Fi', limit: 'all' });
  assert(sciFiResult.products.length > 0, 'Space & Sci-Fi should have products');
  for (const p of sciFiResult.products) {
    const cat = String(p.category || '').trim().toLowerCase();
    assert(cat.includes('space') || cat.includes('sci-fi'), `Product ${p.id} (${p.category}) leaked into Space & Sci-Fi`);
  }
});

// ----------------------------------------------------------------------------
// Test D2: Multi-genre poster matches both genres independently (e.g. Gaming & Anime)
// ----------------------------------------------------------------------------
runTest('D2: Multi-genre poster matches both genres independently', () => {
  const dualProduct = {
    id: 99999,
    name: 'Cyberpunk Anime Samurai',
    category: 'Gaming, Anime',
    categories: ['Gaming', 'Anime'],
    productType: 'Posters',
    price: 29,
    stockQuantity: 10
  };
  const mockCatalog = [...catalog, dualProduct];

  const gamingResult = feed.queryCatalog(mockCatalog, { category: 'Gaming', limit: 'all' });
  const inGaming = gamingResult.products.some(p => p.id === 99999);
  assert(inGaming, 'Dual-genre product should be found in Gaming category');

  const animeResult = feed.queryCatalog(mockCatalog, { category: 'Anime', limit: 'all' });
  const inAnime = animeResult.products.some(p => p.id === 99999);
  assert(inAnime, 'Dual-genre product should be found in Anime category');

  const f1Result = feed.queryCatalog(mockCatalog, { category: 'F1', limit: 'all' });
  const inF1 = f1Result.products.some(p => p.id === 99999);
  assert(!inF1, 'Dual-genre product should NOT leak into unrelated F1 category');
});

// ----------------------------------------------------------------------------
// Test E: Multiple simultaneous filters strictly respected
// ----------------------------------------------------------------------------
runTest('E: Multiple simultaneous filters strictly respected', () => {
  const filters = {
    type: 'posters',
    category: 'Anime',
    minPrice: 20,
    maxPrice: 35,
    inStock: true,
    limit: 'all'
  };

  const result = feed.queryCatalog(catalog, filters);
  assert(result.products.length > 0, 'Combined filter should match products');

  for (const p of result.products) {
    assert.strictEqual(feed.typeKey(p), 'posters', `Product ${p.id} must be poster`);
    assert(String(p.category || '').toLowerCase().includes('anime'), `Product ${p.id} must be Anime`);
    assert(Number(p.price) >= 20, `Product ${p.id} price ₹${p.price} < ₹20`);
    assert(Number(p.price) <= 35, `Product ${p.id} price ₹${p.price} > ₹35`);
    const stock = p.stockQuantity !== undefined ? Number(p.stockQuantity) : 50;
    assert(stock > 0, `Product ${p.id} stock ${stock} <= 0`);
  }
});

// ----------------------------------------------------------------------------
// Test F: User explicit sort overrides internal tiers
// ----------------------------------------------------------------------------
runTest('F: User explicit sort (e.g. price asc/desc) overrides internal tiers', () => {
  // Test Price Low to High
  const priceAscResult = feed.queryCatalog(catalog, {
    type: 'posters',
    collection: 'bestsellers',
    sort: 'price-asc',
    limit: 'all'
  });

  const inStockAsc = priceAscResult.products.filter(p => (p.stockQuantity !== undefined ? p.stockQuantity : 50) > 0);
  for (let i = 0; i < inStockAsc.length - 1; i++) {
    const pCurr = Number(inStockAsc[i].price);
    const pNext = Number(inStockAsc[i + 1].price);
    assert(pCurr <= pNext, `Price asc violated at index ${i}: ₹${pCurr} > ₹${pNext}`);
  }

  // Test Price High to Low
  const priceDescResult = feed.queryCatalog(catalog, {
    type: 'posters',
    collection: 'new-arrivals',
    sort: 'price-desc',
    limit: 'all'
  });

  const inStockDesc = priceDescResult.products.filter(p => (p.stockQuantity !== undefined ? p.stockQuantity : 50) > 0);
  for (let i = 0; i < inStockDesc.length - 1; i++) {
    const pCurr = Number(inStockDesc[i].price);
    const pNext = Number(inStockDesc[i + 1].price);
    assert(pCurr >= pNext, `Price desc violated at index ${i}: ₹${pCurr} < ₹${pNext}`);
  }
});

// ----------------------------------------------------------------------------
// Test G: Pagination page boundaries have no duplicates, no missing items, and correct hasMore
// ----------------------------------------------------------------------------
runTest('G: Pagination page boundaries have no duplicates, no missing items, and correct hasMore', () => {
  const query = { type: 'posters', collection: 'bestsellers', limit: 24 };

  const page1 = feed.queryCatalog(catalog, { ...query, page: 1 });
  const page2 = feed.queryCatalog(catalog, { ...query, page: 2 });
  const page3 = feed.queryCatalog(catalog, { ...query, page: 3 });

  assert.strictEqual(page1.products.length, 24, `Page 1 should have 24 items, got ${page1.products.length}`);
  assert.strictEqual(page2.products.length, 24, `Page 2 should have 24 items, got ${page2.products.length}`);
  assert.strictEqual(page3.products.length, 24, `Page 3 should have 24 items, got ${page3.products.length}`);

  assert.strictEqual(page1.hasMore, true, 'Page 1 hasMore should be true');
  assert.strictEqual(page2.hasMore, true, 'Page 2 hasMore should be true');

  // Check no duplicates between Page 1 and Page 2
  const ids1 = new Set(page1.products.map(p => p.id));
  const ids2 = new Set(page2.products.map(p => p.id));
  const ids3 = new Set(page3.products.map(p => p.id));

  for (const id of ids2) {
    assert(!ids1.has(id), `Duplicate ID ${id} found between Page 1 and Page 2`);
  }
  for (const id of ids3) {
    assert(!ids1.has(id) && !ids2.has(id), `Duplicate ID ${id} found in Page 3`);
  }

  // Iterate to the very last page
  const totalPages = page1.totalPages;
  const lastPage = feed.queryCatalog(catalog, { ...query, page: totalPages });
  assert.strictEqual(lastPage.hasMore, false, 'Final page hasMore should be false');

  // Collect all pages and verify exact count and no omissions
  const allPagedIds = [];
  for (let p = 1; p <= totalPages; p++) {
    const res = feed.queryCatalog(catalog, { ...query, page: p });
    allPagedIds.push(...res.products.map(x => x.id));
  }

  assert.strictEqual(allPagedIds.length, page1.total, `Paged collection size (${allPagedIds.length}) != total (${page1.total})`);
  const uniquePagedIds = new Set(allPagedIds);
  assert.strictEqual(uniquePagedIds.size, page1.total, `Duplicate IDs detected across pagination batches`);
});

console.log(`\n============================================================`);
console.log(`RESULTS: ${passedTests}/${totalTests} Tests Passed`);
console.log(`============================================================\n`);
