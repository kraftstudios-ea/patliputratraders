require('dotenv').config();
const { MongoClient } = require('mongodb');

async function run() {
  const mongoClient = new MongoClient(process.env.MONGODB_URI);
  await mongoClient.connect();
  const db = mongoClient.db();
  const productsRef = db.collection('products');

  // 1. Rename existing "Apparel" category T-shirts to "T-Shirts"
  const updateRes = await productsRef.updateMany(
    { category: 'Apparel' },
    { $set: { category: 'T-Shirts' } }
  );
  console.log(`Updated ${updateRes.modifiedCount} existing T-Shirts to category 'T-Shirts'`);

  // 2. Insert Hoodies
  const top = await productsRef.find().sort({ id: -1 }).limit(1).toArray();
  let nextId = (top[0] ? top[0].id : 0) + 1;

  // The hoodie names based on LS
  const hoodies = [
    {
      name: 'Hangover',
      filePrefix: 'hangover',
      assetsPrefix: 'hangover-hoodie',
      hasSleeve: true
    },
    {
      name: 'Moon Thief',
      filePrefix: 'moon thief',
      assetsPrefix: 'moon-thief',
      hasSleeve: true,
      backCase: 'Back' // moon-thief Back.png
    },
    {
      name: 'Not Serious',
      filePrefix: 'not serious',
      assetsPrefix: 'not-serious ',
      hasSleeve: false
    },
    {
      name: 'Top Less',
      filePrefix: 'topless',
      assetsPrefix: 'top-less',
      hasSleeve: true
    },
    {
      name: 'Vivre La Vie',
      filePrefix: 'vivre la vie',
      assetsPrefix: 'vivre-la-vie',
      hasSleeve: true
    },
    {
      name: 'Young Again',
      filePrefix: 'young again',
      assetsPrefix: 'young-again',
      hasSleeve: true
    }
  ];

  let added = 0;
  for (const h of hoodies) {
    const id = nextId++;
    const sku = `APP-${id}`;

    // Images array
    const images = [
      `assets/Hoodies/${h.filePrefix} back.png`,
      `assets/Hoodies/${h.filePrefix} front.png`,
      `assets/Hoodies/${h.assetsPrefix.trim()} ${h.backCase || 'back'}.png`.replace('not-serious  back', 'not-serious  back'),
      `assets/Hoodies/${h.assetsPrefix.trim()} front.png`,
    ];
    if (h.hasSleeve) {
      if (h.name === 'Moon Thief') images.push(`assets/Hoodies/moon-thief right sleeve.png`);
      else if (h.name === 'Top Less') images.push(`assets/Hoodies/top-less Sleeve.png`);
      else images.push(`assets/Hoodies/${h.assetsPrefix.trim()} sleeve.png`);
    }
    images.push(`assets/Tshirt designs/1788842546SizeChart1.png`); // same as tshirts

    const product = {
      _id: id,
      id,
      name: `${h.name} Hoodie`,
      category: 'Hoodies', // Segmented!
      productType: 'hoodie',
      price: 1199,
      originalPrice: 1799,
      pricingSource: 'static',
      badge: 'New',
      description: `Premium quality ${h.name} hoodie. Comfortable and stylish for your everyday wear.`,
      stockQuantity: 50,
      keywords: `apparel hoodie ${h.name.toLowerCase()}`,
      sku,
      image: `assets/Hoodies/${h.filePrefix} front.png`, // front for main img
      backImage: `assets/Hoodies/${h.filePrefix} back.png`, // back for hover
      images: images,
      showInBestsellers: false,
      showInNewArrivals: true,
      showInGrossing: false,
      createdAt: new Date(),
    };

    await productsRef.insertOne(product);
    added++;
    console.log(`Added [${id}] ${product.name}`);
  }

  console.log(`Done. Added ${added} hoodies.`);
  await mongoClient.close();
}

run().catch(console.error);