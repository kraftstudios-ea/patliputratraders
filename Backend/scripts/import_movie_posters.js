const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');
const { PRODUCT_TYPES, normalizeProductType } = require('../productTypes');
const path = require('path');

const serviceAccount = require('./serviceAccountKey.json'); // Check if this is the correct key file name

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();
const productsRef = db.collection('products');

async function importPosters() {
  try {
    const dirPath = path.join(__dirname, '../public/posters/Original Movie Posters');
    const files = fs.readdirSync(dirPath);
    
    // Get max ID
    const snapshot = await productsRef.get();
    let maxId = 0;
    snapshot.forEach(doc => {
      const docId = parseInt(doc.id, 10);
      if (!isNaN(docId) && docId > maxId) maxId = docId;
    });

    let currentId = maxId + 1;

    for (const file of files) {
      if (file.startsWith('.')) continue; // skip hidden files

      // Format name: "avatar_fire_and_ash_xlg.jpg" -> "Avatar Fire And Ash"
      let name = file.replace(/_xlg\.jpg$/i, '').replace(/_ver\d+/i, '').replace(/\.jpg$/i, '').replace(/_/g, ' ');
      name = name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

      const product = {
        name: name,
        productType: 'poster',
        price: PRODUCT_TYPES['poster'].basePrice,
        originalPrice: PRODUCT_TYPES['poster'].basePrice * 3,
        pricingSource: 'qikink',
        category: "Original Movie Posters",
        image: `posters/Original Movie Posters/${file}`,
        badge: "New",
        createdAt: new Date().toISOString()
      };

      await productsRef.doc(currentId.toString()).set(product);
      console.log(`Added: ${name} with ID: ${currentId}`);
      currentId++;
    }
    
    console.log('Import complete.');
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

importPosters();
