// Pushes the Mythological / Travel / Floral posters into MongoDB with names
// and descriptions curated from the actual artwork (epithets, taglines, and
// mottos printed on each poster) rather than auto-generated from filenames.
require('dotenv').config();
const { MongoClient } = require('mongodb');

const PRODUCTS = [
  // ---------------- MYTHOLOGICAL ----------------
  {
    file: 'Ares.png', category: 'Mythological', name: 'Ares — Scourge of Men',
    description: 'Scourge of Men, Lord of the Battlefield. A dark statue-portrait study of the god of war — no glory, only the wreckage he leaves behind. Premium matte print.',
  },
  {
    file: 'Athena.png', category: 'Mythological', name: 'Athena — Mistress of Wisdom',
    description: 'Mistress of Wisdom, Shield of the City. A commanding statue-portrait of the goddess of strategy and reason. Premium matte print.',
  },
  {
    file: 'Epictetus.png', category: 'Mythological', name: 'Epictetus — Teacher of Freedom',
    description: "Teacher of Freedom, Voice of Endurance. A Stoic philosopher's statue-portrait for anyone who reads philosophy for the practice, not the theory. Premium matte print.",
  },
  {
    file: 'Gabriel.png', category: 'Mythological', name: 'Gabriel — Herald of the Most High',
    description: 'Herald of the Most High, Bearer of Good Tidings. A solemn archangel portrait rendered in the same classical statue style as the rest of the series. Premium matte print.',
  },
  {
    file: 'Hades.png', category: 'Mythological', name: 'Hades — Lord of the Unseen',
    description: 'Lord of the Unseen, Keeper of the Keys. A brooding statue-portrait of the god of the underworld. Premium matte print.',
  },
  {
    file: 'Malenia.png', category: 'Mythological', name: 'Malenia — Blade of Miquella',
    description: 'Blade of Miquella, Guardian of the Haligtree. A mythic portrait rendered in the same classical statue style as the rest of the collection. Premium matte print.',
  },
  {
    file: 'Medusa.png', category: 'Mythological', name: "Medusa — Bearer of Gorgon's Gaze",
    description: "Unfavoured of Athena, Bearer of Gorgon's Gaze. A striking statue-portrait of myth's most feared woman. Premium matte print.",
  },
  {
    file: 'Poseidon.png', category: 'Mythological', name: 'Poseidon — Earth-Shaker of the Deep',
    description: 'Earth-Shaker of the Deep, Lord of the Restless Waters. A commanding statue-portrait of the god of the sea. Premium matte print.',
  },
  {
    file: 'Zeus.png', category: 'Mythological', name: 'Zeus — Sovereign of Oaths',
    description: 'Sovereign of Oaths, Breaker of Bonds. The king of Olympus, thunderbolt in hand. Premium matte print.',
  },

  // ---------------- TRAVEL ----------------
  {
    file: 'Argentina.png', category: 'Travel', name: 'Argentina',
    description: 'Steel City, Endless Plain. A retro travel-poster print of Buenos Aires, Córdoba, Bariloche, Ushuaia and the glaciers of Patagonia.',
  },
  {
    file: 'Cuba.png', category: 'Travel', name: 'Cuba',
    description: 'Frozen in Beautiful Time. A retro travel-poster print of La Habana, Trinidad, Viñales and Varadero.',
  },
  {
    file: 'Egypt.png', category: 'Travel', name: 'Egypt',
    description: 'Six Thousand Years Standing. A retro travel-poster print of Cairo, Luxor, Aswan and the pyramids of Giza.',
  },
  {
    file: 'Ethiopia.png', category: 'Travel', name: 'Ethiopia',
    description: 'Never Once Colonised. A retro travel-poster print of Addis Ababa, Lalibela, Gondar and the Simien Mountains.',
  },
  {
    file: 'Greece.png', category: 'Travel', name: 'Greece',
    description: 'Birthplace of the Argument. A retro travel-poster print of Athens, Thessaloniki, the Acropolis and the Cyclades.',
  },
  {
    file: 'Iceland.png', category: 'Travel', name: 'Iceland',
    description: 'Fire Beneath the Ice. A retro travel-poster print of Reykjavík, Vík í Mýrdal, Akureyri and the highlands.',
  },
  {
    file: 'India.png', category: 'Travel', name: 'India',
    description: 'Many Tongues, One River. A retro travel-poster print of Delhi, Mumbai, Jaipur and Varanasi.',
  },
  {
    file: 'Indonesia.png', category: 'Travel', name: 'Indonesia',
    description: 'Seventeen Thousand Islands. A retro travel-poster print of Jakarta, Bali, Yogyakarta and Raja Ampat.',
  },
  {
    file: 'Italy.png', category: 'Travel', name: 'Italy',
    description: 'Every Stone Is Argument. A retro travel-poster print of Rome, Florence, Venice and Milan.',
  },
  {
    file: 'Japan.png', category: 'Travel', name: 'Japan',
    description: 'Old Gods, New Machines. A retro travel-poster print of Tokyo, Kyoto, Osaka and Hiroshima.',
  },
  {
    file: 'Mexico.png', category: 'Travel', name: 'Mexico',
    description: 'Two Empires, One Soil. A retro travel-poster print of Mexico City, Oaxaca, Cancún and Guadalajara.',
  },
  {
    file: 'Morocco.png', category: 'Travel', name: 'Morocco',
    description: 'Desert at the Door. A retro travel-poster print of Marrakech, Fès, Casablanca and Essaouira.',
  },
  {
    file: 'Norway.png', category: 'Travel', name: 'Norway',
    description: 'The Sun Forgets to Set. A retro travel-poster print of Oslo, Bergen, the Lofoten Islands and the fjords.',
  },
  {
    file: 'Peru.png', category: 'Travel', name: 'Peru',
    description: 'Empire Above the Clouds. A retro travel-poster print of Lima, Cusco, Arequipa and Machu Picchu country.',
  },
  {
    file: 'Portugal.png', category: 'Travel', name: 'Portugal',
    description: 'Where the Land Ends. A retro travel-poster print of Lisbon, Porto, Braga and the Algarve coast.',
  },
  {
    file: 'Scotland.png', category: 'Travel', name: 'Scotland',
    description: 'Weather as a Personality. A retro travel-poster print of Edinburgh, Glasgow, the Highlands and the Isle of Skye.',
  },
  {
    file: 'South Korea.png', category: 'Travel', name: 'South Korea',
    description: 'Mountains Hold the City. A retro travel-poster print of Seoul, Busan, Gyeongju and Jeju.',
  },
  {
    file: 'Turkiye.png', category: 'Travel', name: 'Türkiye',
    description: 'Where East Meets West. A retro travel-poster print of İstanbul, Ankara, İzmir and Antalya.',
  },
  {
    file: 'Uzbekistan.png', category: 'Travel', name: 'Uzbekistan',
    description: 'Crossroads of the Silk Road. A retro travel-poster print of Tashkent, Samarkand, Bukhara and Khiva.',
  },
  {
    file: 'Vietnam.png', category: 'Travel', name: 'Vietnam',
    description: 'River Delta, Mountain Spine. A retro travel-poster print of Hanoi, Hạ Long Bay, Hội An and Sài Gòn.',
  },

  // ---------------- FLORAL ----------------
  {
    file: 'Dahlia_Floral.png', category: 'Floral', name: 'Dahlia',
    description: 'Purity, Dignity, Transformation — In Omnia Mutamur. A moody close-up dahlia bloom study for a calm, editorial wall.',
  },
  {
    file: 'Daisy.png', category: 'Floral', name: 'Daisy',
    description: 'Resilience, Clarity, Rebirth — Post Tenebras Lux. A sun-worn daisy bloom study for a calm, editorial wall.',
  },
  {
    file: 'Hydrangea.png', category: 'Floral', name: 'Hydrangea',
    description: 'Purity, Humility, Transience — Sicut Pluvia Lenis. A quiet hydrangea-in-a-vase study for a calm, editorial wall.',
  },
  {
    file: 'Lily_Poster.png', category: 'Floral', name: 'Lily',
    description: 'Purity, Renewal, Transcendence — Mundus Renovatur. A soft lily bloom study for a calm, editorial wall.',
  },
  {
    file: 'Rose.png', category: 'Floral', name: 'Rose',
    description: 'Devotion, Mystery, Transience — Sub Rosa. A deep-toned rose bloom study for a calm, editorial wall.',
  },
  {
    file: 'Sunflower.png', category: 'Floral', name: 'Sunflower',
    description: 'Vitality, Loyalty, Illumination — Ad Lucem. A golden sunflower study for a calm, editorial wall.',
  },
  {
    file: 'Daisy_Anatomy.png', category: 'Floral', name: 'Daisy Anatomy',
    description: 'A labeled botanical diagram of a daisy in bloom — petal composition, central disc, stem and leaf structure, rendered like a field-guide plate.',
  },
  {
    file: 'Lily_Anatomy.png', category: 'Floral', name: 'Lily Anatomy',
    description: 'A labeled botanical diagram of a lily in bloom — petal composition, filament cluster, stem and leaf structure, rendered like a field-guide plate.',
  },
  {
    file: 'Lily_Bouquet_Anatomy.png', category: 'Floral', name: 'Lily Bouquet Anatomy',
    description: 'A labeled botanical diagram of a full lily bouquet — petal composition, filament clusters, and stem architecture, rendered like a field-guide plate.',
  },
  {
    file: 'Decay_Roses_1.png', category: 'Floral', name: 'Decay — Roses I',
    description: '"Decay is not an end." A glossy, iridescent rose cluster with butterflies in a dark sci-fi editorial frame — beauty as the brief delay between making and unmaking.',
  },
  {
    file: 'Decay_Roses_2.png', category: 'Floral', name: 'Decay — Roses II',
    description: '"Decay is not an end." A second glossy, iridescent bloom cluster with butterflies in the same dark sci-fi editorial frame.',
  },
  {
    file: 'Tulip.png', category: 'Floral', name: 'Alive — Tulips',
    description: '"Alive is not a claim." A pale tulip trio with drifting butterflies — companion piece to the Decay series, same frame, opposite state.',
  },
];

async function run() {
  if (!process.env.MONGODB_URI) {
    console.error('❌ MONGODB_URI is not set in Backend/.env — add your Atlas connection string first.');
    process.exit(1);
  }

  const mongoClient = new MongoClient(process.env.MONGODB_URI);
  await mongoClient.connect();
  const db = mongoClient.db();
  const productsRef = db.collection('products');
  console.log('✅ Connected to MongoDB');

  const [top] = await productsRef.find().sort({ id: -1 }).limit(1).toArray();
  let nextId = (top ? top.id : 0) + 1;

  let added = 0;
  const folderFor = { Mythological: 'Mythological', Travel: 'Travel', Floral: 'Floral' };

  for (const p of PRODUCTS) {
    const id = nextId++;
    const sku = `PRD-1${String(id).padStart(3, '0')}`;
    const folder = folderFor[p.category];

    const product = {
      _id: id,
      id,
      name: p.name,
      category: p.category,
      productType: 'poster',
      price: PRODUCT_TYPES['poster'].basePrice,
      originalPrice: PRODUCT_TYPES['poster'].basePrice * 3,
      pricingSource: 'qikink',
      badge: 'New',
      description: p.description,
      stockQuantity: 40,
      keywords: `${p.category.toLowerCase()}, ${p.name.toLowerCase()}, wall art, poster`,
      sku,
      image: `assets/${folder}/${p.file}`,
      showInBestsellers: false,
      showInNewArrivals: false,
      showInGrossing: false,
      createdAt: new Date(),
    };

    await productsRef.insertOne(product);
    added++;
    console.log(`Added [${id}] ${p.name} (${p.category})`);
  }

  console.log(`\nDone. Added ${added} products.`);
  await mongoClient.close();
  process.exit(0);
}

run().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
