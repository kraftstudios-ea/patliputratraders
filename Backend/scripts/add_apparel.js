require('dotenv').config();
const { MongoClient } = require('mongodb');
const fs = require('fs');
const { PRODUCT_TYPES } = require('../productTypes');
const path = require('path');

if (!process.env.MONGODB_URI) {
  console.error('MONGODB_URI not set in .env');
  process.exit(1);
}

const CATEGORY = 'Apparel';
const dirPath = path.join(__dirname, '../../public/assets/Tshirt designs');

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

async function run() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db();
  const productsRef = db.collection('products');

  const files = fs.readdirSync(dirPath).filter(f => f.toLowerCase().endsWith('.png') || f.toLowerCase().endsWith('.webp'));

  // the 6 brands we know are in the folder
  const brands = ['absolut', 'smirnoff', 'marlboro', 'budweiser', 'chanel', 'jagermeister'];
  const parodyNames = {
    'absolut': 'Absolut Nonsense',
    'smirnoff': 'Smirnope',
    'marlboro': 'Marlbored',
    'budweiser': 'Bedweiser',
    'chanel': 'Cancel',
    'jagermeister': 'Jagermistakes'
  };

  const [top] = await productsRef.find().sort({ id: -1 }).limit(1).toArray();
  let nextId = (top && top.id ? top.id : Math.floor(Date.now() / 1000)) + 1;

  const existing = await productsRef.find({ category: CATEGORY }).project({ name: 1 }).toArray();
  const existingNames = new Set(existing.map(d => d.name.toLowerCase()));

  let added = 0;
  for (const brand of brands) {
    const brandLabel = parodyNames[brand] || capitalize(brand);
    const name = brandLabel + ' T-Shirt';

    if (existingNames.has(name.toLowerCase())) {
      console.log(`Skipping ${name} — already imported.`);
      continue;
    }

    const id = nextId++;
    const doc = {
      _id: id,
      id: id,
      name,
      category: CATEGORY,
      productType: 'apparel',
      price: PRODUCT_TYPES['apparel'].basePrice,
      originalPrice: PRODUCT_TYPES['apparel'].basePrice + 300,
      pricingSource: 'qikink',
      badge: 'New',
      description: `Premium quality ${capitalize(brand)} t-shirt. Comfortable and stylish for your everyday wear.`,
      stockQuantity: 50,
      keywords: `apparel tshirt shirt ${brand}`,
      sku: `APP-${id}`,
      image: `assets/Tshirt designs/${brand}_front.png`,
      backImage: `assets/Tshirt designs/${brand}_back.png`,
      showInBestsellers: false,
      showInNewArrivals: true,
      showInGrossing: false,
      createdAt: new Date()
    };

    await productsRef.insertOne(doc);
    console.log(`Added [${id}] ${name}`);
    added++;
  }

  console.log(`Done. Added ${added} Apparel products.`);
  await client.close();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
