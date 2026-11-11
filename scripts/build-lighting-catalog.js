const fs = require('fs');
const https = require('https');
const path = require('path');

const searchTerms = [
  'light', 'lamp', 'chandelier', 'wall', 'pendant', 'ceiling', 'fan', 'strip', 'cob',
  'rope', 'spot', 'outdoor', 'flood', 'solar', 'profile', 'track', 'crystal', 'smart',
  'modular', 'hanging', 'driver', 'gate', 'garden', 'mirror', 'linear', 'ring', 'ball',
  'downlight', 'panel', 'step', 'foot', 'bollard', 'spike', 'underwater', 'swimming',
  'neon', 'silicone', 'smps', 'adapter', 'remote', 'sensor', 'cabinet', 'wardrobe',
  'drawer', 'lock', 'magnetic', 'trimless', 'surface', 'concealed', 'deep', 'cylinder',
  'zoom', 'focus', 'beam', 'washer', 'facade', 'street', 'bay', 'highbay', 'batten',
  'tube', 'bulb', 'filament', 'vintage', 'retro', 'modern', 'nordic', 'luxury', 'gold',
  'black', 'rose', 'brass', 'copper', 'acrylic', 'glass', 'wood', 'bamboo', 'table',
  'floor', 'study', 'desk', 'bedside', 'night', 'kids', 'string', 'fairy', 'curtain',
  'diwali', 'christmas', 'party', 'stage', 'par', 'laser', 'dj', 'moving', 'bar',
  'ch', 'pe', 'li', 'ha', 'fa', 'co', 'wa', 'sp', 'tr', 'pr', 'ro', 'st', 'fl', 'so'
];

const collected = new Map();

function fetchTerm(term) {
  return new Promise((resolve) => {
    const url = `https://www.8mlights.com/search/suggest.json?q=${encodeURIComponent(term)}&resources%5Btype%5D=product&resources%5Blimit%5D=50`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const list = json.resources.results.products || [];
          for (const p of list) {
            if (p && p.id && !collected.has(p.id)) {
              collected.set(p.id, p);
            }
          }
        } catch(e) {}
        resolve();
      });
    }).on('error', () => resolve());
  });
}

function fetchSitemap() {
  return new Promise((resolve) => {
    const url = 'https://www.8mlights.com/sitemap_products_1.xml?from=8694029025572&to=15392523419940';
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        const urlBlocks = data.match(/<url>[\s\S]*?<\/url>/g) || [];
        const sitemapItems = [];
        for (const block of urlBlocks) {
          const locMatch = block.match(/<loc>(.*?)<\/loc>/);
          const imgMatch = block.match(/<image:loc>(.*?)<\/image:loc>/);
          const titleMatch = block.match(/<image:title>(.*?)<\/image:title>/);
          if (locMatch && titleMatch) {
            sitemapItems.push({
              url: locMatch[1].trim(),
              title: titleMatch[1].trim(),
              image: imgMatch ? imgMatch[1].trim() : ''
            });
          }
        }
        resolve(sitemapItems);
      });
    }).on('error', () => resolve([]));
  });
}

function categorize(title, body, tags, type) {
  const text = `${title} ${body || ''} ${tags ? tags.join(' ') : ''} ${type || ''}`.toLowerCase();
  if (text.includes('chandelier') || text.includes('jhumar') || text.includes('firefly')) return 'Chandeliers';
  if (text.includes('pendant') || text.includes('hanging') || text.includes('linear hanging')) return 'Pendant & Hanging Lights';
  if (text.includes('fan') || text.includes('wooden fan') || text.includes('palm leaf')) return 'Ceiling & Chandelier Fans';
  if (text.includes('wall lamp') || text.includes('wall light') || text.includes('picture light') || text.includes('mirror light') || text.includes('up down')) return 'Decorative Wall Lamps';
  if (text.includes('track') || text.includes('magnetic') || text.includes('spot light') || text.includes('zoom')) return 'Spot & Track Lights';
  if (text.includes('cob') || text.includes('downlight') || text.includes('concealed') || text.includes('panel') || text.includes('surface')) return 'COB & Downlights';
  if (text.includes('profile') || text.includes('linear profile') || text.includes('gym light') || text.includes('arrow')) return 'Profile & Linear Lights';
  if (text.includes('rope') || text.includes('strip') || text.includes('cove') || text.includes('neon')) return 'Strip & Rope Lights';
  if (text.includes('outdoor') || text.includes('flood') || text.includes('street') || text.includes('solar') || text.includes('gate') || text.includes('garden') || text.includes('bollard') || text.includes('spike') || text.includes('washer')) return 'Outdoor & Landscape Lights';
  if (text.includes('table lamp') || text.includes('floor lamp') || text.includes('desk') || text.includes('bedside')) return 'Table & Floor Lamps';
  return 'Smart & Utility Lighting';
}

function cleanHtml(raw) {
  if (!raw) return '';
  return raw
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

(async () => {
  console.log('Fetching suggest terms from 8M Lights...');
  for (let i = 0; i < searchTerms.length; i += 6) {
    await Promise.all(searchTerms.slice(i, i + 6).map(fetchTerm));
  }
  console.log(`Collected ${collected.size} products from suggest.`);

  console.log('Fetching sitemap from 8M Lights...');
  const sitemapItems = await fetchSitemap();
  console.log(`Collected ${sitemapItems.length} products from sitemap.`);

  const products = [];
  let idCounter = 1;
  const seenTitles = new Set();

  for (const [_, p] of collected) {
    const rawTitle = cleanHtml(p.title);
    if (!rawTitle || seenTitles.has(rawTitle.toLowerCase())) continue;
    seenTitles.add(rawTitle.toLowerCase());

    const priceNum = Math.round(parseFloat(p.price) || 999);
    let originalPriceNum = Math.round(parseFloat(p.compare_at_price_max) || 0);
    if (!originalPriceNum || originalPriceNum <= priceNum) {
      originalPriceNum = Math.round(priceNum * 1.35);
    }

    const cat = categorize(p.title, p.body, p.tags, p.type);
    let cleanDesc = cleanHtml(p.body);
    if (!cleanDesc || cleanDesc.length < 20) {
      cleanDesc = `Premium architectural ${cat.toLowerCase().replace(/&/g, 'and')} fixture curated by Patliputra Traders. Crafted with precision metalwork, energy-efficient high-CRI LED emitters, and seamless installation design for modern luxury interiors.`;
    }

    const imgUrl = (p.featured_image && p.featured_image.url) ? p.featured_image.url : (p.image || '');
    if (!imgUrl) continue;

    let badge = '';
    if (priceNum > 15000) badge = 'Luxury';
    else if (idCounter % 5 === 0) badge = 'Bestseller';
    else if (idCounter % 7 === 0) badge = 'Trending';
    else if (idCounter % 11 === 0) badge = 'New';

    products.push({
      id: idCounter,
      sku: `PT-LT-${String(1000 + idCounter)}`,
      name: rawTitle,
      category: cat,
      price: priceNum,
      originalPrice: originalPriceNum,
      badge: badge,
      image: imgUrl,
      description: cleanDesc,
      keywords: `${rawTitle.toLowerCase()}, ${cat.toLowerCase()}, patliputra traders, lighting patna, decorative lights, luxury lighting`,
      showInBestsellers: (idCounter % 4 === 1 || badge === 'Bestseller'),
      showInGrossing: (idCounter % 5 === 2 || badge === 'Trending'),
      showInNewArrivals: (idCounter % 6 === 3 || badge === 'New'),
      stockQuantity: Math.floor(Math.random() * 35) + 15,
      orderFrequency: Math.floor(Math.random() * 10) + 2,
      productType: 'Lights',
      pricingSource: '8mlights',
      updatedAt: new Date().toISOString()
    });
    idCounter++;
  }

  for (const item of sitemapItems) {
    const rawTitle = cleanHtml(item.title);
    if (!rawTitle || seenTitles.has(rawTitle.toLowerCase()) || !item.image) continue;
    seenTitles.add(rawTitle.toLowerCase());

    const cat = categorize(item.title, '', [], '');
    let defaultPrice = 1499;
    if (cat === 'Chandeliers') defaultPrice = 18500;
    else if (cat === 'Ceiling & Chandelier Fans') defaultPrice = 14500;
    else if (cat === 'Pendant & Hanging Lights') defaultPrice = 3499;
    else if (cat === 'Decorative Wall Lamps') defaultPrice = 1299;
    else if (cat === 'Spot & Track Lights') defaultPrice = 899;
    else if (cat === 'COB & Downlights') defaultPrice = 449;
    else if (cat === 'Profile & Linear Lights') defaultPrice = 1299;
    else if (cat === 'Strip & Rope Lights') defaultPrice = 1199;
    else if (cat === 'Outdoor & Landscape Lights') defaultPrice = 1899;
    else if (cat === 'Table & Floor Lamps') defaultPrice = 2899;

    const originalPrice = Math.round(defaultPrice * 1.35);

    products.push({
      id: idCounter,
      sku: `PT-LT-${String(1000 + idCounter)}`,
      name: rawTitle,
      category: cat,
      price: defaultPrice,
      originalPrice: originalPrice,
      badge: (idCounter % 8 === 0) ? 'Trending' : '',
      image: item.image,
      description: `Premium architectural ${cat.toLowerCase().replace(/&/g, 'and')} fixture curated by Patliputra Traders. Crafted with precision metalwork, energy-efficient high-CRI LED emitters, and seamless installation design for modern luxury interiors.`,
      keywords: `${rawTitle.toLowerCase()}, ${cat.toLowerCase()}, patliputra traders, lighting patna, decorative lights, luxury lighting`,
      showInBestsellers: (idCounter % 5 === 1),
      showInGrossing: (idCounter % 6 === 2),
      showInNewArrivals: (idCounter % 4 === 3),
      stockQuantity: 25,
      orderFrequency: 3,
      productType: 'Lights',
      pricingSource: '8mlights',
      updatedAt: new Date().toISOString()
    });
    idCounter++;
  }

  const outPath = path.resolve(__dirname, '../public/data/products.json');
  console.log(`Writing ${products.length} products to ${outPath}...`);
  fs.writeFileSync(outPath, JSON.stringify(products, null, 2), 'utf8');

  console.log('Categories breakdown:');
  const catCount = {};
  for (const p of products) {
    catCount[p.category] = (catCount[p.category] || 0) + 1;
  }
  console.log(catCount);
})();
