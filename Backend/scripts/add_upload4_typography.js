require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { PRODUCT_TYPES, normalizeProductType } = require('../productTypes');

const sourceDir = "/Volumes/MangalamHDD/Brush Content/New/Typography Centric Illustrated/Upload 4";
const targetOriginals = path.join(__dirname, '../../public/assets/Typography');
const targetThumbs1080 = path.join(__dirname, '../../public/img/w1080/assets/Typography');
const targetThumbs480 = path.join(__dirname, '../../public/img/w480/assets/Typography');

fs.mkdirSync(targetOriginals, { recursive: true });
fs.mkdirSync(targetThumbs1080, { recursive: true });
fs.mkdirSync(targetThumbs480, { recursive: true });

const category = "Typography";
const contentMap = {
  "Cat Mommy": "Illustrated type for cat people. Warm, a little chaotic, and built to live on a wall — not a greeting card.",
  "I M Cool": "Deadpan illustrated lettering. Three words, zero explanation, full poster presence.",
  "Invest in Yourself": "Typography as a daily reminder. Illustrated type that reads like a manifesto, not a motivational quote.",
  "Just Do It Later": "Procrastination, illustrated. Soft colours, sharp lettering, and a poster that gets the joke.",
  "Mentally on DND": "Do-not-disturb energy in illustrated type. For the wall of anyone who has already left the group chat.",
  "Sunset Paradox": "Warm-hour colour and illustrated lettering — a paradox you can hang, not explain.",
  "Sunshine State of Mind": "Bright illustrated type with holiday-poster energy. Sunshine as a mood, not a place.",
  "Take it Day by Day": "Quiet illustrated lettering. A wall-scale reminder to keep it to one day at a time.",
  "These Fucking Humans": "Blunt illustrated type. Observational, unfiltered, and sized for a wall."
};

function displayNameFromFile(filename) {
  return filename.replace(/\.png$/i, '').replace(/\s+/g, ' ').trim();
}

function urlSafeName(filename) {
  const ext = path.extname(filename);
  const base = path.basename(filename, ext).replace(/\s+/g, ' ').trim().replace(/\s+/g, '_');
  return base + ext;
}

function generateThumbs(srcPath, out1080, out480, filename) {
  try {
    execSync(`cwebp -q 80 -resize 1080 0 "${srcPath}" -o "${out1080}"`, { stdio: 'ignore' });
    execSync(`cwebp -q 80 -resize 480 0 "${srcPath}" -o "${out480}"`, { stdio: 'ignore' });
    console.log(`Generated WEBPs for ${filename}`);
  } catch (e) {
    console.log(`cwebp failed for ${filename}, using sips jpeg fallback`);
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

  const sourceFiles = fs.readdirSync(sourceDir).filter(f => {
    if (f.startsWith('._') || f.startsWith('.')) return false;
    return f.toLowerCase().endsWith('.png');
  });

  if (!sourceFiles.length) {
    console.error('No PNG files found in', sourceDir);
    process.exit(1);
  }

  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db();
  const productsRef = db.collection('products');

  const [top] = await productsRef.find().sort({ id: -1 }).limit(1).toArray();
  let nextId = (top ? top.id : 0) + 1;

  const existing = await productsRef.find({ category }).project({ name: 1, image: 1 }).toArray();
  const existingNames = new Set(existing.map(d => d.name.toLowerCase()));
  const existingImages = new Set(existing.map(d => d.image));

  const productType = 'poster';
  const cfg = PRODUCT_TYPES[normalizeProductType(productType, category)];
  const basePrice = cfg ? cfg.basePrice : 299;

  let added = 0;
  for (const filename of sourceFiles) {
    const srcPath = path.join(sourceDir, filename);
    const displayName = displayNameFromFile(filename);
    const baseNameUrl = urlSafeName(filename);
    const imagePath = `assets/Typography/${baseNameUrl}`;

    if (existingNames.has(displayName.toLowerCase()) || existingImages.has(imagePath)) {
      console.log(`Skipped [${displayName}] — already in DB.`);
      continue;
    }

    const destOrig = path.join(targetOriginals, baseNameUrl);
    fs.copyFileSync(srcPath, destOrig);

    const baseNoExt = baseNameUrl.replace(/\.png$/i, '');
    const out1080 = path.join(targetThumbs1080, baseNoExt + '.webp');
    const out480 = path.join(targetThumbs480, baseNoExt + '.webp');
    generateThumbs(srcPath, out1080, out480, filename);

    const id = nextId++;
    const doc = {
      _id: id,
      id: id,
      name: displayName,
      category: category,
      productType: productType,
      price: basePrice,
      originalPrice: basePrice * 3,
      pricingSource: cfg ? 'qikink' : undefined,
      badge: 'New',
      description: contentMap[displayName] || 'Premium illustrated typography poster printed on 300 GSM matte paper.',
      stockQuantity: 50,
      keywords: `typography, illustrated, ${displayName.toLowerCase()}`,
      sku: id.toString(),
      image: imagePath,
      showInBestsellers: false,
      showInNewArrivals: true,
      showInGrossing: false,
      createdAt: new Date()
    };

    await productsRef.insertOne(doc);
    existingNames.add(displayName.toLowerCase());
    existingImages.add(imagePath);
    console.log(`Added [${id}] ${displayName}`);
    added++;
  }

  console.log(`Done. Added ${added} of ${sourceFiles.length} posters.`);
  await client.close();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
