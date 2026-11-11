const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const path = require('path');
const fs = require('fs');

const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');

if (!fs.existsSync(serviceAccountPath)) {
  console.error("❌ ERROR: 'serviceAccountKey.json' is missing.");
  console.error("Please place your Firebase service account key in the Backend folder before running this script.");
  process.exit(1);
}

const serviceAccount = require(serviceAccountPath);

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

const products = [
  { id: 1, name: 'Anime Girls Collection', price: 149, originalPrice: 299, image: 'Testimonials 1.jpg', category: 'Anime', badge: 'Sale', description: 'Set of 2 premium anime posters' },
  { id: 2, name: 'CyberPunk Collection', price: 79, originalPrice: 199, image: 'Testimonials 2.jpg', category: 'Movies & TV', badge: 'Sale', description: 'Cyberpunk themed poster' },
  { id: 3, name: 'Minimalist Collection', price: 85, originalPrice: 199, image: 'Testimonials 3.jpg', category: 'Minimalist', badge: '', description: 'Clean minimalist poster' },
  { id: 4, name: 'John Wick — Movie Poster', price: 99, originalPrice: 199, image: 'John Wick.png', category: 'Movies & TV', badge: 'New', description: 'John Wick movie poster' },
  { id: 5, name: 'Space Frontier Pack', price: 149, originalPrice: 299, image: 'Testimonials 1.jpg', category: 'Space & Sci-Fi', badge: 'New', description: 'Space themed poster pack' },
  { id: 6, name: 'Neon City Vibes', price: 129, originalPrice: 249, image: 'Testimonials 2.jpg', category: 'Cyberpunk', badge: 'New', description: 'Neon cyberpunk city poster' },
  { id: 7, name: 'Abstract Waves Set', price: 99, originalPrice: 199, image: 'Testimonials 3.jpg', category: 'Minimalist', badge: 'New', description: 'Abstract waves poster set' },
  { id: 8, name: 'Movie Legends Pack', price: 179, originalPrice: 349, image: 'John Wick.png', category: 'Movies & TV', badge: 'New', description: 'Movie legends collection' },
  { id: 9, name: 'Cosmic Dreams Set', price: 199, originalPrice: 399, image: 'Landing Slideshow 2x f.jpg', category: 'Space & Sci-Fi', badge: 'New', description: 'Cosmic themed poster set' },
  { id: 10, name: 'Modern Art Wall Kit', price: 159, originalPrice: 299, image: 'Landing Slideshow 3x f.jpg', category: 'Minimalist', badge: 'New', description: 'Modern art wall setup kit' }
];

async function seedData() {
  console.log('Seeding products to Firebase Firestore...');
  const batch = db.batch();
  const productsRef = db.collection('products');
  
  for (const p of products) {
    // We use the ID as the document ID for easier querying later
    const docRef = productsRef.doc(p.id.toString());
    batch.set(docRef, p);
  }
  
  await batch.commit();
  console.log('✅ Successfully seeded all products to Firebase Firestore!');
  process.exit(0);
}

seedData().catch(err => {
  console.error("❌ Error seeding data:", err);
  process.exit(1);
});
