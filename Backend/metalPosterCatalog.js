// Metal poster catalogue is derived from selected poster categories in the main
// catalogue. Each product keeps its source artwork as the clean gallery view
// and uses a generated satin-aluminium render as its primary product image.
const path = require('path');
const sourceProducts = require(path.join(__dirname, '../public/data/products.json'));

const METAL_PRICE = 579;                // 8 x 11.7 in base
const METAL_ORIGINAL_PRICE = 799;
const LAUNCH_STOCK = 0;
const FIRST_METAL_ID = 772;
const LEGACY_PLACEHOLDER_SKUS = [
  'MTL-DEMON-SLAYER', 'MTL-GANYU', 'MTL-GOKU', 'MTL-JINX',
  'MTL-NEZUKO', 'MTL-PULP-FICTION', 'MTL-ZORO'
];

const metalSourceCategories = new Set(['Anime', 'Gaming']);
const metalSourcePosters = sourceProducts.filter(p =>
  p.productType === 'Posters' && metalSourceCategories.has(p.category)
);
const animeSourceCount = metalSourcePosters.filter(p => p.category === 'Anime').length;
const animeIndexById = new Map(metalSourcePosters.filter(p => p.category === 'Anime').map((p, index) => [String(p.id), index]));
const gamingIndexById = new Map(metalSourcePosters.filter(p => p.category === 'Gaming').map((p, index) => [String(p.id), index]));

const METAL_POSTERS = metalSourcePosters.map(p => {
  const categorySlug = p.category.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const slug = `${categorySlug}-${String(p.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
  const sku = `MTL-${categorySlug.toUpperCase()}-${p.id}`;
  const image = `assets/MetalPosters/${slug}/showcase.jpg`;
  return {
    id: FIRST_METAL_ID + (p.category === 'Anime' ? animeIndexById.get(String(p.id)) : animeSourceCount + gamingIndexById.get(String(p.id))),
    sku,
    slug,
    name: `${p.name} Metal Poster`,
    category: p.category,
    designImage: p.image,
    image,
    blurb: `${p.name} printed directly onto a rigid aluminium panel with a fine satin finish, rounded corners and a flush magnetic mount.`,
    keywords: ['metal poster', 'metal print', 'aluminium', 'wall art', 'wall decor', ...(p.category === 'Anime' ? ['anime', 'manga'] : ['gaming', 'gamer', 'video game']), ...(Array.isArray(p.keywords) ? p.keywords : String(p.keywords || '').split(',').map(s => s.trim()).filter(Boolean))]
  };
});

const galleryFor = m => [
  { kind: 'showcase', label: 'Showcase', src: `assets/MetalPosters/${m.slug}/showcase.jpg` },
  { kind: 'lifestyle', label: 'In Room', src: `assets/MetalPosters/${m.slug}/lifestyle.jpg` },
  { kind: 'finish', label: 'Finish & Edge', src: `assets/MetalPosters/${m.slug}/finish.jpg` },
  { kind: 'isolated', label: 'Isolated Print', src: `assets/MetalPosters/${m.slug}/isolated.jpg` },
  { kind: 'mounting', label: 'Magnetic Mount', src: 'assets/MetalPosters/mounting-guide.jpg' }
];

async function seedMetalPosters(productsRef) {
  // Remove only the seven known seeded sample records from the old placeholder
  // catalogue. These SKUs were created by this catalogue and are not admin
  // products.
  await productsRef.deleteMany({ sku: { $in: LEGACY_PLACEHOLDER_SKUS } });

  const skus = METAL_POSTERS.map(m => m.sku);
  const existing = new Set((await productsRef.find({ sku: { $in: skus } }, { projection: { sku: 1 } }).toArray()).map(d => d.sku));
  const missing = METAL_POSTERS.filter(m => !existing.has(m.sku));
  if (!missing.length) { console.log('🪧 Metal posters up to date'); return 0; }
  const now = new Date();
  const docs = missing.map(m => ({
    _id: m.id,
    id: m.id,
    sku: m.sku,
    name: m.name,
    category: m.category,
    productType: 'Metal Posters',
    price: METAL_PRICE,
    originalPrice: METAL_ORIGINAL_PRICE,
    pricingSource: 'manual',
    badge: 'Metal Print',
    description: `${m.blurb} Available in 8 × 11.7 in and 11.7 × 15.7 in.`,
    stockQuantity: LAUNCH_STOCK,
    keywords: [...new Set(m.keywords)],
    image: m.image,
    designImage: m.designImage,
    gallery: galleryFor(m),
    showInBestsellers: false,
    showInNewArrivals: false,
    showInGrossing: false,
    createdAt: now
  }));
  await productsRef.insertMany(docs);
  console.log(`🪧 Added ${docs.length} metal poster${docs.length === 1 ? '' : 's'}`);
  return docs.length;
}

module.exports = { METAL_POSTERS, seedMetalPosters, METAL_PRICE, METAL_ORIGINAL_PRICE };
