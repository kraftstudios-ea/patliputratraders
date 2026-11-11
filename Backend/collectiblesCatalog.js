const COLLECTIBLE_PRICE = 3999;
const COLLECTIBLE_ORIGINAL_PRICE = 4999;

const COLLECTIBLES = [
  { slug: 'frieren', name: "Frieren - Beyond Journey's End Figurine", category: 'Anime', folder: 'Frieren', baseImg: 'Frieren_1.png',
    blurb: 'A highly detailed scale figure of the elven mage Frieren holding her iconic staff, capturing her serene and timeless expression.',
    keywords: ['frieren', 'anime', 'figurine', 'collectible', 'elf', 'mage'] },
  { slug: 'goku', name: 'Son Goku - Super Saiyan Figurine', category: 'Anime', folder: 'Goku ', baseImg: 'Goku 1.png',
    blurb: 'Premium collectible figure of Son Goku in his classic gi, featuring incredibly accurate sculpting and paintwork.',
    keywords: ['goku', 'dragon ball', 'dbz', 'anime', 'figurine', 'collectible', 'saiyan'] },
  { slug: 'fortune', name: 'Miss Fortune - League of Legends Figurine', category: 'Gaming', folder: 'Fortune ', baseImg: 'Fortune 1.png',
    blurb: 'The Bounty Hunter Miss Fortune with her signature dual pistols and fiery red hair, brought to life in this vibrant collectible statue.',
    keywords: ['miss fortune', 'league of legends', 'lol', 'gaming', 'figurine', 'collectible', 'arcadia'] },
  { slug: 'champagne', name: 'Champagne - Azur Lane Figurine', category: 'Anime', folder: 'Azur Lane Champagne', baseImg: 'Azur Lane Champagne 1.png',
    blurb: 'A stunning collectible of Champagne from Azur Lane, featuring flowing blue hair and intricate battle-ready details.',
    keywords: ['azur lane', 'champagne', 'anime', 'gacha', 'figurine', 'collectible'] }
];

function getGallery(folder) {
  const files = [];
  if (folder.trim() === 'Frieren') {
    files.push('Frieren_1.png', 'Frieren 2.png', 'Frieren 3.png', 'Frieren 4.png', 'Frieren 5.png', 'Frieren 6.png');
  } else if (folder.trim() === 'Goku') {
    files.push('Goku 1.png', 'Goku 2.png', 'Goku 3.png', 'Goku 4.png', 'Goku 5.png', 'Goku 6.png');
  } else if (folder.trim() === 'Fortune') {
    files.push('Fortune 1.png', 'Fortune 2.png', 'Fortune 3.png', 'Fortune4.png', 'Fortune 5.png', 'Fortune 6.png');
  } else if (folder.trim() === 'Azur Lane Champagne') {
    files.push('Azur Lane Champagne 1.png', 'Azur Lane Champagne  2.png', 'Azur Lane Champagne  3.png', 'Azur Lane Champagne  4.png', 'Azur Lane Champagne  5.png', 'Azur Lane Champagne  6.png');
  }
  return files.map(file => ({
    kind: 'photo',
    src: `assets/Figurines/${folder}/${file}`,
    label: 'View'
  }));
}

async function seedCollectibles(productsRef) {
  const skus = COLLECTIBLES.map(c => 'COL-' + c.slug.toUpperCase());
  const existing = new Set((await productsRef.find({ sku: { $in: skus } }, { projection: { sku: 1 } }).toArray()).map(d => d.sku));
  const missing = COLLECTIBLES.filter(c => !existing.has('COL-' + c.slug.toUpperCase()));
  if (!missing.length) { console.log('🧸  Collectibles up to date'); return 0; }
  
  const [top] = await productsRef.find().sort({ id: -1 }).limit(1).toArray();
  let nextId = (top ? top.id : 0) + 1;
  const now = new Date();
  
  const docs = missing.map(c => {
    const id = nextId++;
    return {
      _id: id, id, sku: 'COL-' + c.slug.toUpperCase(), name: c.name,
      category: c.category, productType: 'Collectibles',
      price: COLLECTIBLE_PRICE, originalPrice: COLLECTIBLE_ORIGINAL_PRICE, pricingSource: 'manual',
      badge: 'Limited', description: c.blurb,
      stockQuantity: 10, keywords: c.keywords,
      image: `assets/Figurines/${c.folder}/${c.baseImg}`, gallery: getGallery(c.folder),
      showInBestsellers: false, showInNewArrivals: true, showInGrossing: false,
      createdAt: now
    };
  });
  
  await productsRef.insertMany(docs);
  console.log(`🧸  Added ${docs.length} collectible${docs.length === 1 ? '' : 's'}`);
  return docs.length;
}

module.exports = { COLLECTIBLES, seedCollectibles };
