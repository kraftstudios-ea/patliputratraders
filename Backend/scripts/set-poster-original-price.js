#!/usr/bin/env node
/**
 * set-poster-original-price.js
 *
 * Sets originalPrice = 99 for every poster product in the DB whose
 * actual shelf price is below ₹99. This makes the frontend card show
 * a crossed-out ₹99 MRP next to the real (lower) price.
 *
 * Run once:  node Backend/scripts/set-poster-original-price.js
 *
 * Safe to re-run — skips products that already have originalPrice = 99.
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { MongoClient } = require('mongodb');
const { normalizeProductType } = require('../productTypes');

const POSTER_ORIGINAL_PRICE = 99;

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('✖  MONGODB_URI not set — copy Backend/.env.example to Backend/.env');
    process.exit(1);
  }

  const client = new MongoClient(uri, {
    family: 4, // force IPv4 — same as server.js
    serverSelectionTimeoutMS: 10_000,
  });

  await client.connect();
  console.log('✔  Connected to MongoDB');

  const db = client.db();
  const products = db.collection('products');

  // Find every product whose normalised type is 'poster' or 'poster_3_pack'
  // and whose originalPrice is not already set to 99.
  const all = await products.find({}).toArray();

  const toUpdate = all.filter(p => {
    const type = normalizeProductType(p.productType, p.category);
    const isPoster = type === 'poster' || type === 'poster_3_pack';
    const alreadySet = p.originalPrice === POSTER_ORIGINAL_PRICE;
    return isPoster && !alreadySet;
  });

  if (!toUpdate.length) {
    console.log('ℹ  No posters need updating — all already have originalPrice = 99.');
    await client.close();
    return;
  }

  console.log(`📝  Updating ${toUpdate.length} poster product(s)…`);

  const ops = toUpdate.map(p => ({
    updateOne: {
      filter: { _id: p._id },
      update: { $set: { originalPrice: POSTER_ORIGINAL_PRICE } },
    },
  }));

  const result = await products.bulkWrite(ops);
  console.log(`✅  Done — ${result.modifiedCount} product(s) updated with originalPrice = ₹${POSTER_ORIGINAL_PRICE}.`);

  await client.close();
}

main().catch(err => {
  console.error('❌ Migration failed:', err.message);
  process.exit(1);
});
