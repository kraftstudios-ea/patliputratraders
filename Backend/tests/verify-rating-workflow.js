const assert = require('assert');

// Simulate real accurate rating calculation logic from server.js
function calculateRating(productReviews, orderReviews) {
  let totalStars = 0;
  let count = 0;

  for (const p of productReviews) {
    if (Array.isArray(p.reviews)) {
      for (const r of p.reviews) {
        const num = Number(r.rating);
        if (!isNaN(num) && num >= 1 && num <= 5) {
          totalStars += num;
          count++;
        }
      }
    }
  }

  for (const o of orderReviews) {
    const num = Number(o.review?.rating);
    if (!isNaN(num) && num >= 1 && num <= 5) {
      totalStars += num;
      count++;
    }
  }

  let average = '5.0';
  if (count > 0) {
    const rawAvg = totalStars / count;
    average = Math.min(5.0, Math.max(1.0, Math.round(rawAvg * 10) / 10)).toFixed(1);
  }

  return {
    average,
    totalReviews: count,
    submittedReviews: count
  };
}

// 1. Initial baseline with no reviews
const base = calculateRating([], []);
assert.strictEqual(base.average, '5.0', 'Baseline default should be 5.0');
assert.strictEqual(base.totalReviews, 0, 'Initial review count should be 0');
console.log('✓ Initial baseline test passed:', base);

// 2. Add product reviews with rating 5
const products = [
  { reviews: [{ rating: 5, user: 'Sweta' }, { rating: 5, user: 'Aarush' }] }
];
const withProd = calculateRating(products, []);
assert.strictEqual(withProd.submittedReviews, 2);
assert.strictEqual(withProd.average, '5.0', 'Average should be 5.0');
console.log('✓ Product review incorporation passed:', withProd);

// 3. Add order reviews with varied ratings
const orders = [
  { review: { rating: 5, comment: 'Great quality' } },
  { review: { rating: 4, comment: 'Nice poster' } }
];
// (5 + 5 + 5 + 4) / 4 = 19 / 4 = 4.75 -> 4.8
const withBoth = calculateRating(products, orders);
assert.strictEqual(withBoth.submittedReviews, 4);
assert.strictEqual(withBoth.totalReviews, 4);
assert.strictEqual(withBoth.average, '4.8', 'Average should be 4.8');
console.log('✓ Combined product + order reviews incorporation passed:', withBoth);

console.log('All rating workflow tests PASSED!');
