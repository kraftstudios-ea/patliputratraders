/* Adds the two Barcelona Messi posters from the Sports/Upload 2 drop.
   Same shape and id source as add_posters.js. Idempotent: a poster whose
   image path is already in the catalogue is skipped, so re-running is safe.

   Dry run:  node add_messi_jersey.js
   Apply:    node add_messi_jersey.js --apply
*/
const { MongoClient } = require('mongodb');
require('dotenv').config({ path: '.env' });

const APPLY = process.argv.includes('--apply');

// Pricing and stock copied from the existing Messi set (ids 506-511) so the
// Sports range stays consistent.
const base = {
  category: 'Sports',
  productType: 'poster',
  badge: 'New',
  price: 26,
  originalPrice: 66,
  stockQuantity: 50,
  showInBestsellers: false,
  showInNewArrivals: true,
  showInGrossing: false,
  orderFrequency: 0,
  pricingSource: 'qikink',
};

const products = [
  {
    ...base,
    name: 'Messi Barcelona Retro',
    description:
      'Lionel Messi in the Barça home shirt, arms raised to the crowd, set against a retro block print of maroon, blue and cream. Premium 300 GSM matte paper.',
    // Deliberately wide: shoppers search the club, the player, the nickname,
    // the sport and the look — not the filename.
    keywords: [
      'messi', 'lionel messi', 'leo messi', 'barcelona', 'barca', 'fc barcelona',
      'blaugrana', 'football', 'soccer', 'footballer', 'goat', 'number 10',
      'sports', 'sport', 'retro', 'vintage', 'typography', 'la liga',
      'football poster', 'sports poster', 'poster', 'wall art', 'wall decor',
      'room decor', 'art print', 'gift', 'gift for him', 'man cave', 'hostel room'
    ].join(', '),
    sku: 'MESSI-BARCA-RETRO',
    image: 'assets/Sports/Messi_Barca_Retro.webp',
  },
  {
    ...base,
    name: 'Messi Barca Jersey',
    description:
      'The number 10 held up to the stands — Messi and the Barcelona shirt, with his signature across the club stripes. Premium 300 GSM matte paper.',
    keywords: [
      'messi', 'lionel messi', 'leo messi', 'barcelona', 'barca', 'fc barcelona',
      'jersey', 'shirt', 'number 10', 'no 10', 'signature', 'celebration',
      'football', 'soccer', 'footballer', 'goat', 'blaugrana', 'la liga',
      'sports', 'sport', 'football poster', 'sports poster',
      'poster', 'wall art', 'wall decor', 'room decor', 'art print',
      'gift', 'gift for him', 'man cave', 'hostel room'
    ].join(', '),
    sku: 'MESSI-BARCA-JERSEY',
    image: 'assets/Sports/Messi_Barca_Jersey.webp',
  },
];

async function run() {
  const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 20000 });
  await client.connect();
  const db = client.db();
  const col = db.collection('products');

  async function nextId() {
    const r = await db.collection('counters').findOneAndUpdate(
      { _id: 'productId' },
      { $inc: { sequence_value: 1 } },
      { returnDocument: 'after', upsert: true }
    );
    return r.sequence_value || r.value.sequence_value;
  }

  for (const p of products) {
    const existing = await col.findOne({ $or: [{ image: p.image }, { sku: p.sku }] });
    if (existing) { console.log(`skip (already there): ${p.name} -> id ${existing.id}`); continue; }
    if (!APPLY) { console.log(`would add: ${p.name}  [${p.image}]`); continue; }
    const id = await nextId();
    await col.insertOne({ id, ...p, sku: p.sku || String(id), createdAt: new Date() });
    console.log(`added: ${p.name} -> id ${id}`);
  }

  await client.close();
  console.log(APPLY ? 'done' : 'dry run — re-run with --apply');
}

run().catch(e => { console.error(e); process.exit(1); });
