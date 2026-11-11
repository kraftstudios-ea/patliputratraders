// ========================================
// BRUSH — Per-product-type spec copy
//
// The product modal used to carry one hardcoded set of accordions written
// for posters ("ready-to-hang", "eco-friendly inks"), shown on every
// product — so a hoodie claimed to be easy to install. This module holds
// one entry per product type and renderProductCopy() swaps the modal's
// accordion block for the right one when a product opens.
//
// Specs only. Prices are NOT here — those live in productTypes.js /
// cart.js, which are the single source of truth.
// ========================================
(function () {
  'use strict';

  const SHIPPING = {
    icon: 'fa-truck',
    title: 'Shipping & Delivery',
    html: '<p>Dispatched from our primary showroom and distribution hub in Patna, Bihar. In-stock fixtures are tested, safely packaged with shock-absorbing foam, and dispatched within 1–2 working days. Reaches Patna/Bihar in 2–4 working days, Metro & NCR in 4–7 working days, and rest of India in 6–10 working days. Delivery is a flat ₹59, free on orders above ₹599, and tracked end to end with courier AWB tracking.</p>'
  };

  const RETURNS_NOTE = '<p class="spec-note">Every luminaire is tested and quality checked. In the rare event of any transit damage or manufacturing defect, free replacement is provided against an unboxing video within 48 hours of delivery.</p>';

  // Renders a { Chest: [...], Length: [...] } style table.
  function sizeTable(sizes, rows, units) {
    const head = '<tr><th>Size</th>' + sizes.map(s => `<th>${s}</th>`).join('') + '</tr>';
    const body = rows.map(r => `<tr><th>${r.label} (${units})</th>` + r.values.map(v => `<td>${v}</td>`).join('') + '</tr>').join('');
    return `<div class="spec-table-wrap"><table class="spec-table">${head}${body}</table></div>`;
  }

  const HOODIE_SIZES = ['S', 'M', 'L', 'XL', '2XL', '3XL'];
  const TEE_SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'];

  const COPY = {
    hoodie: [
      {
        icon: 'fa-layer-group',
        title: 'Fabric & Build',
        open: true,
        html:
          '<ul class="spec-list">' +
          '<li><b>400 GSM</b> heavyweight fleece — 90% cotton, 10% polyester</li>' +
          '<li>Super-combed, bio-washed and pre-shrunk, so it holds its size after the first wash</li>' +
          '<li>Drop-shoulder oversized cut with a relaxed body</li>' +
          '<li>Derby ribbed hem and cuffs, double-stitched seams</li>' +
          '<li>Twin-needle hood with a matching flat drawcord and a kangaroo pocket</li>' +
          '<li>Blank stocked in seven colourways — Black, White, Navy Blue, Bottle Green, Maroon, Lavender and Light Baby Pink; each design is listed in the colour it was drawn for</li>' +
          '</ul>'
      },
      {
        icon: 'fa-ruler-combined',
        title: 'Fit & Size Chart',
        html:
          '<p>Cut oversized — the chest figures below are the garment laid flat, not your body. If you want it boxy, take your usual size; if you want it close, size down one.</p>' +
          sizeTable(HOODIE_SIZES, [
            { label: 'Chest', values: [40, 42, 44, 46, 48, 50] },
            { label: 'Length', values: [27, 28, 29, 30, 31, 32] }
          ], 'in') +
          '<p class="spec-note">Measurements can vary up to half an inch per side.</p>'
      },
      {
        icon: 'fa-shirt',
        title: 'Print & Placement',
        html:
          '<p>Every hoodie carries the full artwork across the back and a small mark on the left chest.</p>' +
          '<ul class="spec-list">' +
          '<li><b>Back</b> — printed at A3, up to 11.7 × 16.5 in</li>' +
          '<li><b>Left chest</b> — up to 4 × 4 in</li>' +
          '<li><b>Sleeve</b> — up to 4 × 4 in (on request)</li>' +
          '<li><b>Front, below the hood</b> — up to 10 × 10 in (on request)</li>' +
          '</ul>' +
          '<p><b>DTF</b> lays the ink just on the surface — the crispest edges and the most durable finish on heavyweight fleece. <b>DTG</b> soaks into the cotton for the softest hand-feel, with slightly more muted colour on dark garments. <b>Puff-White</b> swaps the chest mark for raised vinyl you can feel.</p>'
      },
      {
        icon: 'fa-droplet',
        title: 'Care',
        html:
          '<ul class="spec-list">' +
          '<li>Machine wash cold, inside out, with like colours</li>' +
          '<li>No bleach, no fabric softener on the print</li>' +
          '<li>Tumble dry low or line dry in shade</li>' +
          '<li>Iron inside out only — never directly on the print</li>' +
          '</ul>'
      },
      SHIPPING
    ],

    apparel: [
      {
        icon: 'fa-layer-group',
        title: 'Fabric & Build',
        open: true,
        html:
          '<ul class="spec-list">' +
          '<li><b>Classic Crew · 180 GSM</b> — 100% bio-washed combed cotton, pre-shrunk, the everyday weight</li>' +
          '<li><b>Stretch Tee · 240 GSM</b> — heavier cotton blend with a little give, holds its shape longer</li>' +
          '<li><b>Polo · 220 GSM</b> — piqué knit with a ribbed collar and a two-button placket</li>' +
          '<li>Shoulder-to-shoulder taping, twin-needle hem and sleeves, tear-away label</li>' +
          '</ul>'
      },
      {
        icon: 'fa-ruler-combined',
        title: 'Fit & Size Chart',
        html:
          '<p>Regular unisex fit. Figures are the garment laid flat.</p>' +
          sizeTable(TEE_SIZES, [
            { label: 'Chest', values: [36, 38, 40, 42, 44, 46, 48] },
            { label: 'Length', values: [26, 27, 28, 29, 30, 31, 32] }
          ], 'in') +
          '<p class="spec-note">XS and 3XL are not offered on every fit — the size swatches show what is available on this one. Measurements can vary up to half an inch per side.</p>'
      },
      {
        icon: 'fa-shirt',
        title: 'Print & Placement',
        html:
          '<p>Full artwork across the back, small mark on the left chest.</p>' +
          '<ul class="spec-list">' +
          '<li><b>Back</b> — printed at A3, up to 11.7 × 16.5 in (the garment takes up to 16 × 20 in)</li>' +
          '<li><b>Left chest</b> — up to 4 × 4 in</li>' +
          '<li><b>Sleeve</b> — up to 4 × 4 in (on request)</li>' +
          '</ul>' +
          '<p><b>DTF</b> gives the crispest edges and the strongest wash durability. <b>DTG</b> soaks into the cotton and feels softer, with a slightly softer colour on darks.</p>'
      },
      {
        icon: 'fa-droplet',
        title: 'Care',
        html:
          '<ul class="spec-list">' +
          '<li>Machine wash cold, inside out, with like colours</li>' +
          '<li>No bleach, no fabric softener on the print</li>' +
          '<li>Tumble dry low or line dry in shade</li>' +
          '<li>Iron inside out only — never directly on the print</li>' +
          '</ul>'
      },
      SHIPPING
    ],

    poster: [
      {
        icon: 'fa-layer-group',
        title: 'Paper & Print',
        open: true,
        html:
          '<ul class="spec-list">' +
          '<li><b>300 GSM matte art board</b> — heavy, uncoated, no glare under a lamp</li>' +
          '<li>Pigment ink, printed to order — no stock sitting in a warehouse fading</li>' +
          '<li>Unframed, with a small white border for framing or clipping</li>' +
          '</ul>'
      },
      {
        icon: 'fa-ruler-combined',
        title: 'Sizes',
        html:
          '<p>A5 is 14.8 × 21 cm, A4 is 21 × 29.7 cm, A3 is 29.7 × 42 cm. Imperial sizes run from 8 × 10 in up to 18 × 24 in. Every size is a swatch on this page with its own price.</p>'
      },
      {
        icon: 'fa-box-open',
        title: 'Packing & Handling',
        html:
          '<p>Shipped securely in a flat reinforced board mailer. Handle by the edges — matte board takes fingerprints.</p>' + RETURNS_NOTE
      },
      SHIPPING
    ],

    sticker: [
      {
        icon: 'fa-note-sticky',
        title: 'Material',
        open: true,
        html:
          '<ul class="spec-list">' +
          '<li>A4 kiss-cut sheet on matte waterproof vinyl</li>' +
          '<li>Peel individual stickers straight off the backing — no cutting</li>' +
          '<li>Survives laptops, bottles and journals; not rated for a dishwasher</li>' +
          '</ul>' +
          '<p>The description above tells you how many stickers this sheet holds.</p>'
      },
      SHIPPING
    ],

    wallpaper: [
      {
        icon: 'fa-layer-group',
        title: 'Material & Finish',
        open: true,
        html:
          '<ul class="spec-list">' +
          '<li>Peel-and-stick self-adhesive wallpaper, matte finish</li>' +
          '<li>Repositionable while you hang it; removable without stripping paint on a sound, fully cured wall</li>' +
          '<li>Printed to order in the same art direction as the posters</li>' +
          '</ul>'
      },
      {
        icon: 'fa-ruler-combined',
        title: 'Roll Sizes & Coverage',
        html:
          '<p>Each design comes as a <b>1 m × 3 m</b> or <b>1.5 m × 3 m</b> roll — 3 m² and 4.5 m² respectively. Measure your wall, divide by the roll area and round up; order all rolls together so they come from one print run and match.</p>'
      },
      {
        icon: 'fa-screwdriver-wrench',
        title: 'Installation',
        html:
          '<p>Clean and dry the wall, peel about 30 cm of backing, line the top edge up with a spirit level, then smooth downward with a squeegee while peeling the rest. Overlap the next drop by a few millimetres and trim at the skirting.</p>' + RETURNS_NOTE
      },
      SHIPPING
    ],

    tapestry: [
      {
        icon: 'fa-layer-group',
        title: 'Material & Finish',
        open: true,
        html:
          '<ul class="spec-list">' +
          '<li>Soft-touch printed polyester — light, matte, and it hangs flat instead of curling</li>' +
          '<li>Colour printed edge to edge, then hemmed on all four sides</li>' +
          '<li><b>Metal grommets in all four corners</b>, so nothing tears at the hanging points</li>' +
          '<li>Fade-resistant inks — safe on a wall that catches afternoon light</li>' +
          '<li>Printed to order, no minimum</li>' +
          '</ul>'
      },
      {
        icon: 'fa-ruler-combined',
        title: 'Sizes',
        html:
          '<p>Seven sizes: 24 × 24, 26 × 36, 30 × 40, 35 × 45, 40 × 50, 48 × 54 and 54 × 84 inches. Each one is a swatch on this page with its own price.</p>' +
          '<p class="spec-note">A 30 × 40 covers the wall above a double bed-head; 54 × 84 is a full feature wall or a doorway hanging.</p>'
      },
      {
        icon: 'fa-screwdriver-wrench',
        title: 'Hanging It',
        html:
          '<p>Four adhesive screws come in the box, so most walls need no drill. Mark the two top corners level, press the adhesive mounts on, let them set, then hook the grommets over and do the bottom two.</p>' +
          '<p>The grommets also take pins, nails, hooks or a curtain rod threaded through the top pair.</p>' + RETURNS_NOTE
      },
      {
        icon: 'fa-droplet',
        title: 'Care',
        html:
          '<p>Shake it out or go over it with a lint roller. If it needs more, hand wash cold with a mild detergent and line dry — no bleach, no tumble dryer. Iron on the lowest setting from the back only, with a cloth in between.</p>'
      },
      SHIPPING
    ],

    metal: [
      {
        icon: 'fa-layer-group',
        title: 'Material & Finish',
        open: true,
        html:
          '<ul class="spec-list">' +
          '<li>Rigid aluminium panel, printed directly onto the surface</li>' +
          '<li>Fine satin finish — no glass and no frame, so no glare and nothing to shatter</li>' +
          '<li>Rounded corners and a flush mount that holds it just off the wall</li>' +
          '<li>Wipes clean; fine for a kitchen, a studio or a bathroom wall</li>' +
          '</ul>' +
          '<p class="spec-note">This collection is still being finalised — sizes and prices on this page are provisional.</p>'
      },
      {
        icon: 'fa-ruler-combined',
        title: 'Sizes',
        html:
          '<p>Four sizes: 8 × 12, 12 × 18, 16 × 24 and 24 × 36 inches. Each one is a swatch on this page with its own price.</p>'
      },
      {
        icon: 'fa-box-open',
        title: 'Packing & Handling',
        html:
          '<p>Shipped corner-protected in a rigid mailer with a film over the face. Peel the film only once it is on the wall — the satin surface marks easily before it settles.</p>' + RETURNS_NOTE
      },
      SHIPPING
    ],

    plate: [
      {
        icon: 'fa-layer-group',
        title: 'Material & Finish',
        open: true,
        html:
          '<ul class="spec-list">' +
          '<li>Ceramic decorative plate with a glossy sublimated surface</li>' +
          '<li>Available as 8″, 10″ and 12″ rounds</li>' +
          '<li>Wall-display piece — hand wash only, not for cutting or oven use</li>' +
          '</ul>'
      },
      SHIPPING
    ],

    lighting: [
      {
        icon: 'fa-lightbulb',
        title: 'Luminaire Specs & Build',
        open: true,
        html:
          '<ul class="spec-list">' +
          '<li><b>Architectural Grade Materials</b> — die-cast aluminum, brushed electroplated brass, and K9 optic crystal/frosted acrylic elements</li>' +
          '<li><b>High CRI LED Optics</b> — CRI > 90 for natural color rendering, flicker-free dimming/switching</li>' +
          '<li><b>Grid Certified Drivers</b> — IC surge-protected ballast designed for Indian 220V–240V AC 50Hz electrical supply</li>' +
          '<li><b>Heat Dissipation</b> — thermal management fins engineered for 50,000+ hour operating lifespan</li>' +
          '</ul>'
      },
      {
        icon: 'fa-screwdriver-wrench',
        title: 'Installation & Mounting',
        html:
          '<ul class="spec-list">' +
          '<li>Supplied with heavy-duty ceiling mounting canopy, hardware, and anchor fasteners</li>' +
          '<li>Adjustable suspension wires / rods for variable ceiling drop heights</li>' +
          '<li>Standard 2-wire / 3-wire junction box compatible</li>' +
          '<li>Professional electrician installation recommended for heavy crystal chandeliers and ceiling fans</li>' +
          '</ul>'
      },
      {
        icon: 'fa-shield-halved',
        title: 'Transit Safety Guarantee',
        html:
          '<p>Every lighting fixture is tested and packaged in custom multi-layer impact polyfoam. In the rare event of glass or crystal transit damage, free replacement parts or full fixture are dispatched within 24 hours.</p>' + RETURNS_NOTE
      },
      SHIPPING
    ],

    generic: [
      {
        icon: 'fa-circle-info',
        title: 'About This Product',
        open: true,
        html: '<p>Inspected and quality verified at our Patna showroom before dispatch. Full specifications are detailed above.</p>' + RETURNS_NOTE
      },
      SHIPPING
    ]
  };

  // Maps productType/category onto a copy key. Lighting categories default to 'lighting'.
  function keyFor(productType, category) {
    const t = String(productType || '').trim().toLowerCase();
    const c = String(category || '').trim().toLowerCase();
    const pick = t || c;
    if (!pick) return 'lighting';
    if (pick.includes('light') || pick.includes('lamp') || pick.includes('chandelier') || pick.includes('fan') || pick.includes('spot') || pick.includes('cob') || pick.includes('profile') || pick.includes('strip') || pick.includes('rope')) return 'lighting';
    if (pick.startsWith('poster')) return 'poster';
    if (pick === 'apparel' || pick.includes('shirt') || pick === 't-shirts') return 'apparel';
    if (pick.includes('hoodie')) return 'hoodie';
    if (pick.startsWith('sticker')) return 'sticker';
    if (pick.startsWith('wallpaper')) return 'wallpaper';
    if (pick.startsWith('metal')) return 'metal';
    if (pick.startsWith('tapestr')) return 'tapestry';
    if (pick.startsWith('plate')) return 'plate';
    return 'lighting';
  }

  function render(productType, category) {
    const host = document.querySelector('#product-modal .product-accordions');
    if (!host) return;
    const entries = COPY[keyFor(productType, category)] || COPY.generic;
    host.innerHTML = entries.map(e => `
      <details class="product-accordion"${e.open ? ' open' : ''}>
        <summary><i class="fa-solid ${e.icon}" aria-hidden="true"></i> ${e.title}</summary>
        <div class="accordion-content">${e.html}</div>
      </details>`).join('');
  }

  window.ProductCopy = { render: render, keyFor: keyFor, COPY: COPY };
})();
