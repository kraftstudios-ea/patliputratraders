require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { PRODUCT_TYPES } = require('../productTypes');

const SOURCES = [
  {
    dir: "/Volumes/MangalamHDD/Brush Content/New/Mis/Upload",
    category: "Pop Culture"
  },
  {
    dir: "/Volumes/MangalamHDD/Brush Content/New/F1/Upload",
    category: "F1"
  }
];

const TARGET_ORIGINALS_BASE = path.join(__dirname, '../../public/assets');
const TARGET_THUMBS1080_BASE = path.join(__dirname, '../../public/img/w1080/assets');
const TARGET_THUMBS480_BASE = path.join(__dirname, '../../public/img/w480/assets');

function displayNameFromFile(filename) {
  let name = filename.replace(/\.png$/i, '');
  // Strip " Medium" from the end
  name = name.replace(/\s+Medium$/i, '');
  return name.replace(/\s+/g, ' ').trim();
}

function urlSafeName(filename) {
  const ext = path.extname(filename);
  let base = path.basename(filename, ext);
  // Strip " Medium" before making URL safe
  base = base.replace(/\s+Medium$/i, '');
  base = base.replace(/\s+/g, ' ').trim().replace(/\s+/g, '_');
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

  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db();
  const productsRef = db.collection('products');
  const countersRef = db.collection('counters');

  // getNextProductId equivalent using countersRef
  const [top] = await productsRef.find({}, { projection: { id: 1 } }).sort({ id: -1 }).limit(1).toArray();
  await countersRef.updateOne({ _id: 'product-id' }, { $max: { seq: top ? Number(top.id) || 0 : 0 } }, { upsert: true });

  async function getNextId() {
    const counter = await countersRef.findOneAndUpdate(
      { _id: 'product-id' },
      { $inc: { seq: 1 } },
      { returnDocument: 'after' }
    );
    return counter.seq ?? counter.value?.seq;
  }

  let added = 0;
  let totalProcessed = 0;

  for (const source of SOURCES) {
    console.log(`\nProcessing folder for category: ${source.category}`);

    if (!fs.existsSync(source.dir)) {
      console.log(`⚠️  Source folder not found: ${source.dir}`);
      continue;
    }

    const sourceFiles = fs.readdirSync(source.dir).filter(f => {
      // Exclude AppleDouble metadata files and non-PNGs
      if (f.startsWith('._') || f.startsWith('.')) return false;
      return f.toLowerCase().endsWith('.png');
    });

    if (!sourceFiles.length) {
      console.log(`No valid PNG files found in ${source.dir}`);
      continue;
    }

    totalProcessed += sourceFiles.length;

    const existing = await productsRef.find({ category: source.category }).project({ name: 1, image: 1 }).toArray();
    const existingNames = new Set(existing.map(d => d.name.toLowerCase()));
    const existingImages = new Set(existing.map(d => d.image));

    const productType = 'poster';
    const cfg = PRODUCT_TYPES[productType];
    const basePrice = cfg ? cfg.basePrice : 299;

    const targetOriginals = path.join(TARGET_ORIGINALS_BASE, source.category);
    const targetThumbs1080 = path.join(TARGET_THUMBS1080_BASE, source.category);
    const targetThumbs480 = path.join(TARGET_THUMBS480_BASE, source.category);

    for (const filename of sourceFiles) {
      const srcPath = path.join(source.dir, filename);
      const displayName = displayNameFromFile(filename);
      const baseNameUrl = urlSafeName(filename);
      const imagePath = `assets/${source.category}/${baseNameUrl}`;

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

      const id = await getNextId();
      const doc = {
        _id: id,
        id: id,
        name: displayName,
        category: source.category,
        productType: productType,
        price: basePrice,
        originalPrice: basePrice * 3,
        pricingSource: 'qikink', // Ensure it calculates normally via the product types mapping
        badge: 'New',
        description: `Premium quality ${source.category.toLowerCase()} poster printed on 300 GSM matte paper.`,
        stockQuantity: 50,
        keywords: `${source.category.toLowerCase()}, ${displayName.toLowerCase()}, poster, wall art`,
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
  }

  console.log(`\nDone. Added ${added} of ${totalProcessed} total source posters.`);
  await client.close();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});