const { MongoClient } = require('mongodb');
require('dotenv').config({ path: '.env' });

async function run() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db();
  
  const maxDoc = await db.collection('products').find().sort({id: -1}).limit(1).toArray();
  let nextId = maxDoc.length > 0 ? maxDoc[0].id + 1 : 1;
  await db.collection('counters').updateOne({ _id: 'productId' }, { $set: { sequence_value: nextId + 2 } });

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
    p._id = nextId;
    p.id = nextId;
    nextId++;
    await db.collection('products').insertOne(p);
    console.log("Inserted:", p.name, "with ID:", p.id);
  }

  await client.close();
}
run();
