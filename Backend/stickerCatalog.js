// Brush sticker catalogue — the A4 kiss-cut sheets in /stickers, listed as
// products. seedStickerSheets() runs on every server start (like
// syncCatalogPrices): it inserts any sheet that isn't in the database yet,
// keyed by SKU. Existing documents are never overwritten, so price, stock
// or badge edits made in the admin panel stick.
//
// Images: public/assets/Stickers/<slug>.png (1400px) with WebP thumbnails in
// public/img/w480|w1080/assets/Stickers/. Print-ready 300 dpi PNGs and the
// SVG masters (with the CutContour layer) live in /stickers.
const STICKER_PRICE = 79;          // per A4 sheet (edit here or in admin)
const STICKER_ORIGINAL_PRICE = 149;

const STICKER_SHEETS = [
  {
    "sku": "STK-PACK-01-PARODY-ORIGINALS",
    "name": "Parody Originals Sticker Sheet",
    "category": "Pop Culture",
    "description": "Brush house parodies — Jägermistakes, Absolut Nonsense, Bedweiser, Cancel N°5, Marlbored and friends. A4 kiss-cut sheet · 10 vinyl stickers · matte, waterproof.",
    "image": "assets/Stickers/pack-01-parody-originals.png",
    "keywords": [
      "stickers",
      "sticker sheet",
      "vinyl",
      "parody",
      "brands",
      "typography",
      "funny"
    ],
    "stickerCount": 10,
    "newArrival": false
  },
  {
    "sku": "STK-PACK-02-PARODY-TYPE-CLUB",
    "name": "Parody Type Club Sticker Sheet",
    "category": "Pop Culture",
    "description": "Type-only parody labels for people who read the fine print. A4 kiss-cut sheet · 10 vinyl stickers · matte, waterproof.",
    "image": "assets/Stickers/pack-02-parody-type-club.png",
    "keywords": [
      "stickers",
      "sticker sheet",
      "vinyl",
      "parody",
      "typography",
      "labels",
      "funny"
    ],
    "stickerCount": 10,
    "newArrival": false
  },
  {
    "sku": "STK-PACK-03-DEV-MODE",
    "name": "Dev Mode Sticker Sheet",
    "category": "General",
    "description": "Terminal jokes, keyboard shortcuts and console humour for your laptop lid. A4 kiss-cut sheet · 10 vinyl stickers · matte, waterproof.",
    "image": "assets/Stickers/pack-03-dev-mode.png",
    "keywords": [
      "stickers",
      "sticker sheet",
      "vinyl",
      "coding",
      "developer",
      "programmer",
      "laptop",
      "tech"
    ],
    "stickerCount": 10,
    "newArrival": false
  },
  {
    "sku": "STK-PACK-04-PIXEL-ARCADE",
    "name": "Pixel Arcade Sticker Sheet",
    "category": "Gaming",
    "description": "8-bit hearts, controllers and arcade one-liners. A4 kiss-cut sheet · 10 vinyl stickers · matte, waterproof.",
    "image": "assets/Stickers/pack-04-pixel-arcade.png",
    "keywords": [
      "stickers",
      "sticker sheet",
      "vinyl",
      "gaming",
      "pixel",
      "retro",
      "arcade",
      "8-bit"
    ],
    "stickerCount": 10,
    "newArrival": false
  },
  {
    "sku": "STK-PACK-05-GOOD-VIBES",
    "name": "Good Vibes Sticker Sheet",
    "category": "General",
    "description": "Soft, upbeat reminders for journals, bottles and planners. A4 kiss-cut sheet · 10 vinyl stickers · matte, waterproof.",
    "image": "assets/Stickers/pack-05-good-vibes.png",
    "keywords": [
      "stickers",
      "sticker sheet",
      "vinyl",
      "positive",
      "vibes",
      "cute",
      "motivation"
    ],
    "stickerCount": 10,
    "newArrival": false
  },
  {
    "sku": "STK-PACK-06-WARNING-LABELS",
    "name": "Warning Labels Sticker Sheet",
    "category": "Pop Culture",
    "description": "Hazard-tape humour: may cause yawning, handle with sarcasm, fragile ego inside. A4 kiss-cut sheet · 10 vinyl stickers · matte, waterproof.",
    "image": "assets/Stickers/pack-06-warning-labels.png",
    "keywords": [
      "stickers",
      "sticker sheet",
      "vinyl",
      "warning",
      "labels",
      "funny",
      "sarcasm"
    ],
    "stickerCount": 10,
    "newArrival": false
  },
  {
    "sku": "STK-PACK-07-BRUSH-STUDIO",
    "name": "Brush Studio Sticker Sheet",
    "category": "General",
    "description": "The Brush studio set — brushes, palettes and maker mottos. A4 kiss-cut sheet · 10 vinyl stickers · matte, waterproof.",
    "image": "assets/Stickers/pack-07-brush-studio.png",
    "keywords": [
      "stickers",
      "sticker sheet",
      "vinyl",
      "brush",
      "art",
      "design",
      "creative",
      "studio"
    ],
    "stickerCount": 10,
    "newArrival": false
  },
  {
    "sku": "STK-PACK-08-TYPE-NERD",
    "name": "Type Nerd Sticker Sheet",
    "category": "Minimalist",
    "description": "Kerning jokes and type-geek badges for designers. A4 kiss-cut sheet · 10 vinyl stickers · matte, waterproof.",
    "image": "assets/Stickers/pack-08-type-nerd.png",
    "keywords": [
      "stickers",
      "sticker sheet",
      "vinyl",
      "typography",
      "design",
      "fonts",
      "designer"
    ],
    "stickerCount": 10,
    "newArrival": false
  },
  {
    "sku": "STK-SHEET-01-CODER-LIFE",
    "name": "Coder Life Sticker Sheet",
    "category": "General",
    "description": "It works on my machine, rubber duck debugging, sudo make coffee and more. A4 kiss-cut sheet · 10 vinyl stickers · matte, waterproof.",
    "image": "assets/Stickers/sheet-01-coder-life.png",
    "keywords": [
      "stickers",
      "sticker sheet",
      "vinyl",
      "coding",
      "developer",
      "programmer",
      "tech",
      "laptop"
    ],
    "stickerCount": 10,
    "newArrival": true
  },
  {
    "sku": "STK-SHEET-02-CREATIVE-MODE",
    "name": "Creative Mode Sticker Sheet",
    "category": "General",
    "description": "Progress over perfection, make a mess, art fuels life — for makers and doodlers. A4 kiss-cut sheet · 10 vinyl stickers · matte, waterproof.",
    "image": "assets/Stickers/sheet-02-creative-mode.png",
    "keywords": [
      "stickers",
      "sticker sheet",
      "vinyl",
      "creative",
      "art",
      "design",
      "motivation"
    ],
    "stickerCount": 10,
    "newArrival": true
  },
  {
    "sku": "STK-SHEET-03-PRODUCTIVITY-ISH",
    "name": "Productivity (ish) Sticker Sheet",
    "category": "General",
    "description": "The honest to-do list: plan, procrastinate, panic, perform. A4 kiss-cut sheet · 10 vinyl stickers · matte, waterproof.",
    "image": "assets/Stickers/sheet-03-productivity-ish.png",
    "keywords": [
      "stickers",
      "sticker sheet",
      "vinyl",
      "productivity",
      "funny",
      "study",
      "office",
      "planner"
    ],
    "stickerCount": 10,
    "newArrival": true
  },
  {
    "sku": "STK-SHEET-04-SNACK-BREAK",
    "name": "Snack Break Sticker Sheet",
    "category": "General",
    "description": "Pizza, ramen, boba, chai and other emotional support snacks. A4 kiss-cut sheet · 10 vinyl stickers · matte, waterproof.",
    "image": "assets/Stickers/sheet-04-snack-break.png",
    "keywords": [
      "stickers",
      "sticker sheet",
      "vinyl",
      "food",
      "snacks",
      "cute",
      "kawaii"
    ],
    "stickerCount": 10,
    "newArrival": true
  },
  {
    "sku": "STK-SHEET-05-TRAVEL-MODE",
    "name": "Travel Mode Sticker Sheet",
    "category": "Travel",
    "description": "Explore-more badges, a boarding pass to anywhere and beach-please energy. A4 kiss-cut sheet · 10 vinyl stickers · matte, waterproof.",
    "image": "assets/Stickers/sheet-05-travel-mode.png",
    "keywords": [
      "stickers",
      "sticker sheet",
      "vinyl",
      "travel",
      "adventure",
      "wanderlust",
      "luggage"
    ],
    "stickerCount": 10,
    "newArrival": true
  },
  {
    "sku": "STK-SHEET-06-TOTALLY-REAL-APPS",
    "name": "Totally Real Apps Sticker Sheet",
    "category": "Pop Culture",
    "description": "Twelve app icons for brands that do not exist: Snoozify, Deadlinr, Overthinkr… A4 kiss-cut sheet · 12 vinyl stickers · matte, waterproof.",
    "image": "assets/Stickers/sheet-06-totally-real-apps.png",
    "keywords": [
      "stickers",
      "sticker sheet",
      "vinyl",
      "apps",
      "fictional brands",
      "funny",
      "parody",
      "tech"
    ],
    "stickerCount": 12,
    "newArrival": true
  },
  {
    "sku": "STK-SHEET-07-FINE-PRINT-BRANDS",
    "name": "Fine Print Brands Sticker Sheet",
    "category": "Pop Culture",
    "description": "Vintage-style labels from Someday & Sons, Nap Club, Nope™ and other fake brands. A4 kiss-cut sheet · 10 vinyl stickers · matte, waterproof.",
    "image": "assets/Stickers/sheet-07-fine-print-brands.png",
    "keywords": [
      "stickers",
      "sticker sheet",
      "vinyl",
      "fictional brands",
      "vintage",
      "labels",
      "funny"
    ],
    "stickerCount": 10,
    "newArrival": true
  },
  {
    "sku": "STK-SHEET-08-PLAYER-ONE",
    "name": "Player One Sticker Sheet",
    "category": "Gaming",
    "description": "Level up, game over, nat 20 and +10 XP for touching grass. A4 kiss-cut sheet · 10 vinyl stickers · matte, waterproof.",
    "image": "assets/Stickers/sheet-08-player-one.png",
    "keywords": [
      "stickers",
      "sticker sheet",
      "vinyl",
      "gaming",
      "gamer",
      "pixel",
      "retro",
      "dnd"
    ],
    "stickerCount": 10,
    "newArrival": true
  },
  {
    "sku": "STK-SHEET-09-CATS-MOODS",
    "name": "Cats & Moods Sticker Sheet",
    "category": "General",
    "description": "Loaf mode on, purr-sonal space and other feline feelings. A4 kiss-cut sheet · 10 vinyl stickers · matte, waterproof.",
    "image": "assets/Stickers/sheet-09-cats-moods.png",
    "keywords": [
      "stickers",
      "sticker sheet",
      "vinyl",
      "cats",
      "cute",
      "pets",
      "mood"
    ],
    "stickerCount": 10,
    "newArrival": true
  },
  {
    "sku": "STK-SHEET-10-POSITIVE-ENERGY",
    "name": "Positive Energy Sticker Sheet",
    "category": "General",
    "description": "Gentle reminders: you got this, grow at your own pace, it will be okay. A4 kiss-cut sheet · 10 vinyl stickers · matte, waterproof.",
    "image": "assets/Stickers/sheet-10-positive-energy.png",
    "keywords": [
      "stickers",
      "sticker sheet",
      "vinyl",
      "positive",
      "self care",
      "motivation",
      "cute"
    ],
    "stickerCount": 10,
    "newArrival": true
  },
  {
    "sku": "STK-SHEET-11-SPACE-CASE",
    "name": "Space Case Sticker Sheet",
    "category": "Space",
    "description": "Astronauts, UFOs and stardust for the curious. A4 kiss-cut sheet · 10 vinyl stickers · matte, waterproof.",
    "image": "assets/Stickers/sheet-11-space-case.png",
    "keywords": [
      "stickers",
      "sticker sheet",
      "vinyl",
      "space",
      "astronaut",
      "planets",
      "sci-fi"
    ],
    "stickerCount": 10,
    "newArrival": true
  },
  {
    "sku": "STK-SHEET-12-ON-REPEAT",
    "name": "On Repeat Sticker Sheet",
    "category": "General",
    "description": "Vinyl, cassettes and headphones — music fixes things. A4 kiss-cut sheet · 10 vinyl stickers · matte, waterproof.",
    "image": "assets/Stickers/sheet-12-on-repeat.png",
    "keywords": [
      "stickers",
      "sticker sheet",
      "vinyl",
      "music",
      "vinyl",
      "headphones",
      "retro"
    ],
    "stickerCount": 10,
    "newArrival": true
  },
  {
    "sku": "STK-SHEET-13-STUDY-MODE",
    "name": "Study Mode Sticker Sheet",
    "category": "General",
    "description": "Study, plan, slay — one chapter at a time. A4 kiss-cut sheet · 10 vinyl stickers · matte, waterproof.",
    "image": "assets/Stickers/sheet-13-study-mode.png",
    "keywords": [
      "stickers",
      "sticker sheet",
      "vinyl",
      "study",
      "student",
      "exam",
      "school",
      "college"
    ],
    "stickerCount": 10,
    "newArrival": true
  },
  {
    "sku": "STK-SHEET-14-CREATIVE-TOOLKIT",
    "name": "Creative Toolkit Sticker Sheet",
    "category": "General",
    "description": "Twelve generic tool icons for designers and devs — Vector, Terminal, Save > Panic. A4 kiss-cut sheet · 12 vinyl stickers · matte, waterproof.",
    "image": "assets/Stickers/sheet-14-creative-toolkit.png",
    "keywords": [
      "stickers",
      "sticker sheet",
      "vinyl",
      "design",
      "developer",
      "tools",
      "apps",
      "tech"
    ],
    "stickerCount": 12,
    "newArrival": true
  },
  {
    "sku": "STK-SHEET-15-GOOD-LUCK-CHARMS",
    "name": "Good Luck Charms Sticker Sheet",
    "category": "General",
    "description": "Lucky you, cherry on top, main character energy and more. A4 kiss-cut sheet · 10 vinyl stickers · matte, waterproof.",
    "image": "assets/Stickers/sheet-15-good-luck-charms.png",
    "keywords": [
      "stickers",
      "sticker sheet",
      "vinyl",
      "lucky",
      "retro",
      "funny",
      "cute"
    ],
    "stickerCount": 10,
    "newArrival": true
  }
];

async function seedStickerSheets(productsRef) {
  const skus = STICKER_SHEETS.map(s => s.sku);
  const existing = new Set((await productsRef.find({ sku: { $in: skus } }, { projection: { sku: 1 } }).toArray()).map(d => d.sku));
  const missing = STICKER_SHEETS.filter(s => !existing.has(s.sku));
  if (!missing.length) { console.log('🏷️  Sticker sheets up to date'); return 0; }
  const [top] = await productsRef.find().sort({ id: -1 }).limit(1).toArray();
  let nextId = (top ? top.id : 0) + 1;
  const now = new Date();
  const docs = missing.map(s => {
    const id = nextId++;
    return {
      _id: id, id, sku: s.sku, name: s.name,
      category: s.category, productType: 'Stickers',
      price: STICKER_PRICE, originalPrice: STICKER_ORIGINAL_PRICE, pricingSource: 'manual',
      badge: s.newArrival ? 'New' : '', description: s.description,
      stockQuantity: 0, keywords: s.keywords, image: s.image, stickerCount: s.stickerCount,
      showInBestsellers: false, showInNewArrivals: !!s.newArrival, showInGrossing: false,
      createdAt: now
    };
  });
  await productsRef.insertMany(docs);
  console.log(`🏷️  Added ${docs.length} sticker sheet${docs.length === 1 ? '' : 's'} to the catalogue`);
  return docs.length;
}

module.exports = { STICKER_SHEETS, seedStickerSheets, STICKER_PRICE, STICKER_ORIGINAL_PRICE };
