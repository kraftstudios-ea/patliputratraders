const { MongoClient } = require('mongodb');
require('dotenv').config({ path: '.env' });

async function run() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db();
  const products = await db.collection('products').find({
    name: { $regex: /sainz|leclerc|lecrec|alonso|antonelli|norris|hamilton|verstappen|piastri/i }
  }).toArray();
  console.log(JSON.stringify(products, null, 2));
  await client.close();
}
run();
