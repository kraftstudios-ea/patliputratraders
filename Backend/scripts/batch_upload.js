const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const fs = require('fs');
const { PRODUCT_TYPES, normalizeProductType } = require('../productTypes');
const path = require('path');
const { execSync } = require('child_process');

const serviceAccount = require('./serviceAccountKey.json');

initializeApp({
  credential: cert(serviceAccount),
  storageBucket: 'brush-db-6a308.appspot.com'
});

const db = getFirestore();
const bucket = getStorage().bucket();
const productsRef = db.collection('products');

async function getNextId() {
  const snapshot = await productsRef.get();
  let maxId = 0;
  snapshot.forEach(doc => {
    const docId = parseInt(doc.id, 10);
    if (!isNaN(docId) && docId > maxId) maxId = docId;
  });
  return maxId + 1;
}

async function uploadFile(filePath, destination) {
  const fileUpload = bucket.file(destination);
  await fileUpload.save(fs.readFileSync(filePath), {
    metadata: { contentType: 'image/jpeg' }
  });
  await fileUpload.makePublic();
  return `https://storage.googleapis.com/${bucket.name}/${destination}`;
}

async function processPdfs() {
  const assetsDir = path.join(__dirname, '../assets');
  const files = fs.readdirSync(assetsDir).filter(f => f.toLowerCase().endsWith('.pdf'));
  
  // Get existing products to avoid duplicates
  const existingProducts = new Set();
  const snapshot = await productsRef.get();
  snapshot.forEach(doc => {
    existingProducts.add(doc.data().name.toLowerCase());
  });
  
  let addedCount = 0;
  
  for (const file of files) {
    const pdfPath = path.join(assetsDir, file);
    const baseName = path.basename(file, '.pdf');
    const posterName = baseName.replace(/ A3(\sPortrait)?$/, '').trim(); // Remove "A3" or "A3 Portrait" suffix for a cleaner name
    
    if (existingProducts.has(posterName.toLowerCase())) {
      console.log(`Skipping ${posterName} - already exists.`);
      continue;
    }
    
    console.log(`Processing ${file} as "${posterName}"...`);
    
    // 1. Convert to JPEG
    const tempJpeg = path.join(__dirname, `temp_${Date.now()}.jpeg`);
    try {
      execSync(`sips -s format jpeg "${pdfPath}" --out "${tempJpeg}"`, { stdio: 'ignore' });
    } catch (err) {
      console.error(`Failed to convert ${file}:`, err.message);
      continue;
    }
    
    // 2. Upload to Storage (changed to local uploads dir)
    let imageUrl = '';
    try {
      const ext = '.jpg';
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const filename = `prod-${uniqueSuffix}${ext}`;
      const destPath = path.join(__dirname, '../public/uploads', filename);
      fs.copyFileSync(tempJpeg, destPath);
      imageUrl = `uploads/${filename}`;
    } catch (err) {
      console.error(`Failed to upload ${file}:`, err.message);
      if (fs.existsSync(tempJpeg)) fs.unlinkSync(tempJpeg);
      continue;
    }
    
    // 3. Add to Firestore
    try {
      const newId = await getNextId();
      const newProduct = {
        id: newId,
        name: posterName,
        category: 'Miscellaneous',
        productType: 'poster',
      price: PRODUCT_TYPES['poster'].basePrice,
      originalPrice: PRODUCT_TYPES['poster'].basePrice * 3,
      pricingSource: 'qikink',
        badge: 'New Arrival',
        description: 'High quality A3 poster print.',
        stockQuantity: 50,
        keywords: posterName.toLowerCase().split(' ').join(','),
        image: imageUrl,
        createdAt: FieldValue.serverTimestamp()
      };
      
      await productsRef.doc(newId.toString()).set(newProduct);
      console.log(`Added product ${newId}: ${posterName}`);
      addedCount++;
    } catch (err) {
      console.error(`Failed to add product ${posterName} to Firestore:`, err.message);
    }
    
    // Cleanup
    if (fs.existsSync(tempJpeg)) fs.unlinkSync(tempJpeg);
  }
  
  console.log(`Finished processing. Added ${addedCount} new posters.`);
  process.exit(0);
}

processPdfs().catch(console.error);
