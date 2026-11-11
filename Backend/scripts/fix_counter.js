const { MongoClient } = require('mongodb');
require('dotenv').config({ path: '.env' });

async function run() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db();
  
  const maxProduct = await db.collection('products').find().sort({_id: -1}).limit(1).toArray();
  const maxId = maxProduct[0] ? maxProduct[0]._id : 0;
  
  await db.collection('counters').updateOne(
    { _id: 'productId' },
    { $set: { sequence_value: maxId } },
    { upsert: true }
  );
  
  console.log('Fixed counter to maxId:', maxId);
  await client.close();
}
run();
