// Manual run of what server.js does on start: add the sticker sheets and
// wallpapers, then remove the sticker/wallpaper placeholder products.
//   node scripts/add_sticker_sheets.js
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { MongoClient } = require('mongodb');
const { seedStickerSheets } = require('../stickerCatalog');
const { seedWallpapers } = require('../wallpaperCatalog');
const { removePlaceholders } = require('../placeholders');
(async () => {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const products = client.db().collection('products');
  await seedStickerSheets(products);
  await seedWallpapers(products);
  await removePlaceholders(products);
  await client.close();
})().catch(err => { console.error(err); process.exit(1); });
