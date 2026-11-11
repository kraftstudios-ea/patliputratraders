const { MongoClient } = require('mongodb');
require('dotenv').config({ path: '.env' });
async function run() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const docs = await client.db().collection('products').find({ name: /Mountain/i }).toArray();
  console.log(docs);
  await client.close();
}
run();
