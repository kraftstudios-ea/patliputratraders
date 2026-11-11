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
      name: "Messi Stats", 
      image: "assets/Sports/Messi_Stats.webp",
      gallery: [
        { src: "assets/Sports/Messi_Stats.webp", label: "Print" },
        { src: "assets/Sports/Messi_Stats_Mockup.webp", label: "Mockup" }
      ]
    },
    { 
      name: "Messi General", 
      image: "assets/Sports/Messi_General.webp",
      gallery: [
        { src: "assets/Sports/Messi_General.webp", label: "Print" },
        { src: "assets/Sports/Messi_General_Mockup.webp", label: "Mockup" }
      ]
    },
    { name: "Messi Barca", image: "assets/Sports/Messi_Barca.webp" },
    { name: "Messi PSG", image: "assets/Sports/Messi_Psg.webp" },
    { name: "Messi Argentina", image: "assets/Sports/Messi_Argentina.webp" },
    { name: "Messi Miami", image: "assets/Sports/Messi_Miami.webp" }
  ];

  for (let p of products) {
    let existing = await db.collection('products').findOne({ 
      name: p.name, 
      category: 'Sports' 
    });

    if (existing) {
      await db.collection('products').updateOne(
        { _id: existing._id },
        { $set: { image: p.image, gallery: p.gallery || null } }
      );
      console.log(`Updated existing Sports poster: ${p.name}`);
    } else {
      const id = await getNextProductId();
      const newDoc = {
        _id: id,
        id: id,
        name: p.name,
        category: "Sports",
        productType: "poster",
        price: 22,
        originalPrice: 66,
        badge: "New",
        description: `Premium quality ${p.name} poster printed on 300 GSM matte paper.`,
        stockQuantity: 50,
        keywords: `sports, football, messi, ${p.name.toLowerCase()}, poster, wall art`,
        sku: id.toString(),
        image: p.image,
        showInNewArrivals: true,
        createdAt: new Date(),
        pricingSource: "qikink"
      };
      if (p.gallery) newDoc.gallery = p.gallery;
      
      await db.collection('products').insertOne(newDoc);
      console.log(`Inserted new Sports poster: ${p.name} with ID ${id}`);
    }
  }

  await client.close();
}
run();
