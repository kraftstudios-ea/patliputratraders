// Canonical per-product-type variant + pricing config. Every price delta a
// shopper can pick (poster size, plate diameter, wallpaper roll size) lives
// here so the server is the single source of truth for order pricing —
// never trust a client-submitted price.
//
// The frontend keeps a matching copy in public/cart.js (browser code can't
// require this Node module without a bundler) — keep both in sync when
// adding a product type or changing a price delta.
const PRODUCT_TYPES = {
  poster_2_pack: {
    label: '2-Poster Pack',
    basePrice: 55, // 2-pack poster base price
    inclusivePricing: true,
    gstRate: 0.18,
    printsterCost: {
      size: { A4: 40, A5: 30, A3: 60, '12x18': 90, '13x19': 120 }
    },
    description: 'A curated 2-split art pack. Museum-quality posters printed on premium ivory cheddar sheets for outstanding color reproduction.',
    variantGroups: [
      {
        key: 'size',
        label: 'Size (Per Poster)',
        defaultValue: 'A4',
        options: [
          { value: 'A4', label: 'A4 (8.3 × 11.7″)', priceDelta: 0 },
          { value: 'A3', label: 'A3 (11.7 × 16.5″)', priceDelta: 20 },
          { value: 'A5', label: 'A5 (5.8 × 8.3″)', priceDelta: -20 },
          { value: '12x18', label: '12×18″', priceDelta: 60 },
          { value: '13x19', label: '13×19″', priceDelta: 100 },
          { value: '8x10', label: '8×10″ (Out of Stock)', priceDelta: 0, available: false },
          { value: '10x10', label: '10×10″ (Out of Stock)', priceDelta: 0, available: false },
          { value: '11x14', label: '11×14″ (Out of Stock)', priceDelta: 0, available: false },
          { value: '12x16', label: '12×16″ (Out of Stock)', priceDelta: 0, available: false },
          { value: '14x14', label: '14×14″ (Out of Stock)', priceDelta: 0, available: false },
          { value: '12x24', label: '12×24″ (Out of Stock)', priceDelta: 0, available: false },
          { value: '16x24', label: '16×24″ (Out of Stock)', priceDelta: 0, available: false },
          { value: '18x24', label: '18×24″ (Out of Stock)', priceDelta: 0, available: false }
        ]
      },
      {
        key: 'gsm',
        label: 'Paper GSM',
        defaultValue: '300',
        options: [
          { value: '300', label: '300 GSM', priceDelta: 0 },
          { value: '225', label: '225 GSM', priceDelta: -4 },
          { value: '175', label: '175 GSM', priceDelta: -8 }
        ]
      },
      {
        key: 'finish',
        label: 'Finish',
        defaultValue: 'matte',
        options: [
          { value: 'matte', label: 'Matte Finish', priceDelta: 0 },
          { value: 'glossy', label: 'Glossy Finish', priceDelta: 0 }
        ]
      }
    ]
  },

  poster_3_pack: {
    label: '3-Poster Pack',
    basePrice: 79, // 3-pack poster base price
    inclusivePricing: true,
    gstRate: 0.18,
    printsterCost: {
      size: { A4: 60, A5: 45, A3: 90, '12x18': 135, '13x19': 180 }
    },
    description: 'A curated 3-split scenery pack. Museum-quality posters printed on premium ivory cheddar sheets for outstanding color reproduction.',
    variantGroups: [
      {
        key: 'size',
        label: 'Size (Per Poster)',
        defaultValue: 'A4',
        options: [
          { value: 'A4', label: 'A4 (8.3 × 11.7″)', priceDelta: 0 },
          { value: 'A3', label: 'A3 (11.7 × 16.5″)', priceDelta: 30 },
          { value: 'A5', label: 'A5 (5.8 × 8.3″)', priceDelta: -30 },
          { value: '12x18', label: '12×18″', priceDelta: 90 },
          { value: '13x19', label: '13×19″', priceDelta: 150 },
          { value: '8x10', label: '8×10″ (Out of Stock)', priceDelta: 0, available: false },
          { value: '10x10', label: '10×10″ (Out of Stock)', priceDelta: 0, available: false },
          { value: '11x14', label: '11×14″ (Out of Stock)', priceDelta: 0, available: false },
          { value: '12x16', label: '12×16″ (Out of Stock)', priceDelta: 0, available: false },
          { value: '14x14', label: '14×14″ (Out of Stock)', priceDelta: 0, available: false },
          { value: '12x24', label: '12×24″ (Out of Stock)', priceDelta: 0, available: false },
          { value: '16x24', label: '16×24″ (Out of Stock)', priceDelta: 0, available: false },
          { value: '18x24', label: '18×24″ (Out of Stock)', priceDelta: 0, available: false }
        ]
      },
      {
        key: 'gsm',
        label: 'Paper GSM',
        defaultValue: '300',
        options: [
          { value: '300', label: '300 GSM', priceDelta: 0 },
          { value: '225', label: '225 GSM', priceDelta: -6 },
          { value: '175', label: '175 GSM', priceDelta: -12 }
        ]
      },
      {
        key: 'finish',
        label: 'Finish',
        defaultValue: 'matte',
        options: [
          { value: 'matte', label: 'Matte Finish', priceDelta: 0 },
          { value: 'glossy', label: 'Glossy Finish', priceDelta: 0 }
        ]
      }
    ]
  },

  poster_pack_5: {
    label: '5-Poster Wall Pack',
    basePrice: 99, // A5 unframed
    inclusivePricing: true,
    gstRate: 0.18,
    description: 'Curated 5-poster gallery wall pack printed on museum-grade 300 GSM art card. Choose between compact A5, standard A4, or statement A3, unframed or gallery framed.',
    variantGroups: [
      {
        key: 'size',
        label: 'Poster Size',
        defaultValue: 'A5',
        options: [
          { value: 'A5', label: 'A5 (5.8 × 8.3″) · Compact Wall', priceDelta: 0 },
          { value: 'A4', label: 'A4 (8.3 × 11.7″) · Standard Wall', priceDelta: 50 }, // 99 + 50 = 149
          { value: 'A3', label: 'A3 (11.7 × 16.5″) · Statement Wall', priceDelta: 150 } // 99 + 150 = 249
        ]
      },
      {
        key: 'frame',
        label: 'Framing',
        defaultValue: 'none',
        options: [
          { value: 'none', label: 'Just Posters (Unframed)', priceDelta: 0 },
          { value: 'framed_a5', label: 'Gallery Framed', priceDelta: 200, onlyWith: { size: ['A5'] } }, // 99 + 200 = 299
          { value: 'framed_a4', label: 'Gallery Framed', priceDelta: 350, onlyWith: { size: ['A4'] } }, // 149 + 350 = 499
          { value: 'framed_a3', label: 'Gallery Framed', priceDelta: 650, onlyWith: { size: ['A3'] } }  // 249 + 650 = 899
        ]
      }
    ]
  },

  poster_pack_10: {
    label: '10-Poster Wall Pack',
    basePrice: 169, // A5 unframed
    inclusivePricing: true,
    gstRate: 0.18,
    description: 'Curated 10-poster gallery wall pack printed on museum-grade 300 GSM art card. Choose between compact A5, standard A4, or statement A3, unframed or gallery framed.',
    variantGroups: [
      {
        key: 'size',
        label: 'Poster Size',
        defaultValue: 'A5',
        options: [
          { value: 'A5', label: 'A5 (5.8 × 8.3″) · Compact Wall', priceDelta: 0 },
          { value: 'A4', label: 'A4 (8.3 × 11.7″) · Standard Wall', priceDelta: 90 }, // 169 + 90 = 259
          { value: 'A3', label: 'A3 (11.7 × 16.5″) · Statement Wall', priceDelta: 280 } // 169 + 280 = 449
        ]
      },
      {
        key: 'frame',
        label: 'Framing',
        defaultValue: 'none',
        options: [
          { value: 'none', label: 'Just Posters (Unframed)', priceDelta: 0 },
          { value: 'framed_a5', label: 'Gallery Framed', priceDelta: 380, onlyWith: { size: ['A5'] } }, // 169 + 380 = 549
          { value: 'framed_a4', label: 'Gallery Framed', priceDelta: 640, onlyWith: { size: ['A4'] } }, // 259 + 640 = 899
          { value: 'framed_a3', label: 'Gallery Framed', priceDelta: 1150, onlyWith: { size: ['A3'] } } // 449 + 1150 = 1599
        ]
      }
    ]
  },

  poster_pack_15: {
    label: '15-Poster Wall Pack',
    basePrice: 239, // A5 unframed
    inclusivePricing: true,
    gstRate: 0.18,
    description: 'Curated 15-poster gallery wall pack printed on museum-grade 300 GSM art card. Choose between compact A5, standard A4, or statement A3, unframed or gallery framed.',
    variantGroups: [
      {
        key: 'size',
        label: 'Poster Size',
        defaultValue: 'A5',
        options: [
          { value: 'A5', label: 'A5 (5.8 × 8.3″) · Compact Wall', priceDelta: 0 },
          { value: 'A4', label: 'A4 (8.3 × 11.7″) · Standard Wall', priceDelta: 110 }, // 239 + 110 = 349
          { value: 'A3', label: 'A3 (11.7 × 16.5″) · Statement Wall', priceDelta: 390 } // 239 + 390 = 629
        ]
      },
      {
        key: 'frame',
        label: 'Framing',
        defaultValue: 'none',
        options: [
          { value: 'none', label: 'Just Posters (Unframed)', priceDelta: 0 },
          { value: 'framed_a5', label: 'Gallery Framed', priceDelta: 560, onlyWith: { size: ['A5'] } }, // 239 + 560 = 799
          { value: 'framed_a4', label: 'Gallery Framed', priceDelta: 950, onlyWith: { size: ['A4'] } }, // 349 + 950 = 1299
          { value: 'framed_a3', label: 'Gallery Framed', priceDelta: 1670, onlyWith: { size: ['A3'] } } // 629 + 1670 = 2299
        ]
      }
    ]
  },

  poster_pack_20: {
    label: '20-Poster Wall Pack',
    basePrice: 309, // A5 price (cost 20 x 14 = 280)
    inclusivePricing: true,
    gstRate: 0.18,
    description: 'Curated 20-poster gallery wall pack printed on museum-grade 300 GSM art card. Choose between compact A5, standard A4, or statement A3, unframed or gallery framed.',
    variantGroups: [
      {
        key: 'size',
        label: 'Poster Size',
        defaultValue: 'A5',
        options: [
          { value: 'A5', label: 'A5 (5.8 × 8.3″) · Compact Wall', priceDelta: 0 },
          { value: 'A4', label: 'A4 (8.3 × 11.7″) · Statement Wall', priceDelta: 140 }, // 309 + 140 = 449
          { value: 'A3', label: 'A3 (11.7 × 16.5″) · Statement Wall', priceDelta: 490 } // 309 + 490 = 799
        ]
      },
      {
        key: 'frame',
        label: 'Framing',
        defaultValue: 'none',
        options: [
          { value: 'none', label: 'Just Posters (Unframed)', priceDelta: 0 },
          { value: 'framed_a5', label: 'Gallery Framed', priceDelta: 690, onlyWith: { size: ['A5'] } }, // 309 + 690 = 999
          { value: 'framed_a4', label: 'Gallery Framed', priceDelta: 1250, onlyWith: { size: ['A4'] } }, // 449 + 1250 = 1699
          { value: 'framed_a3', label: 'Gallery Framed', priceDelta: 2100, onlyWith: { size: ['A3'] } } // 799 + 2100 = 2899
        ]
      }
    ]
  },

  poster_pack_25: {
    label: '25-Poster Wall Pack',
    basePrice: 369, // A5 price (cost 25 x 14 = 350)
    inclusivePricing: true,
    gstRate: 0.18,
    description: 'Curated 25-poster gallery wall pack printed on museum-grade 300 GSM art card. Choose between compact A5 or statement A4 dimensions.',
    variantGroups: [
      {
        key: 'size',
        label: 'Poster Size',
        defaultValue: 'A5',
        options: [
          { value: 'A5', label: 'A5 (5.8 × 8.3″) · Compact Wall', priceDelta: 0 },
          { value: 'A4', label: 'A4 (8.3 × 11.7″) · Statement Wall', priceDelta: 200 } // 369 + 200 = 569 (cost 550)
        ]
      }
    ]
  },

  // ------------------------------------------------------------------
  // T-SHIRTS are fulfilled by supplier. Poster prints by Printster. Shelf price = supplier + margin) × 1.15) — the 15% Brush
  // margin. GST and shipping are NOT in the shelf price; they're added once
  // per order at checkout by orderCharges() below.
  // Rates for T-Shirts:
  //   UC21 Classic Crew ₹190 · UC48 Stretch ₹260 · MP25 Polo ₹320
  //   Print per tee = back A3 (193 sq.in × ₹0.75 = ₹145) + chest pocket
  //   (DTF ₹50, DTG ₹60 on a coloured garment).
  // `basePrice` makes these prices absolute: the product's DB `price` is
  // ignored for these types, so every poster/tee is priced from this table.
  // `gstRate` is the GST charged on that type at checkout.
  // ------------------------------------------------------------------
  poster: {
    label: 'Poster',
    // Shelf ladder, inclusive of GST: A5 19 · A4 29 · A3 39 · 12x18 59 · 13x19 79.
    // Round numbers on purpose — the old cost-plus figures (22/32/47/62) read
    // as arithmetic rather than as prices.
    basePrice: 29, // A4 300 GSM
    inclusivePricing: true,
    gstRate: 0.18,   // posters: the print partner bills us 18%; 15% is what we
                     // charge the customer on the cart value
    printsterCost: {
      // Internal Printster pricing. A4=20, A5=15, A3=30, 12x18=45, 13x19=60 (at 300 GSM)
      size: { A4: 20, A5: 15, A3: 30, '12x18': 45, '13x19': 60 }
    },
    description: 'Museum-quality posters printed on premium ivory cheddar sheets for outstanding color reproduction. Available in multiple true-to-size dimensions with matte or glossy finish.',
    variantGroups: [
      {
        key: 'size',
        label: 'Size',
        defaultValue: 'A4',
        options: [
          { value: 'A4', label: 'A4 (8.3 × 11.7″)', priceDelta: 0 },
          { value: 'A3', label: 'A3 (11.7 × 16.5″)', priceDelta: 10 },
          { value: 'A5', label: 'A5 (5.8 × 8.3″)', priceDelta: -10 },
          { value: '12x18', label: '12×18″', priceDelta: 30 },
          { value: '13x19', label: '13×19″', priceDelta: 50 },

          /* Legacy options marked unavailable */
          { value: '8x10', label: '8×10″ (Out of Stock)', priceDelta: 0, available: false },
          { value: '10x10', label: '10×10″ (Out of Stock)', priceDelta: 0, available: false },
          { value: '11x14', label: '11×14″ (Out of Stock)', priceDelta: 0, available: false },
          { value: '12x16', label: '12×16″ (Out of Stock)', priceDelta: 0, available: false },
          { value: '14x14', label: '14×14″ (Out of Stock)', priceDelta: 0, available: false },
          { value: '12x24', label: '12×24″ (Out of Stock)', priceDelta: 0, available: false },
          { value: '16x24', label: '16×24″ (Out of Stock)', priceDelta: 0, available: false },
          { value: '18x24', label: '18×24″ (Out of Stock)', priceDelta: 0, available: false }
        ]
      },
      {
        key: 'gsm',
        label: 'Quality (GSM)',
        defaultValue: '300',
        options: [
          { value: '300', label: '300 GSM', priceDelta: 0 },
          { value: '225', label: '225 GSM', priceDelta: -2 },
          { value: '175', label: '175 GSM', priceDelta: -4 }
        ]
      },
      {
        key: 'finish',
        label: 'Finish',
        defaultValue: 'matte',
        options: [
          { value: 'matte', label: 'Matte', priceDelta: 0 },
          { value: 'glossy', label: 'Glossy', priceDelta: 0 }
        ]
      },
      {
        key: 'frame',
        label: 'Frame',
        defaultValue: 'none',
        options: [
          { value: 'none', label: 'No Frame (Print Only)', priceDelta: 0 },
          { value: 'black_a4', label: 'Black Frame', priceDelta: 470, swatch: '#111111', onlyWith: { size: ['A4'] } },
          { value: 'white_a4', label: 'White Frame', priceDelta: 470, swatch: '#f5f5f5', onlyWith: { size: ['A4'] } },
          { value: 'black_a3', label: 'Black Frame', priceDelta: 720, swatch: '#111111', onlyWith: { size: ['A3'] } },
          { value: 'white_a3', label: 'White Frame', priceDelta: 720, swatch: '#f5f5f5', onlyWith: { size: ['A3'] } },
          { value: 'black_12x18', label: 'Black Frame', priceDelta: 700, swatch: '#111111', onlyWith: { size: ['12x18'] } },
          { value: 'white_12x18', label: 'White Frame', priceDelta: 700, swatch: '#f5f5f5', onlyWith: { size: ['12x18'] } }
        ]
      }
    ]
  },
  apparel: {
    label: 'T-Shirt',
    basePrice: 599, // Classic Crew (uc21) DTF/DTG — XS to 2XL ₹599
    inclusivePricing: true,
    gstRate: 0.18,
    variantGroups: [
      {
        key: 'style',
        label: 'Fit',
        defaultValue: 'uc21',
        options: [
          { value: 'uc21', label: 'Classic Crew · 180 GSM', priceDelta: 0 },         // ₹599
          { value: 'uc48', label: 'Unisex Stretch Tee · 240 GSM', priceDelta: -40 }  // ₹559
        ]
      },
      {
        key: 'print',
        label: 'Print',
        defaultValue: 'dtf',
        options: [
          { value: 'dtf', label: 'DTF', priceDelta: 0 },
          { value: 'dtg', label: 'DTG', priceDelta: 0 }
        ]
      },
      {
        key: 'size',
        label: 'Size',
        defaultValue: 'M',
        options: [
          { value: 'XS', label: 'XS', priceDelta: 0 },
          { value: 'S', label: 'S', priceDelta: 0 },
          { value: 'M', label: 'M', priceDelta: 0 },
          { value: 'L', label: 'L', priceDelta: 0 },
          { value: 'XL', label: 'XL', priceDelta: 0 },
          { value: '2XL', label: '2XL', priceDelta: 0 },
          { value: '3XL', label: '3XL', priceDelta: 30, onlyWith: { style: ['uc21'] } }, // ₹629 for Classic Crew
          { value: '3XL', label: '3XL', priceDelta: 20, onlyWith: { style: ['uc48'] } }  // ₹579 for Stretch Tee (559 + 20)
        ]
      }
    ]
  },
  // ------------------------------------------------------------------
  // Unisex Oversized Hoodie | UH32 — Qikink. 400 GSM, 90% cotton /
  // 10% polyester, super-combed, bio-washed, pre-shrunk, drop shoulder,
  // derby ribbed hem & cuff. Seven stock colours, S-3XL.
  // Rates read off qikink.com/custom/hoodies/oversized-hoodie-uh32/ and
  // the Qikink 2026 rate card, Sep 2026 — all ex-GST, ex-shipping:
  //   Garment UH32 ............................... Rs 700
  //   Back print A3 (11.7x16.5in = 193 sq.in) .... Rs 145  (DTG/DTF Rs 0.75/sq.in)
  //   Left-chest print (4x4in, "pocket") ......... Rs 40
  //   Puff-White vinyl, chest .................... Rs 100  (Rs 2.00/sq.in, Rs 100 floor)
  // Every Brush hoodie is printed back-A3 + left-chest, so the standard
  // print cost is 145 + 40 = Rs 185. Choosing Puff swaps the flat chest
  // print for raised vinyl: 145 + 100 = Rs 245.
  // Shelf = ceil((garment + print) x 1.15), the same 15% margin as posters
  // and tees:
  //   DTF / DTG .... ceil(885 x 1.15) = Rs 1018   (base)
  //   Puff chest ... ceil(945 x 1.15) = Rs 1087   (+Rs 69)
  // HEADS UP: Qikink ships a hoodie for Rs 108, not the Rs 54 flat rate in
  // ORDER_CHARGES below — a hoodie-only order currently under-recovers
  // shipping by Rs 54. See the note on ORDER_CHARGES.shipping.
  // ------------------------------------------------------------------
  hoodie: {
    label: 'Oversized Hoodie',
    basePrice: 1199,
    inclusivePricing: true,
    gstRate: 0.18,
    qikinkCost: {
      garment: { uh32: 700 },
      print: { dtf: 185, dtg: 185, puff: 245 }
    },
    // Max printable area per placement, straight from Qikink's DTF guide.
    // Not priced — shown on the product page so a buyer knows what fits.
    printAreas: {
      back: { label: 'Back', max: '11.7 x 16.5 in (A3)' },
      chest: { label: 'Left chest', max: '4 x 4 in' },
      sleeve: { label: 'Sleeve', max: '4 x 4 in' },
      frontHood: { label: 'Front (below hood)', max: '10 x 10 in' }
    },
    sizeChart: {
      units: 'in',
      columns: ['Chest', 'Length'],
      rows: {
        S: [40, 27], M: [42, 28], L: [44, 29],
        XL: [46, 30], '2XL': [48, 31], '3XL': [50, 32]
      }
    },
    variantGroups: [
      {
        key: 'print',
        label: 'Print Finish',
        defaultValue: 'dtf',
        options: [
          // Same Qikink rate (Rs 0.75/sq.in) either way — the choice is
          // finish, not price. DTF sits slightly on the surface and is the
          // more durable on a 400 GSM fleece; DTG soaks in and feels softer.
          { value: 'dtf', label: 'DTF · crisp, most durable', priceDelta: 0 },
          { value: 'dtg', label: 'DTG · softest hand-feel', priceDelta: 0 },
          { value: 'puff', label: 'Puff-White chest · raised vinyl', priceDelta: 69 }
        ]
      },
      {
        key: 'size',
        label: 'Size',
        defaultValue: 'M',
        options: [
          { value: 'S', label: 'S', priceDelta: 0 },
          { value: 'M', label: 'M', priceDelta: 0 },
          { value: 'L', label: 'L', priceDelta: 0 },
          { value: 'XL', label: 'XL', priceDelta: 0 },
          { value: '2XL', label: '2XL', priceDelta: 0 },
          { value: '3XL', label: '3XL', priceDelta: 0 }
        ]
      }
    ]
  },
  // ------------------------------------------------------------------
  // WALL TAPESTRY — Qikink. Soft-touch polyester wall hanging, printed
  // edge to edge, hemmed, with metal grommets in all four corners and
  // adhesive screws in the box. Seven sizes, no minimum order.
  //
  // Qikink rate card (Oct 2026), per piece, ex-GST:
  //   24x24  150   26x36  190   30x40  240   35x45  315
  //   40x50  345   48x54  440   54x84  see note
  //   + shipping 54 flat, + COD 34 (we don't offer COD on these)
  //   + GST, which Qikink bills as 5% on the product and 18% on the
  //     shipping/COD lines.
  //
  // SHELF PRICE = ceil-to-x9( (product + shipping + GST) x 1.10 ) — the
  // 10% Brush margin. Unlike tees and hoodies, Qikink's Rs 54 shipping is
  // INSIDE the shelf price here: a tapestry over Rs 599 ships free to the
  // customer (ORDER_CHARGES.freeShippingThreshold), so leaving shipping to
  // be recovered at checkout would hand the whole margin back on the large
  // sizes. COD is excluded because tapestries are never shipped COD.
  //
  //   size     qikink   landed(ex-COD)   x1.10    shelf
  //   24x24      150        227          249.7     259
  //   26x36      190        269          295.9     299
  //   30x40      240        322          354.2     359   <- base
  //   35x45      315        401          441.1     449
  //   40x50      345        432          475.2     479
  //   48x54      440        532          585.2     589
  //   54x84        *       1434         1577.4    1579
  //
  //   * UNCONFIRMED. Qikink's sheet lists product Rs 760 but a total of
  //     Rs 1468, which its own components (760+54+34+54) don't reach —
  //     they come to Rs 902, and the Rs 54 GST cell corroborates the
  //     Rs 760 product cost (0.05 x 760 + 0.18 x 88 = 53.8). Priced off
  //     the Rs 1468 total as instructed. If Rs 902 turns out to be the
  //     real landed cost, the 10% price is Rs 959 — change the 54x84
  //     priceDelta from 1220 to 600.
  // ------------------------------------------------------------------
  tapestry: {
    label: 'Wall Tapestry',
    basePrice: 359,            // 30x40 in
    inclusivePricing: true,    // shelf price is the number below, GST inside it
    gstRate: 0.18,
    qikinkCost: {
      // Product + printing only. Shipping (54) and GST are added in the
      // shelf ladder above; COD (34) is never incurred.
      size: { '24x24': 150, '26x36': 190, '30x40': 240, '35x45': 315,
              '40x50': 345, '48x54': 440, '54x84': 1326 }
    },
    description: 'Soft-touch printed wall tapestry, hemmed on all four sides with metal grommets in every corner. Ships with four adhesive screws, so it goes up in minutes without a drill. Seven sizes, printed to order.',
    variantGroups: [
      {
        key: 'size',
        label: 'Size',
        defaultValue: '30x40',
        options: [
          { value: '24x24', label: '24 x 24"', priceDelta: -100 },   // 259
          { value: '26x36', label: '26 x 36"', priceDelta: -60 },    // 299
          { value: '30x40', label: '30 x 40"', priceDelta: 0 },      // 359
          { value: '35x45', label: '35 x 45"', priceDelta: 90 },     // 449
          { value: '40x50', label: '40 x 50"', priceDelta: 120 },    // 479
          { value: '48x54', label: '48 x 54"', priceDelta: 230 },    // 589
          { value: '54x84', label: '54 x 84"', priceDelta: 1220 }    // 1579
        ]
      }
    ]
  },
  // ------------------------------------------------------------------
  // METAL POSTER — existing shelf prices and size ladder.
  // ------------------------------------------------------------------
  // METAL POSTER — 10% Brush margin over total cost (product, shipping, COD, GST)
  //   8x11.7 in    Cost ₹521 × 1.10 = ₹573.1 -> ₹579 (base)
  //   11.7x15.7 in Cost ₹821 × 1.10 = ₹903.1 -> ₹909 (+₹330)
  // ------------------------------------------------------------------
  metal: {
    label: 'Metal Poster',
    basePrice: 579,            // 8x11.7 in
    inclusivePricing: true,
    gstRate: 0.18,
    description: 'Artwork printed directly onto a rigid aluminium panel with a fine satin finish — no glass, no frame, no glare. Rounded corners, pre-drilled for a flush magnetic mount.',
    variantGroups: [
      {
        key: 'size',
        label: 'Size',
        defaultValue: '8x11.7',
        options: [
          { value: '8x11.7', label: '8 × 11.7"', priceDelta: 0 },       // ₹579
          { value: '11.7x15.7', label: '11.7 × 15.7"', priceDelta: 330 } // ₹909
        ]
      }
    ]
  },
  // Every remaining type is tax-INCLUSIVE too. Shelf prices are what we charge:
  // without this flag unitPrice() grossed the DB price up by the GST rate at
  // checkout, so a sticker sheet listed at Rs 93 was added to the cart at
  // Rs 110, a wallpaper at Rs 1769 became Rs 2087 and a collectible at
  // Rs 4719 became Rs 5568 — 33 products advertising one price and charging
  // another, 18% higher. Posters and apparel were never affected (they carry
  // basePrice/inclusivePricing already). The storefront says "inclusive of
  // taxes" everywhere; now every type actually is.
  plate: {
    label: 'Decorative Plate',
    inclusivePricing: true,
    gstRate: 0.18,
    variantGroups: [
      {
        key: 'size',
        label: 'Plate Size',
        options: [
          { value: '8in', label: '8" Round', priceDelta: 0 },
          { value: '10in', label: '10" Round', priceDelta: 80 },
          { value: '12in', label: '12" Round', priceDelta: 150 }
        ]
      }
    ]
  },
  wallpaper: {
    label: 'Wallpaper',
    inclusivePricing: true,
    gstRate: 0.18,
    variantGroups: [
      {
        key: 'roll',
        label: 'Roll Size',
        options: [
          { value: '1x3m', label: '1m × 3m Roll', priceDelta: 0 },
          { value: '1.5x3m', label: '1.5m × 3m Roll', priceDelta: 300 }
        ]
      }
    ]
  },
  digital: {
    label: 'Digital Asset',
    basePrice: 79,
    inclusivePricing: true,
    gstRate: 0.18,
    variantGroups: []
  },
  generic: {
    // Stickers, collectibles and anything uploaded through the admin panel
    // land here. Inclusive so an admin who types 93 into the price field
    // gets a product that sells for 93.
    label: 'Product',
    inclusivePricing: true,
    gstRate: 0.18,
    variantGroups: []
  }
};

// category -> productType. Anything not listed here defaults to 'poster',
// which covers all pre-existing categories without a migration.
const CATEGORY_PRODUCT_TYPE = {
  'Chandeliers': 'generic',
  'Decorative Wall Lamps': 'generic',
  'Pendant & Hanging Lights': 'generic',
  'Ceiling & Chandelier Fans': 'generic',
  'Spot & Track Lights': 'generic',
  'COB & Downlights': 'generic',
  'Profile & Linear Lights': 'generic',
  'Strip & Rope Lights': 'generic',
  'Outdoor & Landscape Lights': 'generic',
  'Table & Floor Lamps': 'generic',
  'Smart & Utility Lighting': 'generic',
  'Lights': 'generic',
  'Plates': 'plate',
  'Tapestry': 'tapestry',
  'Tapestries': 'tapestry',
  'Metal Posters': 'metal',
  'Framed Posters': 'poster',
  'Framed Poster': 'poster',
  'Wallpaper': 'wallpaper',
  'T-Shirts': 'apparel',
  'Hoodies': 'hoodie',
  'Digital Assets': 'digital',
  'Digital': 'digital'
};

// Maps whatever productType string a product carries ('Posters', 'poster',
// 'apparel', 'Wallpapers', …) onto a config key. Unknown types (stickers,
// collectibles) get 'generic' — no variants, DB price as-is — instead of
// silently inheriting poster sizes and poster pricing.
function normalizeProductType(productType, category) {
  const t = String(productType || '').trim().toLowerCase();
  if (!t) {
    const c = String(category || '').trim().toLowerCase();
    if (c === 't-shirts') return 'apparel';
    if (c === 'hoodies') return 'hoodie';
    if (c === 'plates') return 'plate';
    if (c === 'wallpaper' || c === 'wallpapers') return 'wallpaper';
    if (c === 'tapestry' || c === 'tapestries') return 'tapestry';
    if (c === 'metal posters' || c === 'metal poster') return 'metal';
    if (c === 'framed posters' || c === 'framed poster' || c === 'framed') return 'poster';
    if (c === 'digital assets' || c === 'digital' || c === 'digital asset') return 'digital';
    if (c.includes('chandelier') || c.includes('lamp') || c.includes('light') || c.includes('fan') || c.includes('spot') || c.includes('cob') || c.includes('profile') || c.includes('strip') || c.includes('rope')) return 'generic';
    return 'generic';
  }
  if (t === 'metal' || t === 'metal poster' || t === 'metal posters') return 'metal';
  if (t === 'framed_poster' || t === 'framed poster' || t === 'framed posters' || t === 'framed') return 'poster';
  if (t === 'tapestry' || t === 'tapestries') return 'tapestry';
  if (t === 'poster' || t === 'posters') return 'poster';
  if (t === 'poster_2_pack') return 'poster_2_pack';
  if (t === 'poster_3_pack') return 'poster_3_pack';
  if (t === 'poster_pack_5') return 'poster_pack_5';
  if (t === 'poster_pack_10') return 'poster_pack_10';
  if (t === 'poster_pack_15') return 'poster_pack_15';
  if (t === 'poster_pack_20') return 'poster_pack_20';
  if (t === 'poster_pack_25') return 'poster_pack_25';
  if (t === 'apparel' || t === 't-shirt' || t === 'tshirt' || t === 't-shirts') return 'apparel';
  if (t === 'hoodie' || t === 'hoodies') return 'hoodie';
  if (t === 'plate' || t === 'plates') return 'plate';
  if (t === 'wallpaper' || t === 'wallpapers') return 'wallpaper';
  if (t === 'digital' || t === 'digital asset' || t === 'digital assets' || t === 'digital_asset') return 'digital';
  return 'generic';
}

function optionAllowed(option, chosen) {
  if (!option.onlyWith) return true;
  return Object.keys(option.onlyWith).every(k => option.onlyWith[k].includes(chosen[k]));
}

// Resolves a (possibly partial / tampered) variant selection to a valid
// combination, group by group in order. An option that is missing, unknown
// or not allowed with the earlier choices (e.g. DTG on a Polo, 3XL on the
// Classic Crew) falls back to the group's default — so a request can only
// ever resolve to a real, known price.
function resolveVariants(typeConfig, submitted) {
  const chosen = {};
  let delta = 0;
  (typeConfig.variantGroups || []).forEach(group => {
    const allowed = group.options.filter(o => optionAllowed(o, chosen) && o.available !== false);
    const want = submitted ? submitted[group.key] : undefined;
    let option = allowed.find(o => o.value === want);
    if (!option && want && group.key === 'frame') {
      if (want.startsWith('black')) option = allowed.find(o => o.value.startsWith('black'));
      else if (want.startsWith('white')) option = allowed.find(o => o.value.startsWith('white'));
      else if (want === 'framed' || want.startsWith('framed')) option = allowed.find(o => o.value.startsWith('framed') || o.value === 'framed');
      else if (want === 'none' || want === 'unframed') option = allowed.find(o => o.value === 'none' || o.value === 'unframed');
    }
    if (!option) {
      option = allowed.find(o => o.value === group.defaultValue) || allowed[0];
    }
    if (!option) return;
    chosen[group.key] = option.value;
    delta += option.priceDelta;
  });
  return { variants: chosen, delta };
}

function unitPrice(dbPrice, typeConfig, submitted) {
  const { variants, delta } = resolveVariants(typeConfig, submitted);
  const base = ((typeConfig === PRODUCT_TYPES.poster_3_pack || typeConfig === PRODUCT_TYPES.poster_2_pack) && Number(dbPrice) > 0)
    ? Number(dbPrice)
    : (typeof typeConfig.basePrice === 'number' ? typeConfig.basePrice : Number(dbPrice) || 0);
  const rate = typeConfig.gstRate || 0;
  // `inclusivePricing` types carry the shelf price itself (GST already in it),
  // so the ladder stays on the round numbers it was set to — posters are
  // 19/29/39/59/79 and never 29.5 or 34. Everything else is still quoted
  // ex-GST here and grossed up.
  const gross = typeConfig.inclusivePricing ? (base + delta) : (base + delta) * (1 + rate);
  // Multi-poster packs land on a multiple of 5 (`priceRounding`), so a pack
  // never reads as an odd sum of its parts — 3 x 29 shows as 85, not 87.
  const step = Number(typeConfig.priceRounding) || 0;
  const price = step > 0 ? Math.round(gross / step) * step : Math.round(gross);
  return { price, variants };
}

// Per-order charges added at checkout, on top of shelf prices.
// Shelf prices are tax-INCLUSIVE: unitPrice() marks the base up by the type's
// rate, and orderCharges() extracts the tax back out of the (discounted) cart
// value for display. So `tax` here is a component of `taxableValue`, not an
// addition to it — the total adds only delivery and fees on top.
// ── Order-level charges ────────────────────────────────────────
// Everything a shopper is charged on top of the items, in one place. The
// server is the only authority: the browser mirrors this in public/cart.js
// purely to preview a total, and every figure is recomputed here at checkout.
//
// TAX. Deliberately not called GST in the UI — the storefront says "Taxes"
// with a tooltip, because the split into CGST/SGST/IGST depends on the
// delivery state and is settled on the invoice, not in the cart. Rates are
// per product type (see each type's gstRate) and are charged on the
// DISCOUNTED cart value only — never on shipping, COD or the handling fee.
//
// DISCOUNTS stack in a fixed order, and every threshold below is tested
// against the pre-discount cart value so a discount can never disqualify the
// next one:
//   1. launch offer   flat Rs 50 once the cart reaches Rs 399
//   2. coupon         flat, or a percentage OF THE CART VALUE only
// The pair is capped at the cart value, so a total can never go negative.
const ORDER_CHARGES = {
  shipping: 59,
  freeShippingThreshold: 599,      // free delivery above this cart value
  processingFeeRate: 0.02,         // small-cart handling fee
  processingFeeWaiver: 499,        // ...waived above this cart value
  codFee: 34,
  launchOffer: { amount: 50, minCartValue: 399, label: 'Launch offer' },
  // Buy-more offers on posters: pay for `buy`, leave with `get`. The free
  // ones are billed off at the price of the CHEAPEST poster in the cart, so
  // the offer can never be gamed by mixing one A5 with four 13x19s. Only the
  // highest tier a cart reaches applies — they don't stack.
  posterBundles: [
    { buy: 30, get: 36, free: 6, label: 'Buy 30 Get 6 Free' },
    { buy: 20, get: 24, free: 4, label: 'Buy 20 Get 4 Free' },
    { buy: 10, get: 13, free: 3, label: 'Buy 10 Get 3 Free', recommended: true },
    { buy: 5, get: 6, free: 1, label: 'Buy 5 Get 1 Free' }
  ],
  // Delivery choices shown to the customer. `surcharge` is what they pay ON
  // TOP of standard shipping; standard is included in the Rs 59 (or free).
  //
  // Priced from the courier rate card for a 0.5 kg parcel — costs kept here,
  // server-side, and never sent to the browser:
  //   DTDC Surface 0.5kg  62.89   <- default, included
  //   DTDC Air 0.5kg      82.84   <- +19.95 over standard, charged 30
  //   BlueDart Air 0.5kg  84.37   <- +21.48 over standard, charged 45
  // NOTE: standard already runs at a small loss (Rs 59 charged vs Rs 62.89
  // cost) before the free-shipping threshold is considered. Worth revisiting.
  // Only one priced tier. A shopper who wants a particular courier or a
  // faster service asks for it at checkout as a preference; the team quotes
  // any extra separately and takes the shopper's agreement before dispatch,
  // so nothing here is charged for it.
  deliveryOptions: [
    { value: 'standard', label: 'Standard', courier: 'Surface', surcharge: 0, note: 'Included' }
  ],
  defaultDeliveryOption: 'standard'
};

// Couriers a shopper may name as a preference at checkout. Naming one is a
// request, not a booking: serviceability and any extra charge are settled with
// the shopper by the team before dispatch, so this list is never priced.
const COURIER_PARTNERS = ['DTDC', 'Delhivery', 'FedEx', 'Xpressbees'];

function isKnownCourier(name) {
  return COURIER_PARTNERS.some(c => c.toLowerCase() === String(name || '').trim().toLowerCase());
}

// Posters, poster packs and digital items are settled prepaid only, so a cart containing
// them cannot be paid for on delivery (digital downloads cannot be COD).
const PREPAID_ONLY_TYPES = new Set(['poster', 'digital', 'poster_2_pack', 'poster_3_pack', 'poster_pack_5', 'poster_pack_10', 'poster_pack_15', 'poster_pack_20', 'poster_pack_25']);

function deliveryOptionFor(value) {
  const opts = ORDER_CHARGES.deliveryOptions;
  return opts.find(o => o.value === value) || opts.find(o => o.value === ORDER_CHARGES.defaultDeliveryOption) || opts[0];
}

function cartRequiresPrepaid(lines) {
  return (lines || []).some(l => PREPAID_ONLY_TYPES.has(normalizeProductType(l.productType, l.category)));
}

function cartHasPhysicalItems(lines) {
  return (lines || []).some(l => normalizeProductType(l.productType, l.category) !== 'digital');
}

const round2 = (n) => Math.round(n * 100) / 100;

// What the poster bundle offer gives this cart.
//   qty        posters in the cart (every poster line, any size)
//   freeCount  how many of them are free
//   unitPrice  the cheapest poster price in the cart — what a free one is worth
//   amount     the discount
//   toNext     posters still needed for the next tier (0 when none is left)
function posterBundleReward(lines) {
  const posters = (lines || []).filter(l => normalizeProductType(l.productType, l.category) === 'poster');
  const qty = posters.reduce((n, l) => n + (Number(l.quantity) || 0), 0);
  const tiers = ORDER_CHARGES.posterBundles;
  const tier = tiers.find(t => qty >= t.get) || null;
  const freeCount = tier ? (tier.free != null ? tier.free : tier.get - tier.buy) : 0;
  const next = tiers.slice().reverse().find(t => qty < t.get) || null;

  // Flatten every individual poster item by its quantity to discount lowest-priced posters
  const unitPrices = [];
  posters.forEach(l => {
    const p = Number(l.price) || 0;
    const q = Math.max(0, Number(l.quantity) || 0);
    for (let i = 0; i < q; i++) {
      unitPrices.push(p);
    }
  });
  unitPrices.sort((a, b) => a - b);

  const unitPrice = unitPrices.length ? unitPrices[0] : 0;
  const freeItems = unitPrices.slice(0, freeCount);
  const amount = round2(freeItems.reduce((sum, p) => sum + p, 0));

  return {
    qty,
    tier,
    freeCount,
    unitPrice,
    amount,
    nextTier: next,
    toNext: next ? next.get - qty : 0
  };
}

// lines: [{ price, quantity, productType }]
// opts:  { couponDiscount, manualDiscount, deliveryOption }  (a bare number
//        is accepted as couponDiscount for older callers)
function orderCharges(lines, paymentMethod, opts = {}) {
  const o = (typeof opts === 'number') ? { couponDiscount: opts } : (opts || {});

  // 1. Cart value. Every threshold below is tested against THIS, before any
  //    discount, so applying one discount can never disqualify another.
  let subtotal = 0;
  const priced = (lines || []).map(l => {
    const lineTotal = (Number(l.price) || 0) * (Number(l.quantity) || 0);
    const cfg = PRODUCT_TYPES[normalizeProductType(l.productType, l.category)] || PRODUCT_TYPES.generic;
    subtotal += lineTotal;
    return { lineTotal, rate: cfg.gstRate != null ? cfg.gstRate : 0.18 };
  });
  const hasItems = subtotal > 0;
  const hasPhysical = cartHasPhysicalItems(lines);

  // 2. Discounts, in order, capped so the cart can never go negative.
  const offer = ORDER_CHARGES.launchOffer;
  const launchDiscount = (hasItems && subtotal >= offer.minCartValue) ? offer.amount : 0;
  const bundle = posterBundleReward(lines);
  const bundleDiscount = hasItems ? round2(Math.min(bundle.amount, Math.max(0, subtotal - launchDiscount))) : 0;
  const couponAsked = Math.max(0, Number(o.couponDiscount) || 0);
  const couponDiscount = round2(Math.min(couponAsked, Math.max(0, subtotal - launchDiscount - bundleDiscount)));
  const manualAsked = Math.max(0, Number(o.manualDiscount) || 0);
  const manualDiscount = round2(Math.min(manualAsked, Math.max(0, subtotal - launchDiscount - bundleDiscount - couponDiscount)));
  const discount = round2(Math.min(subtotal, launchDiscount + bundleDiscount + couponDiscount + manualDiscount));
  const taxableValue = round2(subtotal - discount);

  // 3. Tax is now baked into the product price (display price is inclusive)
  // We calculate it only for reporting/breakdown.
  const keptShare = subtotal > 0 ? (subtotal - discount) / subtotal : 0;
  let tax = 0;
  priced.forEach(l => {
    const apportioned = l.lineTotal * keptShare;
    tax += apportioned - (apportioned / (1 + l.rate));
  });
  tax = round2(tax);

  // 4. Fees. None of these are taxed.
  // Digital assets have no delivery fee, no delivery surcharge, and no processing/handling fee.
  let shipping = (hasItems && hasPhysical) ? (subtotal >= ORDER_CHARGES.freeShippingThreshold ? 0 : ORDER_CHARGES.shipping) : 0;
  const delivery = deliveryOptionFor(o.deliveryOption);
  let deliverySurcharge = (hasItems && hasPhysical) ? (Number(delivery.surcharge) || 0) : 0;
  let processingFee = (hasItems && hasPhysical && subtotal < ORDER_CHARGES.processingFeeWaiver)
    ? round2(subtotal * ORDER_CHARGES.processingFeeRate) : 0;
  // A prepaid-only cart never carries a COD fee because it can never be COD.
  let codFee = (hasItems && paymentMethod === 'cod' && !cartRequiresPrepaid(lines)) ? ORDER_CHARGES.codFee : 0;

  const total = Math.round(taxableValue + shipping + deliverySurcharge + codFee + processingFee);

  return {
    subtotal: round2(subtotal),
    launchDiscount: round2(launchDiscount),
    bundleDiscount,
    bundleFreeCount: bundle.freeCount,
    bundleLabel: bundle.tier ? bundle.tier.label : null,
    bundlePosterCount: bundle.qty,
    bundleToNext: bundle.toNext,
    bundleNextLabel: bundle.nextTier ? bundle.nextTier.label : null,
    bundleNextTier: bundle.nextTier ? { buy: bundle.nextTier.buy, get: bundle.nextTier.get, free: (bundle.nextTier.free != null ? bundle.nextTier.free : bundle.nextTier.get - bundle.nextTier.buy), label: bundle.nextTier.label } : null,
    couponDiscount,
    manualDiscount,
    discount,
    taxableValue,
    tax,
    gst: tax,                 // legacy field name, kept so older callers/templates don't break
    shipping,
    deliveryOption: delivery.value,
    deliveryCourier: delivery.courier,
    deliverySurcharge,
    processingFee,
    codFee,
    total
  };
}

function getProductType(category) {
  return CATEGORY_PRODUCT_TYPE[category] || 'poster';
}

// Recomputes price server-side from the submitted variant selections.
// Falls back to each group's first option (delta 0 by convention) when a
// selection is missing or invalid, so a tampered/omitted variant can only
// ever resolve to a real, server-known price — never an arbitrary one.
function priceWithVariants(basePrice, productType, submittedVariants) {
  const typeConfig = PRODUCT_TYPES[normalizeProductType(productType)] || PRODUCT_TYPES.generic;
  const { price, variants } = unitPrice(basePrice, typeConfig, submittedVariants);
  return { price, resolvedVariants: variants };
}

// One-line human description of an order item's variants, e.g. "A4 · 80
// GSM" or "10" Round" — handles both new-shape items (`variants` +
// `productType`) and orders placed before multi-product-type support
// existed (flat `size`/`gsm` fields, always a poster).
function formatVariantLine(item) {
  const productType = normalizeProductType(item.productType || 'poster');
  const typeConfig = PRODUCT_TYPES[productType] || PRODUCT_TYPES.generic;
  const variants = item.variants || (item.size || item.gsm ? { size: item.size || 'A4', gsm: item.gsm || '80' } : null);
  if (!variants) return '';

  return typeConfig.variantGroups
    .filter(group => variants[group.key] !== undefined && (group.key !== 'frame' || variants[group.key] !== 'none'))
    .map(group => {
      const option = group.options.find(o => o.value === variants[group.key]);
      return option ? option.label : `${group.label}: ${variants[group.key]}`;
    })
    .join(' · ');
}

// ==========================================
// DELIVERY ESTIMATE, CUTOFF & HOLIDAY LOGIC
// ==========================================
const INDIAN_NATIONAL_HOLIDAYS = new Set([
  // 2026
  '2026-01-01', '2026-01-14', '2026-01-26', '2026-02-15', '2026-03-04', '2026-03-20',
  '2026-03-31', '2026-04-03', '2026-04-14', '2026-05-01', '2026-05-27', '2026-05-31',
  '2026-06-26', '2026-08-15', '2026-08-25', '2026-08-28', '2026-09-04', '2026-10-02',
  '2026-10-20', '2026-11-08', '2026-11-09', '2026-11-10', '2026-11-15', '2026-11-24',
  '2026-12-25',
  // 2027
  '2027-01-01', '2027-01-14', '2027-01-26', '2027-03-06', '2027-03-10', '2027-03-23',
  '2027-03-26', '2027-04-14', '2027-04-19', '2027-05-01', '2027-05-17', '2027-05-20',
  '2027-06-16', '2027-08-15', '2027-08-17', '2027-08-25', '2027-10-02', '2027-10-10',
  '2027-10-29', '2027-10-30', '2027-10-31', '2027-11-14', '2027-12-25',
  // 2028
  '2028-01-01', '2028-01-14', '2028-01-26', '2028-03-11', '2028-04-14', '2028-05-01',
  '2028-08-15', '2028-10-02', '2028-10-18', '2028-11-06', '2028-11-07', '2028-11-08',
  '2028-12-25'
]);

const NCR_PREFIXES = ['110', '111', '121', '122', '123', '124', '201', '203'];
const NCR_PINCODES = /^(11[01]\d{3}|12[1234]\d{3}|20(1\d{3}|3\d{3}))$/;

function isNcrPincode(pincode) {
  const pin = String(pincode || '').trim();
  return NCR_PINCODES.test(pin) && NCR_PREFIXES.includes(pin.slice(0, 3));
}

function isWorkingDay(d) {
  const day = d.getDay();
  if (day === 0 || day === 6) return false; // Exclude Sunday & Saturday
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const date = String(d.getDate()).padStart(2, '0');
  return !INDIAN_NATIONAL_HOLIDAYS.has(`${y}-${m}-${date}`);
}

function calculateEstimatedDelivery(orderDate = new Date(), maxDays = 11) {
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const dObj = orderDate instanceof Date ? orderDate : new Date(orderDate);
  const utcMs = dObj.getTime() + (dObj.getTimezoneOffset() * 60000);
  const ist = new Date(utcMs + istOffsetMs);

  const istHour = ist.getHours();
  const isTodayWorking = isWorkingDay(ist);
  const cursor = new Date(ist.getTime());

  // Order Cutoff: 2:00 PM (14:00) IST
  // - Orders placed on a working day at or before 2:00 PM: order intake processed today, fulfillment starts on next working day.
  // - Orders placed after 2:00 PM, or on weekend / national holiday: cutoff passed, shifts by +1 working day.
  if (isTodayWorking && istHour < 14) {
    cursor.setDate(cursor.getDate() + 1);
    while (!isWorkingDay(cursor)) {
      cursor.setDate(cursor.getDate() + 1);
    }
  } else {
    cursor.setDate(cursor.getDate() + 1);
    while (!isWorkingDay(cursor)) {
      cursor.setDate(cursor.getDate() + 1);
    }
    cursor.setDate(cursor.getDate() + 1);
    while (!isWorkingDay(cursor)) {
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  // Upper limit addition (maxDays business days)
  let remaining = maxDays;
  while (remaining > 0) {
    cursor.setDate(cursor.getDate() + 1);
    if (isWorkingDay(cursor)) {
      remaining--;
    }
  }

  cursor.setHours(19, 0, 0, 0);
  const finalUtcMs = cursor.getTime() - istOffsetMs;
  return new Date(finalUtcMs);
}

function deliveryPromiseFor(pincode, items, deliveryTier) {
  const ncr = isNcrPincode(pincode);
  const madeToOrder = (items || []).some(i => {
    const t = normalizeProductType(i.productType, i.category);
    return t === 'apparel' || t === 'hoodie';
  });

  // Updated delivery timelines:
  // Posters: Delhi NCR 5–8 working days (upper limit: 8), Outside NCR / Other States 6–11 working days (upper limit: 11)
  // Made-to-order: NCR 7–10 working days (upper limit: 10), Outside NCR 10–14 working days (upper limit: 14)
  let minDays, maxDays;
  if (madeToOrder) {
    minDays = ncr ? 7 : 10;
    maxDays = ncr ? 10 : 14;
  } else {
    minDays = ncr ? 5 : 6;
    maxDays = ncr ? 8 : 11;
  }

  const faster = deliveryTier && deliveryTier.surcharge > 0 ? 1 : 0;
  if (faster) {
    minDays = Math.max(2, minDays - faster);
    maxDays = Math.max(minDays, maxDays - faster);
  }

  return {
    minDays,
    maxDays,
    ncr,
    label: `${minDays}–${maxDays} working days`
  };
}

module.exports = {
  posterBundleReward, PRODUCT_TYPES, ORDER_CHARGES, PREPAID_ONLY_TYPES, deliveryOptionFor, cartRequiresPrepaid, cartHasPhysicalItems, orderCharges, CATEGORY_PRODUCT_TYPE, getProductType, normalizeProductType, resolveVariants, priceWithVariants, formatVariantLine,
  COURIER_PARTNERS, isKnownCourier,
  INDIAN_NATIONAL_HOLIDAYS, isNcrPincode, isWorkingDay, calculateEstimatedDelivery, deliveryPromiseFor
};
