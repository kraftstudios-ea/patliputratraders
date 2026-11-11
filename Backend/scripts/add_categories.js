const fs = require('fs');
const { PRODUCT_TYPES, normalizeProductType } = require('../productTypes');
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
const serviceAccount = require(serviceAccountPath);

initializeApp({
  credential: cert(serviceAccount)
});
const db = getFirestore();

async function addCategory(categoryName, folderName) {
  const dirPath = path.join(__dirname, `../public/assets/${folderName}`);
  if (!fs.existsSync(dirPath)) {
    console.log(`Directory not found: ${dirPath}`);
    return;
  }
  
  const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.png') || f.endsWith('.jpg'));
  
  for (const file of files) {
    const sku = file.replace(/\.[^/.]+$/, "").toLowerCase().replace(/ /g, '_');
    const docRef = db.collection('products').doc(sku);
    const nameDisplay = file.replace(/\.[^/.]+$/, "").replace(/_/g, ' ');
    
    await docRef.set({
      sku: sku,
      name: nameDisplay,
      category: categoryName,
      productType: 'poster',
      price: PRODUCT_TYPES['poster'].basePrice,
      originalPrice: PRODUCT_TYPES['poster'].basePrice * 3,
      pricingSource: 'qikink',
      badge: 'New',
      stock: 50,
      image: `assets/${folderName}/${file}`,
      keywords: [categoryName.toLowerCase(), nameDisplay.toLowerCase()],
      description: `Beautiful ${nameDisplay} poster for your wall.`,
      showInBestsellers: false,
      showInNewArrivals: true,
      showInGrossing: false,
      createdAt: new Date().toISOString()
    }, { merge: true });
    
    console.log(`Added ${file} to Firestore under category ${categoryName}.`);
  }
}

async function run() {
  try {
    await addCategory('Travel', 'Travel');
    await addCategory('Mythological', 'Mythological');
    
    console.log("Done adding all products!");
    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

run();
