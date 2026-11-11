const { MongoClient } = require('mongodb');
require('dotenv').config({ path: '.env' }); // Wait, running from Backend directory, so '.env'

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

  const newPosters = [
    { name: "Carlos Sainz", image: "assets/F1/Carlos_Sainz.webp" },
    { name: "Lando Norris", image: "assets/F1/Lando_Norris.webp" },
    { name: "Oscar Piastri", image: "assets/F1/Oscar_Piastri.webp" },
    { name: "Charles Lecrec", image: "assets/F1/Charles_Lecrec.webp" },
    { name: "Fernando Alonso", image: "assets/F1/Fernando_Alonso.webp" },
    { name: "Kimi Antonelli", image: "assets/F1/Kimi_Antonelli.webp" },
    { name: "Lewis Hamilton", image: "assets/F1/Lewis_Hamilton.webp" },
    { name: "Max Verstappen", image: "assets/F1/Max_Verstappen.webp" }
  ];

  for (let p of newPosters) {
    // Check if exists in F1 category
    let existing = await db.collection('products').findOne({ 
      name: { $regex: new RegExp(`^${p.name}$`, 'i') }, 
      category: 'F1' 
    });

    if (existing) {
      // Update image
      await db.collection('products').updateOne(
        { _id: existing._id },
        { $set: { image: p.image } }
      );
      console.log(`Updated existing F1 poster: ${p.name}`);
    } else {
      // Insert new
      const id = await getNextProductId();
      const newDoc = {
        _id: id,
        id: id,
        name: p.name,
        category: "F1",
        productType: "poster",
        price: 22,
        originalPrice: 66,
        badge: "New",
        description: `Premium quality ${p.name} F1 poster printed on 300 GSM matte paper.`,
        stockQuantity: 50,
        keywords: `f1, ${p.name.toLowerCase()}, poster, wall art`,
        sku: id.toString(),
        image: p.image,
        showInNewArrivals: true,
        createdAt: new Date(),
        pricingSource: "qikink"
      };
      await db.collection('products').insertOne(newDoc);
      console.log(`Inserted new F1 poster: ${p.name} with ID ${id}`);
    }
  }

  await client.close();
}
run();
