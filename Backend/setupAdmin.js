require('dotenv').config();
const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');

// Previously wrote to Firestore with unsalted SHA-256 hashes — stale since
// the admin store migrated to MongoDB (see migrate_firestore_to_mongo.js)
// and server.js switched to bcrypt. This targets the same
// collection/hash scheme server.js uses.

async function setupAdmin() {
  const username = process.env.SETUP_ADMIN_USERNAME;
  const password = process.env.SETUP_ADMIN_PASSWORD;
  if (!process.env.MONGODB_URI || !username || !password) {
    console.error('Set MONGODB_URI, SETUP_ADMIN_USERNAME and SETUP_ADMIN_PASSWORD before running this script.');
    process.exit(1);
  }

  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const adminsRef = client.db().collection('admins');

  const passwordHash = await bcrypt.hash(password, 12);
  await adminsRef.updateOne(
    { _id: username },
    { $set: { username, passwordHash, role: 'superadmin' } },
    { upsert: true }
  );

  console.log(`Admin user '${username}' created successfully.`);
  await client.close();
  process.exit(0);
}

setupAdmin().catch((err) => {
  console.error(err);
  process.exit(1);
});
