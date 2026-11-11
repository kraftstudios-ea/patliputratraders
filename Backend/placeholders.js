// Deletes the placeholder ("dummy") catalogue items for the collections that
// now have real products: stickers and wallpapers. A product is only removed
// when it is one of those types, isn't one of the real SKUs, AND looks like a
// placeholder (keyword "dummy", an Unsplash stock photo, or no image) — so
// posters, apparel and anything uploaded through the admin panel are safe.
const { STICKER_SHEETS } = require('./stickerCatalog');
const { WALLPAPERS } = require('./wallpaperCatalog');
const { COLLECTIBLES } = require('./collectiblesCatalog');

const REAL_SKUS = [
  ...STICKER_SHEETS.map(s => s.sku),
  ...WALLPAPERS.map(w => 'WP-' + w.slug.toUpperCase()),
  ...COLLECTIBLES.map(c => 'COL-' + c.slug.toUpperCase())
];

async function removePlaceholders(productsRef) {
  const filter = {
    productType: { $regex: /^(stickers?|wallpapers?|collectibles?)$/i },
    sku: { $nin: REAL_SKUS },
    $or: [
      { keywords: 'dummy' },
      { keywords: { $regex: /(^|,)\s*dummy\s*(,|$)/i } },
      { image: { $regex: /images\.unsplash\.com/ } },
      { image: { $in: ['', null] } },
      { image: { $exists: false } }
    ]
  };
  const gone = await productsRef.find(filter, { projection: { id: 1, name: 1, productType: 1 } }).toArray();
  if (!gone.length) return 0;
  await productsRef.deleteMany({ _id: { $in: gone.map(d => d._id) } });
  console.log(`🧹 Removed ${gone.length} placeholder product${gone.length === 1 ? '' : 's'}: ${gone.map(d => '#' + d.id + ' ' + d.name + ' (' + d.productType + ')').join(', ')}`);
  return gone.length;
}

module.exports = { removePlaceholders };
