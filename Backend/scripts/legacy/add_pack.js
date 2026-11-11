const { MongoClient } = require('mongodb');
require('dotenv').config({ path: '.env' });

async function run() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db();
  
  const maxDoc = await db.collection('products').find().sort({id: -1}).limit(1).toArray();
  let nextId = maxDoc.length > 0 ? maxDoc[0].id + 1 : 1;
  await db.collection('counters').updateOne({ _id: 'productId' }, { $set: { sequence_value: nextId + 1 } });

  const p = {
    _id: nextId,
    id: nextId,
    name: "Boho Style Scenery - 3 Poster Pack",
    category: "Wall Setup Packs",
    productType: "poster_3_pack",
    badge: "New",
    description: "A curated 3-split scenery pack to transform your space. Features three beautifully matched minimalist boho designs.",
    stockQuantity: 20,
    keywords: "boho, scenery, 3 split, wall setup, pack, poster",
    sku: "BOHO-SCENERY-3",
    image: "posters/Boho_Style_Scenery_3_Split_Mockup.png",
    images: [
      "posters/Boho_Style_Scenery_3_Split_Mockup.png",
      "posters/Left_Medium.png",
      "posters/Centre_Medium.png",
      "posters/Right_Medium.png"
    ],
    showInBestsellers: false,
    showInNewArrivals: true,
    showInGrossing: false,
    createdAt: new Date(),
    orderFrequency: 0,
    pricingSource: "qikink",
    price: 66 // This will be calculated from productTypes
  };

  await db.collection('products').insertOne(p);
  console.log("Inserted:", p.name, "with ID:", p.id);

  await client.close();
}
run();
