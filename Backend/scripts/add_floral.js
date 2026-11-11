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

const floralDir = path.join(__dirname, '../public/assets/Floral');

const renameMap = {
  'ChatGPT Image Jul 30, 2026, 02_19_36 PM.png': 'Tulip.png',
  'ChatGPT Image Jul 30, 2026, 11_53_23 AM.png': 'Rose.png',
  'ChatGPT Image Jul 30, 2026, 12_06_17 PM.png': 'Lily_Anatomy.png',
  'ChatGPT Image Jul 30, 2026, 12_08_48 PM.png': 'Lily_Bouquet_Anatomy.png',
  'ChatGPT Image Jul 30, 2026, 12_11_12 PM.png': 'Dahlia_Floral.png',
  'ChatGPT Image Jul 30, 2026, 12_16_23 PM.png': 'Sunflower.png',
  'ChatGPT Image Jul 30, 2026, 12_22_37 PM.png': 'Lily_Poster.png',
  'ChatGPT Image Jul 30, 2026, 12_23_14 PM.png': 'Decay_Roses_1.png',
  'ChatGPT Image Jul 30, 2026, 12_32_01 PM.png': 'Daisy_Anatomy.png',
  'ChatGPT Image Jul 30, 2026, 12_32_27 PM.png': 'Decay_Roses_2.png',
  'ChatGPT Image Jul 30, 2026, 12_32_35 PM.png': 'Daisy.png',
  'ChatGPT Image Jul 30, 2026, 12_34_03 PM.png': 'Hydrangea.png'
};

async function run() {
  try {
    for (const [oldName, newName] of Object.entries(renameMap)) {
      const oldPath = path.join(floralDir, oldName);
      const newPath = path.join(floralDir, newName);
      
      if (fs.existsSync(oldPath)) {
        fs.renameSync(oldPath, newPath);
        console.log(`Renamed ${oldName} to ${newName}`);
      }
      
      if (fs.existsSync(newPath)) {
        // Add or update to Firestore
        // Generate a simple sku or id
        const sku = newName.replace('.png', '').toLowerCase();
        
        const docRef = db.collection('products').doc(sku);
        const nameDisplay = newName.replace('.png', '').replace(/_/g, ' ');
        
        await docRef.set({
          sku: sku,
          name: nameDisplay,
          category: 'Floral',
          productType: 'poster',
      price: PRODUCT_TYPES['poster'].basePrice,
      originalPrice: PRODUCT_TYPES['poster'].basePrice * 3,
      pricingSource: 'qikink',
          badge: 'New',
          stock: 50,
          image: `assets/Floral/${newName}`,
          keywords: ['floral', 'flower', nameDisplay.toLowerCase()],
          description: `Beautiful ${nameDisplay} poster for your wall.`,
          showInBestsellers: false,
          showInNewArrivals: true,
          showInGrossing: false,
          createdAt: new Date().toISOString()
        }, { merge: true });
        console.log(`Added ${newName} to Firestore.`);
      }
    }
    
    // Check for petal os posters and update their category to Floral if needed
    const petalPosters = [
      'Chrysanthemum_003_Petal_OS',
      'Dahlia_001_Petal_OS',
      'Dahlia_004_Petal_OS',
      'Gerbera_002_Petal_OS',
      'Gerbera_006_Petal_OS',
      'Petunia_005_Petal_OS'
    ];
    
    const snapshot = await db.collection('products').get();
    for (const doc of snapshot.docs) {
      const data = doc.data();
      const isPetalOS = data.name && data.name.includes('Petal_OS');
      if (isPetalOS && data.category !== 'Floral') {
        console.log(`Updating ${data.name} to Floral category...`);
        await doc.ref.update({ category: 'Floral' });
      }
    }

    console.log("Done!");
    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

run();
