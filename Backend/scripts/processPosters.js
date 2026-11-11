const fs = require('fs');
const { PRODUCT_TYPES, normalizeProductType } = require('../productTypes');
const path = require('path');
const { execSync } = require('child_process');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
if (!fs.existsSync(serviceAccountPath)) {
  console.error("❌ ERROR: 'serviceAccountKey.json' is missing.");
  process.exit(1);
}
const serviceAccount = require(serviceAccountPath);

initializeApp({
  credential: cert(serviceAccount)
});
const db = getFirestore();

const assetsDir = path.join(__dirname, '../assets');
const outputDir = path.join(__dirname, '../public/posters');

async function processPosters() {
  console.log('Reading PDFs from assets folder...');
  const files = fs.readdirSync(assetsDir);
  const pdfs = files.filter(f => f.toLowerCase().endsWith('.pdf'));

  console.log(`Found ${pdfs.length} PDF files. Converting to thumbnails and preparing products...`);
  
  const products = [];
  let idCounter = 1;

  for (const pdf of pdfs) {
    const nameWithoutExt = path.parse(pdf).name;
    // Generate a safe file name for the JPG
    const jpgFileName = nameWithoutExt.replace(/[^a-z0-9]/gi, '_') + '.jpg';
    const inputPath = path.join(assetsDir, pdf);
    const outputPath = path.join(outputDir, jpgFileName);

    try {
      if (!fs.existsSync(outputPath)) {
        console.log(`Converting ${pdf} -> ${jpgFileName}...`);
        // Use sips to convert the first page of the PDF to JPEG
        execSync(`sips -s format jpeg "${inputPath}" --out "${outputPath}"`, { stdio: 'ignore' });
      } else {
        console.log(`Thumbnail ${jpgFileName} already exists. Skipping conversion.`);
      }
      
      products.push({
        id: idCounter++,
        name: nameWithoutExt,
        productType: 'poster',
      price: PRODUCT_TYPES['poster'].basePrice,
      originalPrice: PRODUCT_TYPES['poster'].basePrice * 3,
      pricingSource: 'qikink',
        image: `posters/${jpgFileName}`,
        category: 'Posters',
        badge: 'New',
        description: `Premium high-quality poster for ${nameWithoutExt}`
      });
    } catch (e) {
      console.error(`Failed to convert ${pdf}: ${e.message}`);
    }
  }

  console.log('Clearing old products from database...');
  const productsRef = db.collection('products');
  const snapshot = await productsRef.get();
  
  const deleteBatch = db.batch();
  snapshot.docs.forEach((doc) => {
    deleteBatch.delete(doc.ref);
  });
  await deleteBatch.commit();
  console.log('Old products deleted.');

  console.log('Adding new products to database...');
  let currentBatch = db.batch();
  let count = 0;
  
  for (const p of products) {
    const docRef = productsRef.doc(p.id.toString());
    currentBatch.set(docRef, p);
    count++;
    
    // Firestore batches have a limit of 500, but we have ~56 so it's fine.
    if (count % 400 === 0) {
      await currentBatch.commit();
      currentBatch = db.batch();
    }
  }
  
  if (count % 400 !== 0) {
    await currentBatch.commit();
  }

  console.log(`✅ Successfully generated thumbnails and seeded ${products.length} new products to Firebase Firestore!`);
  process.exit(0);
}

processPosters().catch(console.error);
