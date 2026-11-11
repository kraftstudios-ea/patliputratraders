// Brush Digital Assets catalogue — illustrated icon packs, vectors,
// hand-drawn popular illustrations, and redrawn cartoon character assets.
// seedDigitalAssets() runs on server start and inserts missing items (keyed by SKU).

const DIGITAL_PRICE = 79;
const DIGITAL_ORIGINAL_PRICE = 149;
const LAUNCH_STOCK = 999;

const DIGITAL_ASSETS = [
  {
    slug: 'acme-dynamite',
    name: 'ACME Dynamite Vector Illustration',
    category: 'Digital Assets',
    assetType: 'Vector Illustration',
    blurb: 'Classic explosive ACME dynamite bundle with burning fuses, hand-drawn vector paths.',
    format: 'AI · SVG · High-Res PNG',
    keywords: ['acme', 'dynamite', 'vector', 'cartoon', 'vintage', 'explosive']
  },
  {
    slug: 'coyote-face',
    name: 'Wile E. Coyote Vector Portrait',
    category: 'Digital Assets',
    assetType: 'Cartoon Characters',
    blurb: 'Iconic expressive Coyote mascot portrait, crisp scalable vector art.',
    format: 'AI · SVG · High-Res PNG',
    keywords: ['coyote', 'looney tunes', 'cartoon character', 'vector', 'mascot']
  },
  {
    slug: 'road-runner-face',
    name: 'Road Runner Vector Portrait',
    category: 'Digital Assets',
    assetType: 'Cartoon Characters',
    blurb: 'Cheeky Road Runner headshot with vibrant plumage and expressive beak.',
    format: 'AI · SVG · High-Res PNG',
    keywords: ['road runner', 'bird', 'looney tunes', 'cartoon character', 'vector']
  },
  {
    slug: 'coyote-vs-road-runner',
    name: 'Wile E. Coyote vs Road Runner Chase',
    category: 'Digital Assets',
    assetType: 'Digital Illustrations',
    blurb: 'Dynamic high-energy action chase scene illustration between Wile E. Coyote and Road Runner.',
    format: 'AI · SVG · High-Res PNG',
    keywords: ['chase', 'coyote', 'road runner', 'action scene', 'digital illustration', 'cartoon']
  },
  {
    slug: 'shinchan-waving',
    name: 'Shinchan Cheerful Wave Vector',
    category: 'Digital Assets',
    assetType: 'Cartoon Characters',
    blurb: 'Beloved anime character Shinchan in his signature outfit waving cheerfully.',
    format: 'AI · SVG · High-Res PNG',
    keywords: ['shinchan', 'anime', 'cartoon character', 'vector', 'manga']
  },
  {
    slug: 'buriburizaemon',
    name: 'Buriburizaemon Hero Pig Vector',
    category: 'Digital Assets',
    assetType: 'Cartoon Characters',
    blurb: 'The legendary heroic pig Buriburizaemon from Shinchan holding his blade.',
    format: 'AI · SVG · High-Res PNG',
    keywords: ['buriburizaemon', 'shinchan', 'pig', 'hero', 'anime vector']
  },
  {
    slug: 'oggy-thumbs-up',
    name: 'Oggy and the Cockroaches Vector',
    category: 'Digital Assets',
    assetType: 'Cartoon Characters',
    blurb: 'Cheerful Oggy giving a thumbs-up pose with signature blue fur and red nose.',
    format: 'AI · SVG · High-Res PNG',
    keywords: ['oggy', 'oggy and the cockroaches', 'cat', 'cartoon', 'vector art']
  },
  {
    slug: 'jake-the-dog',
    name: 'Jake the Dog Vector Mascot',
    category: 'Digital Assets',
    assetType: 'Cartoon Characters',
    blurb: 'Jake the Dog from Adventure Time in his playful stretchy stance with wide eyes.',
    format: 'AI · SVG · High-Res PNG',
    keywords: ['jake the dog', 'adventure time', 'cartoon network', 'vector', 'mascot']
  },
  {
    slug: 'ji-ji-black-cat',
    name: 'Kiki\'s Delivery Jiji Black Cat Vector',
    category: 'Digital Assets',
    assetType: 'Hand Drawn Illustrations',
    blurb: 'Charming minimalist Studio Ghibli inspired black cat Jiji with large expressive eyes.',
    format: 'AI · SVG · High-Res PNG',
    keywords: ['jiji', 'black cat', 'ghibli', 'kikis delivery service', 'hand drawn']
  },
  {
    slug: 'gunter-penguin',
    name: 'Gunter the Penguin Vector',
    category: 'Digital Assets',
    assetType: 'Cartoon Characters',
    blurb: 'The beloved minimalist penguin Gunter from Adventure Time in clean line art.',
    format: 'AI · SVG · High-Res PNG',
    keywords: ['gunter', 'penguin', 'adventure time', 'cute', 'cartoon']
  },
  {
    slug: 'summer-meadow-rabbits',
    name: 'Summer Meadow Lakeside Picnic Scene',
    category: 'Digital Assets',
    assetType: 'Digital Illustrations',
    blurb: 'Pastoral scenic illustration of two sweet bunny and bear companions resting by a lake under fluffy clouds.',
    format: 'AI · SVG · High-Res PNG',
    keywords: ['scenic', 'pastoral', 'bunnies', 'meadow', 'nature', 'digital illustration']
  },
  {
    slug: 'geometric-flamingo',
    name: 'Geometric Art Deco Flamingo',
    category: 'Digital Assets',
    assetType: 'Digital Illustrations',
    blurb: 'Striking faceted polygonal Art Deco flamingo in coral tones with angled teal and mustard bars.',
    format: 'AI · SVG · High-Res PNG',
    keywords: ['flamingo', 'geometric', 'art deco', 'poly art', 'minimalist', 'illustration']
  },
  {
    slug: 'steaming-ramen-bowl',
    name: 'Artisanal Steaming Ramen Bowl Vector',
    category: 'Digital Assets',
    assetType: 'Hand Drawn Illustrations',
    blurb: 'Detailed food illustration of rich tonkotsu ramen with soft-boiled egg, nori, and lifted noodles.',
    format: 'AI · SVG · High-Res PNG',
    keywords: ['ramen', 'noodles', 'japanese food', 'food illustration', 'hand drawn']
  },
  {
    slug: 'ramen-vector-badge',
    name: 'Vintage Ramen Noodle Bowl Vector',
    category: 'Digital Assets',
    assetType: 'Hand Drawn Illustrations',
    blurb: 'Classic Japanese ramen bowl vector mark with chopstick swirl and savoury broth.',
    format: 'AI · SVG · High-Res PNG',
    keywords: ['ramen', 'noodles', 'japanese food', 'vector badge']
  },
  {
    slug: 'gourmet-cheeseburger',
    name: 'Classic Diner Gourmet Cheeseburger',
    category: 'Digital Assets',
    assetType: 'Hand Drawn Illustrations',
    blurb: 'Mouthwatering illustrated cheeseburger stacked with lettuce, tomato, pickles and melted cheddar on a plate.',
    format: 'AI · SVG · High-Res PNG',
    keywords: ['burger', 'cheeseburger', 'food illustration', 'diner', 'hand drawn']
  },
  {
    slug: 'chivito-burger',
    name: 'Artisan Chivito Burger Vector',
    category: 'Digital Assets',
    assetType: 'Hand Drawn Illustrations',
    blurb: 'Stacked gourmet burger illustration layered with savory meats and fresh greens.',
    format: 'AI · SVG · High-Res PNG',
    keywords: ['chivito', 'burger', 'sandwich', 'food vector']
  },
  {
    slug: 'cheese-sandwich',
    name: 'Grilled Cheese Sandwich Vector',
    category: 'Digital Assets',
    assetType: 'Hand Drawn Illustrations',
    blurb: 'Crispy toasted golden sandwich illustration with melting artisan cheese fillings.',
    format: 'AI · SVG · High-Res PNG',
    keywords: ['grilled cheese', 'sandwich', 'food illustration', 'snack']
  },
  {
    slug: 'pizza-slice',
    name: 'Loaded Pepperoni Pizza Slice Vector',
    category: 'Digital Assets',
    assetType: 'Hand Drawn Illustrations',
    blurb: 'Hot triangular pepperoni pizza slice dripping with golden melted cheese and crust detailing.',
    format: 'AI · SVG · High-Res PNG',
    keywords: ['pizza', 'pizza slice', 'italian food', 'fast food', 'vector']
  },
  {
    slug: 'mexican-tacos',
    name: 'Street Style Mexican Tacos Vector',
    category: 'Digital Assets',
    assetType: 'Hand Drawn Illustrations',
    blurb: 'Authentic hard-shell tacos filled with seasoned fillings, crisp lettuce and salsa.',
    format: 'AI · SVG · High-Res PNG',
    keywords: ['tacos', 'mexican food', 'street food', 'food illustration']
  },
  {
    slug: 'fresh-lemonade',
    name: 'Iced Fresh Lemonade Glass Vector',
    category: 'Digital Assets',
    assetType: 'Hand Drawn Illustrations',
    blurb: 'Refreshing tall glass of chilled lemonade garnished with fresh mint and citrus wheel.',
    format: 'AI · SVG · High-Res PNG',
    keywords: ['lemonade', 'summer drink', 'beverage', 'citrus', 'refreshment']
  },
  {
    slug: 'soda-glass',
    name: 'Vintage Fountain Soda Float Vector',
    category: 'Digital Assets',
    assetType: 'Hand Drawn Illustrations',
    blurb: 'Retro soda fountain glass with bubbly fizzy cola, ice cream float and striped straw.',
    format: 'AI · SVG · High-Res PNG',
    keywords: ['soda', 'vintage soda', 'drink', 'beverage', 'retro']
  },
  {
    slug: 'fruit-salad-bowl',
    name: 'Vibrant Summer Fruit Salad Bowl',
    category: 'Digital Assets',
    assetType: 'Hand Drawn Illustrations',
    blurb: 'Healthy, colorful ceramic bowl brimming with crisp melon, berries and tropical fruit cuts.',
    format: 'AI · SVG · High-Res PNG',
    keywords: ['fruit salad', 'healthy food', 'berries', 'fresh fruit']
  },
  {
    slug: 'boba-sipper',
    name: 'Modern Cafe Boba Sipper Cup Vector',
    category: 'Digital Assets',
    assetType: 'Hand Drawn Illustrations',
    blurb: 'Pastel aesthetic reusable cold cup with sealed lid and straw for iced beverages.',
    format: 'AI · SVG · High-Res PNG',
    keywords: ['boba', 'sipper', 'cafe', 'coffee cup', 'drink']
  },
  {
    slug: 'vintage-telephone',
    name: 'Retro Rotary Telephone Vector',
    category: 'Digital Assets',
    assetType: 'Hand Drawn Illustrations',
    blurb: 'Nostalgic vintage rotary dial telephone in classic crimson tones.',
    format: 'AI · SVG · High-Res PNG',
    keywords: ['telephone', 'rotary phone', 'vintage', 'retro tech', 'nostalgia']
  },
  {
    slug: 'grandmaster-chess',
    name: 'Grandmaster Chess King & Queen Vector',
    category: 'Digital Assets',
    assetType: 'Hand Drawn Illustrations',
    blurb: 'Clean vector rendering of wooden carved chess pieces on a board.',
    format: 'AI · SVG · High-Res PNG',
    keywords: ['chess', 'chess pieces', 'strategy', 'board game', 'vector']
  },
  {
    slug: '18-botanical-line-leaves-branches',
    name: '18 Botanical Line, Leaves & Branches Vector Pack',
    category: 'Digital Assets',
    assetType: 'Icon Packs',
    blurb: 'Handcrafted botanical vector set featuring delicate leaves, twigs, foliage stems and organic flora.',
    format: 'EPS · SVG · High-Res JPG',
    keywords: ['botanical', 'leaves', 'branches', 'flora', 'nature', 'foliage', 'icon pack', 'vector']
  },
  {
    slug: '20-abstract-boho-shapes',
    name: '20 Abstract Boho Sun, Moon & Arch Shapes',
    category: 'Digital Assets',
    assetType: 'Vector Illustration',
    blurb: 'Modern aesthetic bohemian vector set with minimalist sunbursts, crescent moons, arches and organic shapes.',
    format: 'EPS · SVG · High-Res JPG',
    keywords: ['boho', 'abstract', 'sun', 'moon', 'arch', 'shapes', 'geometric', 'minimalist']
  },
  {
    slug: '20-coffee-shop-elements',
    name: '20 Coffee Shop & Barista Vector Elements',
    category: 'Digital Assets',
    assetType: 'Icon Packs',
    blurb: 'Artisan coffee culture icon bundle with espresso machines, moka pots, beans, to-go cups and brewing tools.',
    format: 'EPS · SVG · High-Res JPG',
    keywords: ['coffee', 'cafe', 'barista', 'espresso', 'latte', 'beans', 'icon pack', 'vector']
  },
  {
    slug: '20-fitness-and-gym-elements',
    name: '20 Fitness & Gym Workout Elements',
    category: 'Digital Assets',
    assetType: 'Icon Packs',
    blurb: 'Dynamic health and fitness vector set with dumbbells, kettlebells, barbells, timers and training icons.',
    format: 'EPS · SVG · High-Res JPG',
    keywords: ['fitness', 'gym', 'workout', 'weights', 'kettlebell', 'dumbbells', 'icon pack', 'vector']
  },
  {
    slug: '20-halloween-spooky-elements',
    name: '20 Halloween & Spooky Vector Elements',
    category: 'Digital Assets',
    assetType: 'Icon Packs',
    blurb: 'Spooky Halloween vector graphics bundle with jack-o-lanterns, bats, cauldrons, ghosts and eerie symbols.',
    format: 'EPS · SVG · High-Res JPG',
    keywords: ['halloween', 'spooky', 'jack-o-lantern', 'ghost', 'bats', 'witch', 'icon pack', 'vector']
  },
  {
    slug: '20-kitchen-cooking-utensils',
    name: '20 Kitchen & Cooking Utensils Vector Pack',
    category: 'Digital Assets',
    assetType: 'Icon Packs',
    blurb: 'Chef kitchen and cooking utensils pack with whisks, cleavers, frying pans, rolling pins and culinary tools.',
    format: 'EPS · SVG · High-Res JPG',
    keywords: ['kitchen', 'cooking', 'utensils', 'chef', 'culinary', 'baking', 'icon pack', 'vector']
  },
  {
    slug: '20-wedding-floral-monograms',
    name: '20 Wedding & Floral Monogram Elements',
    category: 'Digital Assets',
    assetType: 'Vector Illustration',
    blurb: 'Elegant wedding floral crests, ornate monogram frames, wreaths and botanical borders for luxury branding.',
    format: 'EPS · SVG · High-Res JPG',
    keywords: ['wedding', 'floral', 'monogram', 'wreath', 'crest', 'elegant', 'luxury', 'branding']
  },
  {
    slug: '24-christmas-holiday-icons',
    name: '24 Christmas & Winter Holiday Vector Icons',
    category: 'Digital Assets',
    assetType: 'Icon Packs',
    blurb: 'Festive seasonal Christmas icon pack with baubles, gingerbread men, pine trees, stockings and holiday gifts.',
    format: 'EPS · SVG · High-Res JPG',
    keywords: ['christmas', 'holiday', 'winter', 'santa', 'ornaments', 'festive', 'icon pack', 'vector']
  },
  {
    slug: '24-hand-drawn-doodle-arrows-shapes',
    name: '24 Hand-Drawn Doodle Arrows & Shapes',
    category: 'Digital Assets',
    assetType: 'Hand Drawn Illustrations',
    blurb: 'Expressive hand-drawn marker doodle arrows, organic callout badges, pointers and geometric sketch scribbles.',
    format: 'EPS · SVG · High-Res JPG',
    keywords: ['doodle', 'arrows', 'hand drawn', 'marker', 'sketch', 'pointers', 'shapes', 'vector']
  },
  {
    slug: '24-pets-and-animals-elements',
    name: '24 Pets & Domestic Animals Vector Pack',
    category: 'Digital Assets',
    assetType: 'Icon Packs',
    blurb: 'Adorable vector pets bundle featuring cats, dogs, paws, bones, pet collars and domestic animal icons.',
    format: 'EPS · SVG · High-Res JPG',
    keywords: ['pets', 'animals', 'dogs', 'cats', 'paws', 'puppy', 'icon pack', 'vector']
  },
  {
    slug: '24-social-media-ui-icons',
    name: '24 Social Media & UI Line Icons',
    category: 'Digital Assets',
    assetType: 'Icon Packs',
    blurb: 'Pixel-perfect modern social media and digital app UI vector icons with clean contours and balanced strokes.',
    format: 'EPS · SVG · High-Res JPG',
    keywords: ['social media', 'ui icons', 'interface', 'app icons', 'vector icons', 'minimalist', 'icon pack']
  },
  {
    slug: '24-star-burst-vectors',
    name: '24 Retro Starburst & Sparkle Vectors',
    category: 'Digital Assets',
    assetType: 'Vector Illustration',
    blurb: 'Retro modern starburst vectors, sparkling flares, twinkling celestial marks and geometric highlight accents.',
    format: 'EPS · SVG · High-Res JPG',
    keywords: ['starburst', 'sparkle', 'stars', 'retro', 'vectors', 'flares', 'y2k', 'celestial']
  },
  {
    slug: '24-travel-vacation-icons',
    name: '24 Travel & Vacation Adventure Icons',
    category: 'Digital Assets',
    assetType: 'Icon Packs',
    blurb: 'Wanderlust travel and vacation vector icons with luggage, planes, cameras, maps, compasses and passports.',
    format: 'EPS · SVG · High-Res JPG',
    keywords: ['travel', 'vacation', 'holiday', 'adventure', 'luggage', 'airplane', 'icon pack', 'vector']
  },
  {
    slug: '25-business-finance-icons',
    name: '25 Business & Finance Vector Icons',
    category: 'Digital Assets',
    assetType: 'Icon Packs',
    blurb: 'Professional business, banking, investment and finance icon pack with charts, currency, safes and analytics.',
    format: 'EPS · SVG · High-Res JPG',
    keywords: ['business', 'finance', 'banking', 'money', 'charts', 'analytics', 'icon pack', 'vector']
  },
  {
    slug: '24-y2k-retro-futuristic-shapes',
    name: '24 Y2K Retro Futuristic Vector Shapes',
    category: 'Digital Assets',
    assetType: 'Vector Illustration',
    blurb: 'Cyberpunk Y2K retro-futuristic geometric badges, chrome-style wireframe grids, star symbols and edgy shapes.',
    format: 'EPS · SVG · High-Res JPG',
    keywords: ['y2k', 'retro futuristic', 'cyberpunk', 'acid graphics', 'geometric', 'badges', 'vector']
  },
  {
    slug: '15-desk-elements',
    name: '15 Modern Desk & Workspace Elements',
    category: 'Digital Assets',
    assetType: 'Icon Packs',
    blurb: 'Curated creative desk and workspace vector collection with laptops, lamps, stationery and office accessories.',
    format: 'EPS · High-Res WebP',
    keywords: ['desk', 'workspace', 'office', 'laptop', 'stationery', 'productivity', 'icon pack', 'vector']
  },
  {
    slug: '18-coffee-cafe-elements',
    name: '18 Artisanal Coffee & Cafe Elements',
    category: 'Digital Assets',
    assetType: 'Icon Packs',
    blurb: 'Artisan cafe and coffee shop illustration bundle with French presses, espresso cups, beans and cafe marks.',
    format: 'EPS · High-Res WebP',
    keywords: ['coffee', 'cafe', 'latte', 'espresso', 'french press', 'beans', 'icon pack', 'vector']
  },
  {
    slug: '18-nature-elements',
    name: '18 Nature & Outdoor Adventure Elements',
    category: 'Digital Assets',
    assetType: 'Icon Packs',
    blurb: 'Handcrafted outdoor wilderness vector set with mountains, pine trees, campfires, suns and nature exploration symbols.',
    format: 'EPS · High-Res WebP',
    keywords: ['nature', 'outdoors', 'mountains', 'forest', 'trees', 'adventure', 'icon pack', 'vector']
  },
  {
    slug: '18-sports-fitness-elements',
    name: '18 Athletic Sports & Fitness Elements',
    category: 'Digital Assets',
    assetType: 'Icon Packs',
    blurb: 'Athletic sports and active lifestyle vectors covering soccer, basketball, cycling, weights and running gear.',
    format: 'EPS · High-Res WebP',
    keywords: ['sports', 'fitness', 'athletic', 'workout', 'active', 'balls', 'icon pack', 'vector']
  },
  {
    slug: '18-transportation-travel-elements',
    name: '18 Transportation & Travel Elements',
    category: 'Digital Assets',
    assetType: 'Icon Packs',
    blurb: 'Sleek travel and vehicle vectors featuring cars, scooters, trains, airplanes, yachts and transit icons.',
    format: 'EPS · High-Res WebP',
    keywords: ['transportation', 'travel', 'vehicles', 'transit', 'car', 'airplane', 'icon pack', 'vector']
  },
  {
    slug: 'jaipur-blues-architectural-series',
    name: 'Jaipur Blues Architectural Vector Suite',
    category: 'Digital Assets',
    assetType: 'Digital Illustrations',
    blurb: 'Intricately detailed architectural vector illustration suite celebrating Jaipur royal palaces, arches, jharokhas and heritage motifs.',
    format: 'AI · High-Res JPG · Vector',
    keywords: ['jaipur', 'jaipur blues', 'architecture', 'palace', 'heritage', 'rajasthan', 'monument', 'digital illustration', 'vector']
  }
];

async function seedDigitalAssets(productsRef) {
  const skus = DIGITAL_ASSETS.map(m => 'DIG-' + m.slug.toUpperCase());
  const existing = new Set((await productsRef.find({ sku: { $in: skus } }, { projection: { sku: 1 } }).toArray()).map(d => d.sku));
  const missing = DIGITAL_ASSETS.filter(m => !existing.has('DIG-' + m.slug.toUpperCase()));
  if (!missing.length) { console.log('💾 Digital assets up to date'); return 0; }
  const [top] = await productsRef.find().sort({ id: -1 }).limit(1).toArray();
  let nextId = (top ? top.id : 0) + 1;
  const now = new Date();
  const docs = missing.map(m => {
    const id = nextId++;
    return {
      _id: id,
      id,
      sku: 'DIG-' + m.slug.toUpperCase(),
      name: m.name,
      category: m.category,
      assetType: m.assetType,
      productType: 'Digital Assets',
      price: DIGITAL_PRICE,
      originalPrice: DIGITAL_ORIGINAL_PRICE,
      pricingSource: 'manual',
      badge: 'Instant Download',
      description: `${m.blurb} Formats included: ${m.format}. Instant high-speed digital delivery upon purchase with complete commercial and personal license.`,
      stockQuantity: LAUNCH_STOCK,
      keywords: ['digital asset', 'instant download', 'vector', 'illustration', ...m.keywords],
      image: `assets/DigitalAssets/${m.slug}.webp`,
      showInBestsellers: false,
      showInNewArrivals: false,
      showInGrossing: false,
      createdAt: now
    };
  });
  await productsRef.insertMany(docs);
  console.log(`💾 Seeded ${docs.length} digital asset(s)`);
  return docs.length;
}

module.exports = { seedDigitalAssets, DIGITAL_ASSETS, DIGITAL_PRICE };
