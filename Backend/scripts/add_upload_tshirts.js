require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { PRODUCT_TYPES } = require('../productTypes');

const sourceDir = "/Volumes/MangalamHDD/Tshirts Designs /Upload";
const targetOriginals = path.join(__dirname, '../../public/assets/Tshirt designs');
const targetThumbs1080 = path.join(__dirname, '../../public/img/w1080/assets/Tshirt designs');
const targetThumbs480 = path.join(__dirname, '../../public/img/w480/assets/Tshirt designs');

fs.mkdirSync(targetOriginals, { recursive: true });
fs.mkdirSync(targetThumbs1080, { recursive: true });
fs.mkdirSync(targetThumbs480, { recursive: true });

const CATEGORY = 'Apparel';

// Pair mockups by design slug. Filenames look like:
//   Front_mockup Anti Social.png / back_mockup Anti Social.png
//   front_mockup just do it later.png / back_mockup just do it later.png
function parseMockup(filename) {
  const m = filename.match(/^(front|back)[_\s-]*mockup[_\s-]+(.+)\.png$/i);
  if (!m) return null;
  const side = m[1].toLowerCase();
  const displayName = m[2].replace(/\s+/g, ' ').trim()
    .replace(/\b\w/g, c => c.toUpperCase());
  const slug = m[2].trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return { side, displayName, slug };
}

function generateThumbs(srcPath, destOrigRelNoExt) {
  const out1080 = path.join(targetThumbs1080, destOrigRelNoExt + '.webp');
  const out480 = path.join(targetThumbs480, destOrigRelNoExt + '.webp');
  try {
    execSync(`cwebp -q 80 -resize 1080 0 "${srcPath}" -o "${out1080}"`, { stdio: 'ignore' });
    execSync(`cwebp -q 80 -resize 480 0 "${srcPath}" -o "${out480}"`, { stdio: 'ignore' });
  } catch (e) {
    console.log(`cwebp failed for ${srcPath}, using sips jpeg fallback`);
    const temp1080 = out1080.replace('.webp', '.jpeg');
    const temp480 = out480.replace('.webp', '.jpeg');
    execSync(`sips -Z 1080 -s format jpeg "${srcPath}" --out "${temp1080}"`, { stdio: 'ignore' });
    execSync(`sips -Z 480 -s format jpeg "${srcPath}" --out "${temp480}"`, { stdio: 'ignore' });
    fs.renameSync(temp1080, out1080);
    fs.renameSync(temp480, out480);
  }
}

async function run() {
  if (!process.env.MONGODB_URI) {
    console.error('❌ MONGODB_URI is not set in Backend/.env');
    process.exit(1);
  }

  const files = fs.readdirSync(sourceDir).filter(f => {
    if (f.startsWith('._') || f.startsWith('.')) return false;
    return f.toLowerCase().endsWith('.png');
  });

  const designs = new Map();
  for (const filename of files) {
    const parsed = parseMockup(filename);
    if (!parsed) {
      console.warn(`Skipping unmatched file: ${filename}`);
      continue;
    }
    if (!designs.has(parsed.slug)) {
      designs.set(parsed.slug, { displayName: parsed.displayName, slug: parsed.slug, files: {} });
    }
    designs.get(parsed.slug).files[parsed.side] = filename;
  }

  if (!designs.size) {
    console.error('No t-shirt mockup pairs found in', sourceDir);
    process.exit(1);
  }

  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db();
  const productsRef = db.collection('products');

  const [top] = await productsRef.find().sort({ id: -1 }).limit(1).toArray();
  let nextId = (top && top.id ? top.id : 0) + 1;

  const existing = await productsRef.find({ category: CATEGORY }).project({ name: 1, image: 1 }).toArray();
  const existingNames = new Set(existing.map(d => d.name.toLowerCase()));
  const existingImages = new Set(existing.map(d => d.image));

  const cfg = PRODUCT_TYPES.apparel;
  const basePrice = cfg.basePrice;

  let added = 0;
  for (const design of designs.values()) {
    const frontFile = design.files.front;
    const backFile = design.files.back;
    if (!frontFile || !backFile) {
      console.warn(`Incomplete pair for "${design.displayName}" (front=${frontFile || 'missing'}, back=${backFile || 'missing'}) — skipped.`);
      continue;
    }

    const name = design.displayName + ' T-Shirt';
    const frontDestName = `${design.slug}_front.png`;
    const backDestName = `${design.slug}_back.png`;
    const imagePath = `assets/Tshirt designs/${frontDestName}`;
    const backImagePath = `assets/Tshirt designs/${backDestName}`;

    if (existingNames.has(name.toLowerCase()) || existingImages.has(imagePath)) {
      console.log(`Skipped [${name}] — already in DB.`);
      continue;
    }

    const frontSrc = path.join(sourceDir, frontFile);
    const backSrc = path.join(sourceDir, backFile);
    fs.copyFileSync(frontSrc, path.join(targetOriginals, frontDestName));
    fs.copyFileSync(backSrc, path.join(targetOriginals, backDestName));
    generateThumbs(frontSrc, path.basename(frontDestName, '.png'));
    generateThumbs(backSrc, path.basename(backDestName, '.png'));
    console.log(`Copied + thumbs: ${frontDestName} / ${backDestName}`);

    const id = nextId++;
    const doc = {
      _id: id,
      id: id,
      name,
      category: CATEGORY,
      productType: 'apparel',
      price: basePrice,
      originalPrice: basePrice + 300,
      pricingSource: 'qikink',
      badge: 'New',
      description: `Premium quality ${design.displayName} t-shirt. Comfortable and stylish for your everyday wear.`,
      stockQuantity: 50,
      keywords: `apparel tshirt shirt ${design.displayName.toLowerCase()}`,
      sku: `APP-${id}`,
      image: imagePath,
      backImage: backImagePath,
      showInBestsellers: false,
      showInNewArrivals: true,
      showInGrossing: false,
      createdAt: new Date()
    };

    await productsRef.insertOne(doc);
    existingNames.add(name.toLowerCase());
    existingImages.add(imagePath);
    console.log(`Added [${id}] ${name}`);
    added++;
  }

  console.log(`Done. Added ${added} Apparel products.`);
  await client.close();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
