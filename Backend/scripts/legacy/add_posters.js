const { MongoClient } = require('mongodb');
require('dotenv').config({ path: '.env' });

async function run() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db();
  
  async function getNextProductId() {
    const result = await db.collection('counters').findOneAndUpdate(
      { _id: 'productId' },
      { $inc: { sequence_value: 1 } },
      { returnDocument: 'after', upsert: true }
    );
    return result.sequence_value || result.value.sequence_value;
  }

  const products = [
    {
      name: "Wanted Monkey D. Luffy",
      category: "Anime",
      productType: "poster",
      badge: "New",
      description: "Official wanted poster of Monkey D. Luffy.",
      stockQuantity: 50,
      keywords: "anime, one piece, luffy, wanted, poster",
      sku: "WANTED-LUFFY",
      image: "posters/Wanted_Monkey_D_Luffy.png",
      showInBestsellers: false,
      showInNewArrivals: true,
      showInGrossing: false,
      createdAt: new Date(),
      orderFrequency: 0,
      pricingSource: "qikink",
      price: 38
    },
    {
      name: "Wanted Roronoa Zoro",
      category: "Anime",
      productType: "poster",
      badge: "New",
      description: "Official wanted poster of Roronoa Zoro.",
      stockQuantity: 50,
      keywords: "anime, one piece, zoro, wanted, poster",
      sku: "WANTED-ZORO",
      image: "posters/Wanted_Roronoa_Zoro.png",
      showInBestsellers: false,
      showInNewArrivals: true,
      showInGrossing: false,
      createdAt: new Date(),
      orderFrequency: 0,
      pricingSource: "qikink",
      price: 38
    }
  ];

  for (let p of products) {
    p._id = await getNextProductId();
    p.id = p._id;
    await db.collection('products').insertOne(p);
    console.log("Inserted:", p.name, "with ID:", p.id);
  }

  await client.close();
}
run();
