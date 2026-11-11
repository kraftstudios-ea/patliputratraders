// ========================================
// BRUSH — Cart System
// ========================================

const Cart = (() => {
  const STORAGE_KEY = 'brush_cart';
  let listeners = [];

  // Canonical per-product-type variant config — must stay in sync with
  // Backend/productTypes.js (browser code can't require that Node module
  // without a bundler). The server recomputes price from this same shape
  // independently and never trusts what the client sends; this copy only
  // drives the UI (swatch options shown, cart line labels, client-side
  // price preview before checkout). Keep the prices and variant groups
  // below in sync with the server copy.
  const PRODUCT_TYPES = {
    "poster_2_pack": {
      "label": "2-Poster Pack",
      "basePrice": 55,
      "inclusivePricing": true,
      "gstRate": 0.18,
      "description": "A curated 2-split art pack. Museum-quality posters printed on premium ivory cheddar sheets for outstanding color reproduction.",
      "variantGroups": [
        {
          "key": "size",
          "label": "Size (Per Poster)",
          "defaultValue": "A4",
          "options": [
            {
              "value": "A4",
              "label": "A4 (8.3 × 11.7″)",
              "priceDelta": 0
            },
            {
              "value": "A3",
              "label": "A3 (11.7 × 16.5″)",
              "priceDelta": 20
            },
            {
              "value": "A5",
              "label": "A5 (5.8 × 8.3″)",
              "priceDelta": -20
            },
            {
              "value": "12x18",
              "label": "12×18″",
              "priceDelta": 60
            },
            {
              "value": "13x19",
              "label": "13×19″",
              "priceDelta": 100
            },
            {
              "value": "8x10",
              "label": "8×10″ (Out of Stock)",
              "priceDelta": 0,
              "available": false
            },
            {
              "value": "10x10",
              "label": "10×10″ (Out of Stock)",
              "priceDelta": 0,
              "available": false
            },
            {
              "value": "11x14",
              "label": "11×14″ (Out of Stock)",
              "priceDelta": 0,
              "available": false
            },
            {
              "value": "12x16",
              "label": "12×16″ (Out of Stock)",
              "priceDelta": 0,
              "available": false
            },
            {
              "value": "14x14",
              "label": "14×14″ (Out of Stock)",
              "priceDelta": 0,
              "available": false
            },
            {
              "value": "12x24",
              "label": "12×24″ (Out of Stock)",
              "priceDelta": 0,
              "available": false
            },
            {
              "value": "16x24",
              "label": "16×24″ (Out of Stock)",
              "priceDelta": 0,
              "available": false
            },
            {
              "value": "18x24",
              "label": "18×24″ (Out of Stock)",
              "priceDelta": 0,
              "available": false
            }
          ]
        },
        {
          "key": "gsm",
          "label": "Paper GSM",
          "defaultValue": "300",
          "options": [
            {
              "value": "300",
              "label": "300 GSM",
              "priceDelta": 0
            },
            {
              "value": "225",
              "label": "225 GSM",
              "priceDelta": -4
            },
            {
              "value": "175",
              "label": "175 GSM",
              "priceDelta": -8
            }
          ]
        },
        {
          "key": "finish",
          "label": "Finish",
          "defaultValue": "matte",
          "options": [
            {
              "value": "matte",
              "label": "Matte Finish",
              "priceDelta": 0
            },
            {
              "value": "glossy",
              "label": "Glossy Finish",
              "priceDelta": 0
            }
          ]
        }
      ]
    },
    "poster_3_pack": {
      "label": "3-Poster Pack",
      "basePrice": 79,
      "inclusivePricing": true,
      "gstRate": 0.18,
      "description": "A curated 3-split scenery pack. Museum-quality posters printed on premium ivory cheddar sheets for outstanding color reproduction.",
      "variantGroups": [
        {
          "key": "size",
          "label": "Size (Per Poster)",
          "defaultValue": "A4",
          "options": [
            {
              "value": "A4",
              "label": "A4 (8.3 × 11.7″)",
              "priceDelta": 0
            },
            {
              "value": "A3",
              "label": "A3 (11.7 × 16.5″)",
              "priceDelta": 30
            },
            {
              "value": "A5",
              "label": "A5 (5.8 × 8.3″)",
              "priceDelta": -30
            },
            {
              "value": "12x18",
              "label": "12×18″",
              "priceDelta": 90
            },
            {
              "value": "13x19",
              "label": "13×19″",
              "priceDelta": 150
            },
            {
              "value": "8x10",
              "label": "8×10″ (Out of Stock)",
              "priceDelta": 0,
              "available": false
            },
            {
              "value": "10x10",
              "label": "10×10″ (Out of Stock)",
              "priceDelta": 0,
              "available": false
            },
            {
              "value": "11x14",
              "label": "11×14″ (Out of Stock)",
              "priceDelta": 0,
              "available": false
            },
            {
              "value": "12x16",
              "label": "12×16″ (Out of Stock)",
              "priceDelta": 0,
              "available": false
            },
            {
              "value": "14x14",
              "label": "14×14″ (Out of Stock)",
              "priceDelta": 0,
              "available": false
            },
            {
              "value": "12x24",
              "label": "12×24″ (Out of Stock)",
              "priceDelta": 0,
              "available": false
            },
            {
              "value": "16x24",
              "label": "16×24″ (Out of Stock)",
              "priceDelta": 0,
              "available": false
            },
            {
              "value": "18x24",
              "label": "18×24″ (Out of Stock)",
              "priceDelta": 0,
              "available": false
            }
          ]
        },
        {
          "key": "gsm",
          "label": "Paper GSM",
          "defaultValue": "300",
          "options": [
            {
              "value": "300",
              "label": "300 GSM",
              "priceDelta": 0
            },
            {
              "value": "225",
              "label": "225 GSM",
              "priceDelta": -6
            },
            {
              "value": "175",
              "label": "175 GSM",
              "priceDelta": -12
            }
          ]
        },
        {
          "key": "finish",
          "label": "Finish",
          "defaultValue": "matte",
          "options": [
            {
              "value": "matte",
              "label": "Matte Finish",
              "priceDelta": 0
            },
            {
              "value": "glossy",
              "label": "Glossy Finish",
              "priceDelta": 0
            }
          ]
        }
      ]
    },
    "poster_pack_5": {
      "label": "5-Poster Wall Pack",
      "basePrice": 99,
      "inclusivePricing": true,
      "gstRate": 0.18,
      "description": "Curated 5-poster gallery wall pack printed on museum-grade 300 GSM art card. Choose between compact A5, standard A4, or statement A3, unframed or gallery framed.",
      "variantGroups": [
        {
          "key": "size",
          "label": "Poster Size",
          "defaultValue": "A5",
          "options": [
            {
              "value": "A5",
              "label": "A5 (5.8 × 8.3″) · Compact Wall",
              "priceDelta": 0
            },
            {
              "value": "A4",
              "label": "A4 (8.3 × 11.7″) · Standard Wall",
              "priceDelta": 50
            },
            {
              "value": "A3",
              "label": "A3 (11.7 × 16.5″) · Statement Wall",
              "priceDelta": 150
            }
          ]
        },
        {
          "key": "frame",
          "label": "Framing",
          "defaultValue": "none",
          "options": [
            {
              "value": "none",
              "label": "Just Posters (Unframed)",
              "priceDelta": 0
            },
            {
              "value": "framed_a5",
              "label": "Gallery Framed",
              "priceDelta": 200,
              "onlyWith": {
                "size": [
                  "A5"
                ]
              }
            },
            {
              "value": "framed_a4",
              "label": "Gallery Framed",
              "priceDelta": 350,
              "onlyWith": {
                "size": [
                  "A4"
                ]
              }
            },
            {
              "value": "framed_a3",
              "label": "Gallery Framed",
              "priceDelta": 650,
              "onlyWith": {
                "size": [
                  "A3"
                ]
              }
            }
          ]
        }
      ]
    },
    "poster_pack_10": {
      "label": "10-Poster Wall Pack",
      "basePrice": 169,
      "inclusivePricing": true,
      "gstRate": 0.18,
      "description": "Curated 10-poster gallery wall pack printed on museum-grade 300 GSM art card. Choose between compact A5, standard A4, or statement A3, unframed or gallery framed.",
      "variantGroups": [
        {
          "key": "size",
          "label": "Poster Size",
          "defaultValue": "A5",
          "options": [
            {
              "value": "A5",
              "label": "A5 (5.8 × 8.3″) · Compact Wall",
              "priceDelta": 0
            },
            {
              "value": "A4",
              "label": "A4 (8.3 × 11.7″) · Standard Wall",
              "priceDelta": 90
            },
            {
              "value": "A3",
              "label": "A3 (11.7 × 16.5″) · Statement Wall",
              "priceDelta": 280
            }
          ]
        },
        {
          "key": "frame",
          "label": "Framing",
          "defaultValue": "none",
          "options": [
            {
              "value": "none",
              "label": "Just Posters (Unframed)",
              "priceDelta": 0
            },
            {
              "value": "framed_a5",
              "label": "Gallery Framed",
              "priceDelta": 380,
              "onlyWith": {
                "size": [
                  "A5"
                ]
              }
            },
            {
              "value": "framed_a4",
              "label": "Gallery Framed",
              "priceDelta": 640,
              "onlyWith": {
                "size": [
                  "A4"
                ]
              }
            },
            {
              "value": "framed_a3",
              "label": "Gallery Framed",
              "priceDelta": 1150,
              "onlyWith": {
                "size": [
                  "A3"
                ]
              }
            }
          ]
        }
      ]
    },
    "poster_pack_15": {
      "label": "15-Poster Wall Pack",
      "basePrice": 239,
      "inclusivePricing": true,
      "gstRate": 0.18,
      "description": "Curated 15-poster gallery wall pack printed on museum-grade 300 GSM art card. Choose between compact A5, standard A4, or statement A3, unframed or gallery framed.",
      "variantGroups": [
        {
          "key": "size",
          "label": "Poster Size",
          "defaultValue": "A5",
          "options": [
            {
              "value": "A5",
              "label": "A5 (5.8 × 8.3″) · Compact Wall",
              "priceDelta": 0
            },
            {
              "value": "A4",
              "label": "A4 (8.3 × 11.7″) · Standard Wall",
              "priceDelta": 110
            },
            {
              "value": "A3",
              "label": "A3 (11.7 × 16.5″) · Statement Wall",
              "priceDelta": 390
            }
          ]
        },
        {
          "key": "frame",
          "label": "Framing",
          "defaultValue": "none",
          "options": [
            {
              "value": "none",
              "label": "Just Posters (Unframed)",
              "priceDelta": 0
            },
            {
              "value": "framed_a5",
              "label": "Gallery Framed",
              "priceDelta": 560,
              "onlyWith": {
                "size": [
                  "A5"
                ]
              }
            },
            {
              "value": "framed_a4",
              "label": "Gallery Framed",
              "priceDelta": 950,
              "onlyWith": {
                "size": [
                  "A4"
                ]
              }
            },
            {
              "value": "framed_a3",
              "label": "Gallery Framed",
              "priceDelta": 1670,
              "onlyWith": {
                "size": [
                  "A3"
                ]
              }
            }
          ]
        }
      ]
    },
    "poster_pack_20": {
      "label": "20-Poster Wall Pack",
      "basePrice": 309,
      "inclusivePricing": true,
      "gstRate": 0.18,
      "description": "Curated 20-poster gallery wall pack printed on museum-grade 300 GSM art card. Choose between compact A5, standard A4, or statement A3, unframed or gallery framed.",
      "variantGroups": [
        {
          "key": "size",
          "label": "Poster Size",
          "defaultValue": "A5",
          "options": [
            {
              "value": "A5",
              "label": "A5 (5.8 × 8.3″) · Compact Wall",
              "priceDelta": 0
            },
            {
              "value": "A4",
              "label": "A4 (8.3 × 11.7″) · Statement Wall",
              "priceDelta": 140
            },
            {
              "value": "A3",
              "label": "A3 (11.7 × 16.5″) · Statement Wall",
              "priceDelta": 490
            }
          ]
        },
        {
          "key": "frame",
          "label": "Framing",
          "defaultValue": "none",
          "options": [
            {
              "value": "none",
              "label": "Just Posters (Unframed)",
              "priceDelta": 0
            },
            {
              "value": "framed_a5",
              "label": "Gallery Framed",
              "priceDelta": 690,
              "onlyWith": {
                "size": [
                  "A5"
                ]
              }
            },
            {
              "value": "framed_a4",
              "label": "Gallery Framed",
              "priceDelta": 1250,
              "onlyWith": {
                "size": [
                  "A4"
                ]
              }
            },
            {
              "value": "framed_a3",
              "label": "Gallery Framed",
              "priceDelta": 2100,
              "onlyWith": {
                "size": [
                  "A3"
                ]
              }
            }
          ]
        }
      ]
    },
    "poster_pack_25": {
      "label": "25-Poster Wall Pack",
      "basePrice": 369,
      "inclusivePricing": true,
      "gstRate": 0.18,
      "description": "Curated 25-poster gallery wall pack printed on museum-grade 300 GSM art card. Choose between compact A5 or statement A4 dimensions.",
      "variantGroups": [
        {
          "key": "size",
          "label": "Poster Size",
          "defaultValue": "A5",
          "options": [
            {
              "value": "A5",
              "label": "A5 (5.8 × 8.3″) · Compact Wall",
              "priceDelta": 0
            },
            {
              "value": "A4",
              "label": "A4 (8.3 × 11.7″) · Statement Wall",
              "priceDelta": 200
            }
          ]
        }
      ]
    },
    "poster": {
      "label": "Poster",
      "basePrice": 29,
      "inclusivePricing": true,
      "gstRate": 0.18,
      "description": "Museum-quality posters printed on premium ivory cheddar sheets for outstanding color reproduction. Available in multiple true-to-size dimensions with matte or glossy finish.",
      "variantGroups": [
        {
          "key": "size",
          "label": "Size",
          "defaultValue": "A4",
          "options": [
            {
              "value": "A4",
              "label": "A4 (8.3 × 11.7″)",
              "priceDelta": 0
            },
            {
              "value": "A3",
              "label": "A3 (11.7 × 16.5″)",
              "priceDelta": 10
            },
            {
              "value": "A5",
              "label": "A5 (5.8 × 8.3″)",
              "priceDelta": -10
            },
            {
              "value": "12x18",
              "label": "12×18″",
              "priceDelta": 30
            },
            {
              "value": "13x19",
              "label": "13×19″",
              "priceDelta": 50
            },
            {
              "value": "8x10",
              "label": "8×10″ (Out of Stock)",
              "priceDelta": 0,
              "available": false
            },
            {
              "value": "10x10",
              "label": "10×10″ (Out of Stock)",
              "priceDelta": 0,
              "available": false
            },
            {
              "value": "11x14",
              "label": "11×14″ (Out of Stock)",
              "priceDelta": 0,
              "available": false
            },
            {
              "value": "12x16",
              "label": "12×16″ (Out of Stock)",
              "priceDelta": 0,
              "available": false
            },
            {
              "value": "14x14",
              "label": "14×14″ (Out of Stock)",
              "priceDelta": 0,
              "available": false
            },
            {
              "value": "12x24",
              "label": "12×24″ (Out of Stock)",
              "priceDelta": 0,
              "available": false
            },
            {
              "value": "16x24",
              "label": "16×24″ (Out of Stock)",
              "priceDelta": 0,
              "available": false
            },
            {
              "value": "18x24",
              "label": "18×24″ (Out of Stock)",
              "priceDelta": 0,
              "available": false
            }
          ]
        },
        {
          "key": "gsm",
          "label": "Quality (GSM)",
          "defaultValue": "300",
          "options": [
            {
              "value": "300",
              "label": "300 GSM",
              "priceDelta": 0
            },
            {
              "value": "225",
              "label": "225 GSM",
              "priceDelta": -2
            },
            {
              "value": "175",
              "label": "175 GSM",
              "priceDelta": -4
            }
          ]
        },
        {
          "key": "finish",
          "label": "Finish",
          "defaultValue": "matte",
          "options": [
            {
              "value": "matte",
              "label": "Matte",
              "priceDelta": 0
            },
            {
              "value": "glossy",
              "label": "Glossy",
              "priceDelta": 0
            }
          ]
        },
        {
          "key": "frame",
          "label": "Frame",
          "defaultValue": "none",
          "options": [
            {
              "value": "none",
              "label": "No Frame (Print Only)",
              "priceDelta": 0
            },
            {
              "value": "black_a4",
              "label": "Black Frame",
              "priceDelta": 470,
              "swatch": "#111111",
              "onlyWith": {
                "size": [
                  "A4"
                ]
              }
            },
            {
              "value": "white_a4",
              "label": "White Frame",
              "priceDelta": 470,
              "swatch": "#f5f5f5",
              "onlyWith": {
                "size": [
                  "A4"
                ]
              }
            },
            {
              "value": "black_a3",
              "label": "Black Frame",
              "priceDelta": 720,
              "swatch": "#111111",
              "onlyWith": {
                "size": [
                  "A3"
                ]
              }
            },
            {
              "value": "white_a3",
              "label": "White Frame",
              "priceDelta": 720,
              "swatch": "#f5f5f5",
              "onlyWith": {
                "size": [
                  "A3"
                ]
              }
            },
            {
              "value": "black_12x18",
              "label": "Black Frame",
              "priceDelta": 700,
              "swatch": "#111111",
              "onlyWith": {
                "size": [
                  "12x18"
                ]
              }
            },
            {
              "value": "white_12x18",
              "label": "White Frame",
              "priceDelta": 700,
              "swatch": "#f5f5f5",
              "onlyWith": {
                "size": [
                  "12x18"
                ]
              }
            }
          ]
        }
      ]
    },
    "apparel": {
      "label": "T-Shirt",
      "basePrice": 599,
      "inclusivePricing": true,
      "gstRate": 0.18,
      "variantGroups": [
        {
          "key": "style",
          "label": "Fit",
          "defaultValue": "uc21",
          "options": [
            {
              "value": "uc21",
              "label": "Classic Crew · 180 GSM",
              "priceDelta": 0
            },
            {
              "value": "uc48",
              "label": "Unisex Stretch Tee · 240 GSM",
              "priceDelta": -40
            }
          ]
        },
        {
          "key": "print",
          "label": "Print",
          "defaultValue": "dtf",
          "options": [
            {
              "value": "dtf",
              "label": "DTF",
              "priceDelta": 0
            },
            {
              "value": "dtg",
              "label": "DTG",
              "priceDelta": 0
            }
          ]
        },
        {
          "key": "size",
          "label": "Size",
          "defaultValue": "M",
          "options": [
            {
              "value": "XS",
              "label": "XS",
              "priceDelta": 0
            },
            {
              "value": "S",
              "label": "S",
              "priceDelta": 0
            },
            {
              "value": "M",
              "label": "M",
              "priceDelta": 0
            },
            {
              "value": "L",
              "label": "L",
              "priceDelta": 0
            },
            {
              "value": "XL",
              "label": "XL",
              "priceDelta": 0
            },
            {
              "value": "2XL",
              "label": "2XL",
              "priceDelta": 0
            },
            {
              "value": "3XL",
              "label": "3XL",
              "priceDelta": 30,
              "onlyWith": {
                "style": [
                  "uc21"
                ]
              }
            },
            {
              "value": "3XL",
              "label": "3XL",
              "priceDelta": 20,
              "onlyWith": {
                "style": [
                  "uc48"
                ]
              }
            }
          ]
        }
      ]
    },
    "hoodie": {
      "label": "Oversized Hoodie",
      "basePrice": 1199,
      "inclusivePricing": true,
      "gstRate": 0.18,
      "printAreas": {
        "back": {
          "label": "Back",
          "max": "11.7 x 16.5 in (A3)"
        },
        "chest": {
          "label": "Left chest",
          "max": "4 x 4 in"
        },
        "sleeve": {
          "label": "Sleeve",
          "max": "4 x 4 in"
        },
        "frontHood": {
          "label": "Front (below hood)",
          "max": "10 x 10 in"
        }
      },
      "sizeChart": {
        "units": "in",
        "columns": [
          "Chest",
          "Length"
        ],
        "rows": {
          "S": [
            40,
            27
          ],
          "M": [
            42,
            28
          ],
          "L": [
            44,
            29
          ],
          "XL": [
            46,
            30
          ],
          "2XL": [
            48,
            31
          ],
          "3XL": [
            50,
            32
          ]
        }
      },
      "variantGroups": [
        {
          "key": "print",
          "label": "Print Finish",
          "defaultValue": "dtf",
          "options": [
            {
              "value": "dtf",
              "label": "DTF · crisp, most durable",
              "priceDelta": 0
            },
            {
              "value": "dtg",
              "label": "DTG · softest hand-feel",
              "priceDelta": 0
            },
            {
              "value": "puff",
              "label": "Puff-White chest · raised vinyl",
              "priceDelta": 69
            }
          ]
        },
        {
          "key": "size",
          "label": "Size",
          "defaultValue": "M",
          "options": [
            {
              "value": "S",
              "label": "S",
              "priceDelta": 0
            },
            {
              "value": "M",
              "label": "M",
              "priceDelta": 0
            },
            {
              "value": "L",
              "label": "L",
              "priceDelta": 0
            },
            {
              "value": "XL",
              "label": "XL",
              "priceDelta": 0
            },
            {
              "value": "2XL",
              "label": "2XL",
              "priceDelta": 0
            },
            {
              "value": "3XL",
              "label": "3XL",
              "priceDelta": 0
            }
          ]
        }
      ]
    },
    "tapestry": {
      "label": "Wall Tapestry",
      "basePrice": 359,
      "inclusivePricing": true,
      "gstRate": 0.18,
      "description": "Soft-touch printed wall tapestry, hemmed on all four sides with metal grommets in every corner. Ships with four adhesive screws, so it goes up in minutes without a drill. Seven sizes, printed to order.",
      "variantGroups": [
        {
          "key": "size",
          "label": "Size",
          "defaultValue": "30x40",
          "options": [
            {
              "value": "24x24",
              "label": "24 x 24\"",
              "priceDelta": -100
            },
            {
              "value": "26x36",
              "label": "26 x 36\"",
              "priceDelta": -60
            },
            {
              "value": "30x40",
              "label": "30 x 40\"",
              "priceDelta": 0
            },
            {
              "value": "35x45",
              "label": "35 x 45\"",
              "priceDelta": 90
            },
            {
              "value": "40x50",
              "label": "40 x 50\"",
              "priceDelta": 120
            },
            {
              "value": "48x54",
              "label": "48 x 54\"",
              "priceDelta": 230
            },
            {
              "value": "54x84",
              "label": "54 x 84\"",
              "priceDelta": 1220
            }
          ]
        }
      ]
    },
    "metal": {
      "label": "Metal Poster",
      "basePrice": 579,
      "inclusivePricing": true,
      "gstRate": 0.18,
      "description": "Artwork printed directly onto a rigid aluminium panel with a fine satin finish — no glass, no frame, no glare. Rounded corners, pre-drilled for a flush magnetic mount.",
      "variantGroups": [
        {
          "key": "size",
          "label": "Size",
          "defaultValue": "8x11.7",
          "options": [
            {
              "value": "8x11.7",
              "label": "8 × 11.7\"",
              "priceDelta": 0
            },
            {
              "value": "11.7x15.7",
              "label": "11.7 × 15.7\"",
              "priceDelta": 330
            }
          ]
        }
      ]
    },
    "plate": {
      "label": "Decorative Plate",
      "inclusivePricing": true,
      "gstRate": 0.18,
      "variantGroups": [
        {
          "key": "size",
          "label": "Plate Size",
          "options": [
            {
              "value": "8in",
              "label": "8\" Round",
              "priceDelta": 0
            },
            {
              "value": "10in",
              "label": "10\" Round",
              "priceDelta": 80
            },
            {
              "value": "12in",
              "label": "12\" Round",
              "priceDelta": 150
            }
          ]
        }
      ]
    },
    "wallpaper": {
      "label": "Wallpaper",
      "inclusivePricing": true,
      "gstRate": 0.18,
      "variantGroups": [
        {
          "key": "roll",
          "label": "Roll Size",
          "options": [
            {
              "value": "1x3m",
              "label": "1m × 3m Roll",
              "priceDelta": 0
            },
            {
              "value": "1.5x3m",
              "label": "1.5m × 3m Roll",
              "priceDelta": 300
            }
          ]
        }
      ]
    },
    "digital": {
      "label": "Digital Asset",
      "basePrice": 79,
      "inclusivePricing": true,
      "gstRate": 0.18,
      "variantGroups": []
    },
    "generic": {
      "label": "Product",
      "inclusivePricing": true,
      "gstRate": 0.18,
      "variantGroups": []
    }
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

  function typeConfigFor(productType) {
    return PRODUCT_TYPES[normalizeProductType(productType)] || PRODUCT_TYPES.generic;
  }

  function defaultVariants(productType) {
    return resolveVariants(typeConfigFor(productType), null).variants;
  }

  // Same computation the server runs at checkout (priceWithVariants).
  function priceFor(product, variants) {
    return unitPrice(product.price, typeConfigFor(product.productType), variants);
  }

  // ---- State ----
  function getCart() {
    try {
      const cart = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
      // Migrates items added before multi-product-type support (flat
      // `size`/`gsm`, no `variants`/`productType`) so every downstream
      // consumer only ever has to handle one shape.
      let migrated = false;
      cart.forEach(item => {
        if (!item.variants) {
          item.productType = item.productType || 'poster';
          item.variants = { size: item.size || 'A4', gsm: item.gsm || '80' };
          migrated = true;
        }
        // Items priced from the fixed rate table (posters, tees) are
        // re-priced on read so carts saved under older prices or retired
        // variants (e.g. poster GSM) show exactly what checkout will charge.
        const cfg = typeConfigFor(item.productType);
        if (typeof cfg.basePrice === 'number' && !item.customPosters) {
          const { price, variants } = unitPrice(item.price, cfg, item.variants);
          const same = price === item.price && JSON.stringify(variants) === JSON.stringify(item.variants);
          if (!same) {
            item.price = price;
            item.variants = variants;
            migrated = true;
          }
        }
      });
      if (migrated) localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
      return cart;
    } catch {
      return [];
    }
  }

  function saveCart(cart) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
    notifyListeners();
  }

  function notifyListeners() {
    const cart = getCart();
    listeners.forEach(fn => fn(cart));
  }

  // ---- Public API ----
  // `variants` is a plain object keyed by that product type's variant
  // groups, e.g. {size:'A3', gsm:'140'} for a poster or {size:'10in'} for
  // a plate — pass null/omit to use the type's first (base-price) option
  // in every group, same as before for the quick-add-from-card path.
  function addItem(product, qty = 1, variants = null, finalPrice = null) {
    const cart = getCart();
    const productType = product.productType || 'poster';
    const cfg = typeConfigFor(productType);
    const resolvedVariants = resolveVariants(cfg, variants).variants;
    const cartId = `${product.id}_${Object.values(resolvedVariants).join('_')}`;
    const priceToUse = (product.customPosters && typeof product.price === 'number')
      ? product.price
      : (typeof cfg.basePrice === 'number'
          ? unitPrice(product.price, cfg, resolvedVariants).price
          : (finalPrice !== null ? finalPrice : product.price));
    const existing = cart.find(item => item.cartId === cartId);

    if (existing) {
      existing.quantity = Math.min(existing.quantity + qty, stockCapOf(existing));
    } else {
      cart.push({
        cartId,
        id: product.id,
        name: product.name,
        price: priceToUse,
        originalPrice: product.originalPrice || product.price,
        image: product.image,
        quantity: qty,
        productType,
        variants: resolvedVariants,
        stockQuantity: product.stockQuantity !== undefined ? product.stockQuantity : 50,
        customPosters: Array.isArray(product.customPosters) ? product.customPosters : undefined
      });
    }
    saveCart(cart);
    return cart;
  }

  // `item.stockQuantity || 50` treated a genuine stock level of 0 as "unknown,
  // assume 50", so a sold-out item could still be walked up to 50 in the cart.
  // 0 is a real answer; only `undefined` means we were never told.
  function stockCapOf(item) {
    return item && item.stockQuantity !== undefined ? item.stockQuantity : 50;
  }

  function removeItem(cartId) {
    // support legacy id or cartId
    const cart = getCart().filter(item => item.cartId !== cartId && item.id !== cartId);
    saveCart(cart);
    return cart;
  }

  function updateQuantity(cartId, qty) {
    const cart = getCart();
    const item = cart.find(i => i.cartId === cartId || i.id === cartId);
    if (item) {
      const n = Math.floor(Number(qty));
      // A NaN here used to survive Math.max/Math.min and poison the stored
      // quantity, which then rendered the subtotal and the total as NaN and
      // left the cart un-checkout-able.
      if (!Number.isFinite(n)) return cart;
      item.quantity = Math.max(1, Math.min(n, stockCapOf(item)));
    }
    saveCart(cart);
    return cart;
  }

  function clear() {
    localStorage.removeItem(STORAGE_KEY);
    notifyListeners();
  }

  function getItemCount() {
    return getCart().reduce((sum, item) => sum + item.quantity, 0);
  }

  function getSubtotal() {
    return getCart().reduce((sum, item) => sum + (item.price * item.quantity), 0);
  }

  function getSavings() {
    return getCart().reduce((sum, item) => sum + ((item.originalPrice - item.price) * item.quantity), 0);
  }

  // Taxes, delivery and the COD fee are added once per order — the same
  // orderCharges() the server uses to compute what's actually charged.
  // Second argument takes either a coupon amount (legacy) or an options object
  // { couponDiscount, deliveryOption }.
  function getCharges(paymentMethod, opts = 0) {
    const lines = getCart().map(i => ({ price: i.price, quantity: i.quantity, productType: i.productType }));
    return orderCharges(lines, paymentMethod, opts);
  }

  // True when the cart holds something that cannot be paid for on delivery.
  function requiresPrepaid() {
    return cartRequiresPrepaid(getCart());
  }

  function getShipping() {
    return getCharges().shipping;
  }

  function getGst(paymentMethod) {
    return getCharges(paymentMethod).gst;
  }

  function getDiscount() {
    return 0;
  }

  function getTotal(paymentMethod) {
    return getCharges(paymentMethod).total;
  }

  function onChange(fn) {
    listeners.push(fn);
  }

  // ---- Order placement ----
  async function placeOrder(customerData, paymentMethod, rzpOrderId = null, rzpPaymentId = null, rzpSignature = null, couponCode = null, deliveryOption = null, preferredCourier = null, paymentReference = null, toBePaidByUpi = false, cashfreeOrderId = null) {
    const cart = getCart();
    if (cart.length === 0) throw new Error('Cart is empty');

    // The server derives userId from this Bearer token itself (never from
    // a client-supplied value in the body) — a logged-in user's orders
    // still land in their real account, but nothing here can attach an
    // order to someone else's account by just naming their userId.
    let token = null;
    try {
      const u = JSON.parse(localStorage.getItem('brushUser'));
      if (u) token = u.token;
    } catch (e) {}

    const orderPayload = {
      customer: customerData,
      items: cart.map(item => ({
        productId: item.id,
        name: item.name,
        quantity: item.quantity,
        variants: item.variants,
        customPosters: Array.isArray(item.customPosters) ? item.customPosters : undefined
      })),
      paymentMethod: paymentMethod,
      razorpay_order_id: rzpOrderId,
      razorpay_payment_id: rzpPaymentId,
      razorpay_signature: rzpSignature,
      cashfree_order_id: cashfreeOrderId,
      // Both of these have to reach the server: it recomputes the total from
      // them and, for a prepaid order, compares it against the amount that was
      // authorized. Omitting the coupon here made the two totals disagree and
      // the payment was rejected after the shopper had already paid.
      couponCode: couponCode,
      deliveryOption: deliveryOption,
      // A preference only. It is never priced, so it cannot change the total
      // the server verifies the payment against.
      preferredCourier: preferredCourier,
      // Only set for a direct transfer. It is a lookup key for the bank
      // statement, never treated as proof of payment.
      paymentReference: paymentReference,
      toBePaidByUpi: toBePaidByUpi
    };

    const response = await fetch(`${API_BASE}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: JSON.stringify(orderPayload)
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to place order');
    }

    // Clear cart on success
    clear();
    return data;
  }

  async function getOrder(orderId) {
    const response = await fetch(`${API_BASE}/orders/${orderId}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Order not found');
    return data;
  }

  function hasPhysicalItems() {
    return cartHasPhysicalItems(getCart());
  }

  const INDIAN_NATIONAL_HOLIDAYS = new Set([
    // 2026
    '2026-01-26', // Republic Day
    '2026-03-04', // Holi
    '2026-03-20', // Eid-ul-Fitr
    '2026-04-03', // Good Friday
    '2026-04-14', // Ambedkar Jayanti
    '2026-05-01', // May Day / Maharashtra Day
    '2026-05-27', // Bakrid / Eid-ul-Adha
    '2026-08-15', // Independence Day
    '2026-08-26', // Raksha Bandhan
    '2026-09-04', // Janmashtami
    '2026-10-02', // Gandhi Jayanti
    '2026-10-20', // Dussehra (Vijay Dashami)
    '2026-11-08', // Diwali (Deepavali)
    '2026-11-09', // Govardhan Puja
    '2026-11-10', // Bhai Dooj
    '2026-11-24', // Guru Nanak Jayanti
    '2026-12-25', // Christmas Day

    // 2027
    '2027-01-26', // Republic Day
    '2027-03-22', // Holi
    '2027-03-10', // Eid-ul-Fitr
    '2027-03-26', // Good Friday
    '2027-04-14', // Ambedkar Jayanti
    '2027-05-01', // May Day
    '2027-05-17', // Bakrid / Eid-ul-Adha
    '2027-08-15', // Independence Day
    '2027-10-02', // Gandhi Jayanti
    '2027-10-09', // Dussehra
    '2027-10-29', // Diwali
    '2027-11-14', // Guru Nanak Jayanti
    '2027-12-25', // Christmas Day

    // 2028
    '2028-01-26', // Republic Day
    '2028-03-11', // Holi
    '2028-04-14', // Ambedkar Jayanti / Good Friday
    '2028-05-01', // May Day
    '2028-08-15', // Independence Day
    '2028-10-02', // Gandhi Jayanti
    '2028-10-17', // Diwali
    '2028-12-25'  // Christmas Day
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
    const list = items || getCart();
    const madeToOrder = (list || []).some(i => {
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

  const instance = {
    getCart, addItem, add: addItem, removeItem, updateQuantity, clear,
    getItemCount, getSubtotal, getSavings, getShipping, getGst, getDiscount, getTotal, getCharges, ORDER_CHARGES,
    requiresPrepaid, hasPhysicalItems, cartHasPhysicalItems, deliveryOptionFor, PREPAID_ONLY_TYPES, COURIER_PARTNERS, isKnownCourier, normalizeProductType,
    INDIAN_NATIONAL_HOLIDAYS, NCR_PREFIXES, NCR_PINCODES, isNcrPincode, isWorkingDay, calculateEstimatedDelivery, deliveryPromiseFor,
    onChange, placeOrder, getOrder,
    PRODUCT_TYPES, typeConfigFor, defaultVariants, resolveVariants, optionAllowed, priceFor
  };

  if (typeof window !== 'undefined') {
    window.Cart = instance;
  }
  return instance;
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Cart;
}
