// Brush wall-tapestry catalogue — soft-touch printed wall hangings,
// fulfilled to order. Images live in public/assets/Tapestry/<slug>/
// (room.jpg mockup, flat.jpg of the piece, detail.jpg close-up) with WebP
// thumbnails from tools/make-thumbs.py. seedTapestries() runs on every
// server start and only inserts tapestries missing from the database
// (keyed by SKU), so admin edits to price, stock or copy are never
// overwritten.
//
// Launch state: PLACEHOLDER ARTWORK. Every tapestry is added OUT OF STOCK
// (stockQuantity 0) so the collection is browsable while the real designs
// are being drawn. Swap the images in assets/Tapestry/<slug>/, rerun
// tools/make-thumbs.py, then restock from the admin panel.
//
// Price is the 30 x 40 in shelf price; every other size is a priceDelta in
// Backend/productTypes.js, which is the only authority on what is charged.
const TAPESTRY_PRICE = 359;             // 30 x 40 in — see productTypes.js
const TAPESTRY_ORIGINAL_PRICE = 479;
const LAUNCH_STOCK = 0; // Marked out of stock as requested

const TAPESTRIES = [
  {
    slug: 'art-nouveau-moonlit-sky',
    name: 'Art Nouveau Moonlit Sky',
    category: 'Minimalist',
    blurb: 'Luminescent art-nouveau crescent moon over a twilight horizon, rendered in dreamy pastel and gold accents.',
    keywords: ['art nouveau', 'moon', 'sky', 'twilight', 'celestial', 'living room', 'boho']
  },
  {
    slug: 'art-nouveau-woodland-pond',
    name: 'Art Nouveau Woodland Pond',
    category: 'Floral',
    blurb: 'Serene forest pond with reflective waters and lush botanical canopies in decorative organic symmetry.',
    keywords: ['forest', 'pond', 'nature', 'woodland', 'botanical', 'art nouveau', 'green']
  },
  {
    slug: 'celestial-harmony',
    name: 'Mystic Cosmic Harmony',
    category: 'Mythological',
    blurb: 'Deep cosmic mandala weaving ancient celestial bodies, moon phases and esoteric geometry.',
    keywords: ['cosmic', 'celestial', 'harmony', 'space', 'astrology', 'indigo', 'mystic']
  },
  {
    slug: 'fantasy-dragon',
    name: 'Fantasy Dragon & Treasure',
    category: 'Mythological',
    blurb: 'Epic legendary dragon coiled amidst ancient gold and cavernous crystalline shadows.',
    keywords: ['dragon', 'fantasy', 'mythological', 'treasure', 'gold', 'adventure']
  },
  {
    slug: 'japanese-cozy-living',
    name: 'Japanese Sunset Wave & Crane',
    category: 'Travel',
    blurb: 'Traditional ukiyo-e inspired crane soaring across radiant red sunbursts and rhythmic ocean swells.',
    keywords: ['japanese', 'crane', 'waves', 'sun', 'traditional', 'zen', 'living room']
  },
  {
    slug: 'japanese-inspired',
    name: 'Japanese Blossom & Sacred Mountain',
    category: 'Travel',
    blurb: 'Delicate cherry blossoms framing Mount Fuji under a tranquil blush morning sky.',
    keywords: ['japan', 'fuji', 'sakura', 'cherry blossom', 'asian art', 'travel', 'minimal']
  }
];

const galleryFor = slug => [
  { kind: 'room', src: `assets/Tapestry/${slug}/room.jpg` },
  { kind: 'flat', src: `assets/Tapestry/${slug}/flat.jpg` }
];

async function seedTapestries(productsRef) {
  const skus = TAPESTRIES.map(t => 'TAP-' + t.slug.toUpperCase());
  const existing = new Set((await productsRef.find({ sku: { $in: skus } }, { projection: { sku: 1 } }).toArray()).map(d => d.sku));
  const missing = TAPESTRIES.filter(t => !existing.has('TAP-' + t.slug.toUpperCase()));
  if (!missing.length) { console.log('🧵 Tapestries up to date'); return 0; }
  const [top] = await productsRef.find().sort({ id: -1 }).limit(1).toArray();
  let nextId = (top ? top.id : 0) + 1;
  const now = new Date();
  const docs = missing.map(t => {
    const id = nextId++;
    return {
      _id: id, id, sku: 'TAP-' + t.slug.toUpperCase(), name: `${t.name} Tapestry`,
      category: t.category, productType: 'Tapestry',
      price: TAPESTRY_PRICE, originalPrice: TAPESTRY_ORIGINAL_PRICE, pricingSource: 'manual',
      badge: 'Out of Stock',
      description: `${t.blurb} Soft-touch printed wall tapestry, hemmed all round with metal grommets in each corner and four adhesive screws in the box — up in minutes, no drill. Seven sizes from 24 × 24 in to 54 × 84 in.`,
      stockQuantity: LAUNCH_STOCK,
      keywords: ['tapestry', 'wall hanging', 'wall decor', 'wall art', ...t.keywords],
      image: `assets/Tapestry/${t.slug}/room.jpg`, gallery: galleryFor(t.slug),
      showInBestsellers: false, showInNewArrivals: true, showInGrossing: false,
      createdAt: now
    };
  });
  await productsRef.insertMany(docs);
  console.log(`🧵 Added ${docs.length} tapestr${docs.length === 1 ? 'y' : 'ies'}`);
  return docs.length;
}

module.exports = { TAPESTRIES, seedTapestries, TAPESTRY_PRICE, TAPESTRY_ORIGINAL_PRICE };
