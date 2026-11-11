const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { MongoClient } = require('mongodb');
const fs = require('fs');

async function seed() {
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI is required.');
    process.exit(1);
  }

  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db();
  const productsRef = db.collection('products');

  const productsJsonPath = path.resolve(__dirname, '../../public/data/products.json');
  const products = JSON.parse(fs.readFileSync(productsJsonPath, 'utf8'));

  console.log(`Connecting to database '${db.databaseName}'...`);
  console.log(`Seeding ${products.length} lighting products...`);

  const count = await productsRef.countDocuments();
  console.log(`Existing products in DB: ${count}`);

  // Clear existing if any in this DB
  if (count > 0) {
    await productsRef.deleteMany({});
    console.log('Cleared old records in products collection.');
  }

  // Insert all products
  const result = await productsRef.insertMany(products);
  console.log(`✅ Successfully seeded ${result.insertedCount} products into MongoDB collection 'products'.`);

  // Create indexes for fast searching and admin queries
  await productsRef.createIndex({ id: 1 }, { unique: true });
  await productsRef.createIndex({ sku: 1 });
  await productsRef.createIndex({ category: 1 });
  await productsRef.createIndex({ name: 'text', description: 'text', keywords: 'text' });
  console.log('✅ Created indexes on id, sku, category, text search.');

  await client.close();
  process.exit(0);
}

seed().catch(err => {
  console.error('Seeding error:', err);
  process.exit(1);
});
