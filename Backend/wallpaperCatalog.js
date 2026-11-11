// Brush wallpaper catalogue — peel-and-stick pattern rolls. Images are built
// by tools/make-wallpaper-assets.py into public/assets/Wallpapers/<slug>/
// (room.jpg mockup, pattern.jpg, detail.jpg) with WebP thumbnails from
// tools/make-thumbs.py. seedWallpapers() runs on every server start and only
// inserts wallpapers missing from the database (keyed by SKU), so admin edits
// to price, stock or copy are never overwritten.
//
// Launch state: every wallpaper is added OUT OF STOCK (stockQuantity 0) so it
// shows on the site but can't be ordered yet. Restock from the admin panel.
const WALLPAPER_PRICE = 1499;           // 1m × 3m roll; 1.5m × 3m adds ₹300 (productTypes.js)
const WALLPAPER_ORIGINAL_PRICE = 1999;
const LAUNCH_STOCK = 0;

const WALLPAPERS = [
  { slug: 'sage-sand-stripe', name: 'Sage & Sand Stripe', category: 'Minimalist',
    blurb: 'Soft sage and sand stripes with fine pinstripes — calm, classic and easy to style.',
    keywords: ['stripes', 'sage', 'beige', 'minimal', 'classic'] },
  { slug: 'cat-nap', name: 'Cat Nap', category: 'General',
    blurb: 'Dozens of lounging, stretching, curled-up white cats on dusty blue.',
    keywords: ['cats', 'cute', 'blue', 'pets', 'kids room'] },
  { slug: 'paisley-bloom', name: 'Paisley Bloom', category: 'Floral',
    blurb: 'Block-print inspired paisley leaves and hearts in raspberry and marigold on cream.',
    keywords: ['paisley', 'floral', 'block print', 'indian', 'pink'] },
  { slug: 'little-bows', name: 'Little Bows', category: 'Minimalist',
    blurb: 'Tiny red ribbon bows scattered across blush pink — a quiet, sweet ditsy print.',
    keywords: ['bows', 'pink', 'coquette', 'minimal', 'ditsy'] },
  { slug: 'bunny-meadow', name: 'Bunny Meadow', category: 'General',
    blurb: 'Cream bunnies hopping through dark sprigs and coral blooms on lavender.',
    keywords: ['bunnies', 'rabbits', 'lavender', 'cute', 'kids room'] },
  { slug: 'wildflower-field', name: 'Wildflower Field', category: 'Floral',
    blurb: 'Hand-drawn pressed wildflowers and herbs, airy and botanical on white.',
    keywords: ['wildflowers', 'botanical', 'floral', 'white', 'cottagecore'] },
];

const galleryFor = slug => ['room', 'pattern', 'detail']
  .map(kind => ({ kind, src: `assets/Wallpapers/${slug}/${kind}.jpg` }));

async function seedWallpapers(productsRef) {
  const skus = WALLPAPERS.map(w => 'WP-' + w.slug.toUpperCase());
  const existing = new Set((await productsRef.find({ sku: { $in: skus } }, { projection: { sku: 1 } }).toArray()).map(d => d.sku));
  const missing = WALLPAPERS.filter(w => !existing.has('WP-' + w.slug.toUpperCase()));
  if (!missing.length) { console.log('🖼️  Wallpapers up to date'); return 0; }
  const [top] = await productsRef.find().sort({ id: -1 }).limit(1).toArray();
  let nextId = (top ? top.id : 0) + 1;
  const now = new Date();
  const docs = missing.map(w => {
    const id = nextId++;
    return {
      _id: id, id, sku: 'WP-' + w.slug.toUpperCase(), name: `${w.name} Wallpaper`,
      category: w.category, productType: 'Wallpapers',
      price: WALLPAPER_PRICE, originalPrice: WALLPAPER_ORIGINAL_PRICE, pricingSource: 'manual',
      badge: 'Coming Soon',
      description: `${w.blurb} Peel-and-stick, matte, printed to order — choose a 1m × 3m or 1.5m × 3m roll.`,
      stockQuantity: LAUNCH_STOCK, keywords: ['wallpaper', 'peel and stick', 'wall decor', ...w.keywords],
      image: `assets/Wallpapers/${w.slug}/room.jpg`, gallery: galleryFor(w.slug),
      showInBestsellers: false, showInNewArrivals: false, showInGrossing: false,
      createdAt: now
    };
  });
  await productsRef.insertMany(docs);
  console.log(`🖼️  Added ${docs.length} wallpaper${docs.length === 1 ? '' : 's'} (out of stock until restocked)`);
  return docs.length;
}

module.exports = { WALLPAPERS, seedWallpapers, WALLPAPER_PRICE, WALLPAPER_ORIGINAL_PRICE };
