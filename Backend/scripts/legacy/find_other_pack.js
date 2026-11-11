const { MongoClient } = require('mongodb');
require('dotenv').config({ path: '.env' });
async function run() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const docs = await client.db().collection('products').find({ category: 'Wall Setup Packs' }).toArray();
  docs.forEach(d => console.log(d.id, d.name, "Price:", d.price, "Original:", d.originalPrice, "Type:", d.productType));
  await client.close();
}
run();
