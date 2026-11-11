require('dotenv').config();
const { MongoClient } = require('mongodb');
const fs = require('fs');
const { PRODUCT_TYPES, normalizeProductType } = require('../productTypes');
const path = require('path');

if (!process.env.MONGODB_URI) {
  console.error('MONGODB_URI not set in .env');
  process.exit(1);
}

const CATEGORY = 'Pop Culture';
const dirPath = path.join(__dirname, '../public/assets/Pop Culture');

// Filenames where the mechanical cleanup below wouldn't produce a clean title.
const nameOverrides = {
  'Dont_Stop_Smoking_A3_p01.webp': "Don't Stop Smoking",
};

function cleanName(file) {
  if (nameOverrides[file]) return nameOverrides[file];
  let name = file.replace(/\.webp$/i, '');
  name = name.replace(/_p\d+$/i, '').replace(/_A3$/i, '').replace(/_Poster$/i, '');
  name = name.replace(/[_-]+/g, ' ').trim();
  return name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

async function run() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db();
  const productsRef = db.collection('products');

  const files = fs.readdirSync(dirPath).filter(f => f.toLowerCase().endsWith('.webp'));

  const [top] = await productsRef.find().sort({ id: -1 }).limit(1).toArray();
  let nextId = (top ? top.id : 0) + 1;

  const existing = await productsRef.find({ category: CATEGORY }).project({ image: 1 }).toArray();
  const existingImages = new Set(existing.map(d => d.image));

  let added = 0;
  for (const file of files) {
    const imagePath = `assets/Pop Culture/${file}`;
    if (existingImages.has(imagePath)) {
      console.log(`Skipping ${file} — already imported.`);
      continue;
    }

    const name = cleanName(file);
    const id = nextId++;
    const doc = {
      _id: id,
      id: id,
      name,
      category: CATEGORY,
      productType: 'poster',
      price: PRODUCT_TYPES['poster'].basePrice,
      originalPrice: PRODUCT_TYPES['poster'].basePrice * 3,
      pricingSource: 'qikink',
      badge: 'New',
      description: 'Premium quality poster printed on 300 GSM matte paper. Enhances the aesthetics of your space instantly.',
      stockQuantity: 50,
      keywords: `pop culture ${name.toLowerCase()}`,
      sku: id.toString(),
      image: imagePath,
      showInBestsellers: false,
      showInNewArrivals: false,
      showInGrossing: false,
      createdAt: new Date()
    };

    await productsRef.insertOne(doc);
    console.log(`Added [${id}] ${name}`);
    added++;
  }

  console.log(`Done. Added ${added} of ${files.length} Pop Culture posters.`);
  await client.close();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
