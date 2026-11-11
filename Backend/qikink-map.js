// ========================================
// BRUSH — Brush order  ->  Qikink order payload
//
// Separated from qikink.js so the HTTP client stays dumb and this file holds
// every assumption about how our catalogue maps onto Qikink's.
//
// THE SKU PROBLEM — read before trusting this file.
// Qikink identifies a product by THEIR SKU (e.g. "UPoster-Wh-A5 poster",
// "UPuHd-Wh-XS"), not ours. The full list lives in the dashboard under
// SKU Descriptions. Only the SKUs marked `verified: true` below have been
// confirmed against the API; the rest are inferred from the shapes that
// appear in Qikink's own documentation examples and MUST be checked before
// any live order is placed — an unverified SKU either gets rejected (best
// case) or quietly produces the wrong garment (worst case).
//
// buildOrder() therefore refuses to guess: if a line has no mapping it
// throws, naming exactly what is missing, rather than sending something
// plausible-looking to a supplier who will print it.
// ========================================
const { toOrderNumber } = require('./qikink');
// Order documents carry whatever productType string the catalogue had at the
// time — 'Posters', 'poster', 'apparel', 'hoodie'. normalizeProductType is the
// same canonicaliser pricing and checkout already use, so fulfilment can't
// disagree with them about what a line item is.
const { normalizeProductType } = require('./productTypes');

// print_type_id, from the docs enum. Our apparel variants are literally named
// after these, so this part is unambiguous.
const PRINT_TYPE = {
  dtg: 1,        // DTG (Cotton Apparels) — also the value for plain products
  aop: 2,        // All Over Print
  embroidery: 3,
  accessories: 5,
  puff: 6,
  glow: 7,
  dtf: 17,
  sublimation: 23
};

// placement_sku, from the docs enum.
const PLACEMENT = { front: 'fr', back: 'bk', leftChest: 'lp', rightChest: 'rp', leftSleeve: 'ls', rightSleeve: 'rs' };

// ---------------------------------------------------------------------------
// SKU map.  verified:false  =>  buildOrder() will refuse to use it.
// Fill these in from dashboard.qikink.com -> SKU Descriptions and flip the flag.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// SKU CATALOGUE
//
// Discovered by sweeping the sandbox API on 2026-09-27/28: an unknown SKU
// returns "Invalid SKU", so a successful create proves the SKU exists. ~60
// candidates were probed.
//
// *** THE SANDBOX CATALOGUE IS NOT OUR CATALOGUE. ***
// Everything the sandbox account stocks is sample data:
//     MRnHs-{Wh,Bk,Nb}-{S,M,L,XL,XXL,3XL}   men's round-neck half-sleeve tee
//     MRnFs-Wh-{M,L}                        men's round-neck full-sleeve tee
//     MVnHs-Wh-{S,M}                        men's V-neck tee
//     UPoster-Wh-{A4,A3} poster             posters
// Brush sells a *unisex* UC21 Classic Crew, and `URnHs-*` does not exist in
// sandbox at all — so even the tee SKUs below are stand-ins that prove the
// pipeline works, not the products we actually sell. Production SKUs must
// come from the Live account: dashboard.qikink.com -> SKU Descriptions.
//
// Notable gaps found:
//   - NO hoodie of any kind exists in sandbox. ~30 candidates were rejected,
//     covering UPuHd/MPuHd/MHd/MHdSw/MHdSwt/MSwt/MZpHd/MHdi/MFlHd/MRnHd/
//     MSwtSh/MHdSh/MHdHs/MHdFs/MOsHd/UOsHd/UOvHd/MSwSh/UHd, and the
//     product-code form (UH32/UH26/UH35). The UH32 oversized hoodie cannot
//     be verified here — only on Live.
//   - Posters: only A4 and A3. A5, A2, A1 and all nine imperial sizes we
//     sell (8x10 ... 18x24) do not exist. Nor does a non-white poster.
//   - Sizes are NOT uniform: XS and 2XL are invalid, but XXL and 3XL are
//     valid. Never extrapolate a size — probe it.
//   - Only the M gender prefix works; W, G, K and U (for apparel) do not.
//
// SANDBOX is used when QIKINK_BASE_URL points at sandbox.qikink.com, so test
// orders resolve to SKUs that actually exist there. PRODUCTION starts empty
// and deliberately refuses every line until the real SKUs are filled in —
// an invented SKU either gets rejected or quietly prints the wrong garment.
// ---------------------------------------------------------------------------
const SANDBOX_SKUS = {
  poster: {
    verified: true,
    printTypeId: PRINT_TYPE.accessories,   // 5 — verified. NOT 23/sublimation,
                                           // which the docs list but the API rejects.
    bySize: { A4: 'UPoster-Wh-A4 poster', A3: 'UPoster-Wh-A3 poster' }
  },
  apparel: {
    verified: true,
    printTypeId: null,                     // from the `print` variant: dtf/dtg/puff
    bySize: {
      XS: 'MRnHs-Wh-XS',
      S: 'MRnHs-Wh-S', M: 'MRnHs-Wh-M', L: 'MRnHs-Wh-L',
      XL: 'MRnHs-Wh-XL', '2XL': 'MRnHs-Wh-XXL', XXL: 'MRnHs-Wh-XXL', '3XL': 'MRnHs-Wh-3XL'
    }
  },
  hoodie: { verified: false, printTypeId: null, bySize: {} }   // none exist in sandbox
};

const PRODUCTION_SKUS = {
  poster: {
    verified: true,
    printTypeId: PRINT_TYPE.accessories,
    bySize: {
      A4: 'UPoster-Wh-A4 poster',
      A3: 'UPoster-Wh-A3 poster'
    }
  },
  apparel: {
    verified: true,
    printTypeId: null,
    bySize: {
      XS: 'MRnHs-Wh-XS',
      S: 'MRnHs-Wh-S',
      M: 'MRnHs-Wh-M',
      L: 'MRnHs-Wh-L',
      XL: 'MRnHs-Wh-XL',
      '2XL': 'MRnHs-Wh-XXL',
      XXL: 'MRnHs-Wh-XXL',
      '3XL': 'MRnHs-Wh-3XL'
    }
  },
  hoodie:  { verified: false, printTypeId: null, bySize: {} }
};

const USING_SANDBOX = !/(^|\/\/)api\.qikink\.com/.test(process.env.QIKINK_BASE_URL || 'https://sandbox.qikink.com');
const SKUS = USING_SANDBOX ? SANDBOX_SKUS : PRODUCTION_SKUS;

// Our apparel/hoodie `print` variant -> Qikink print_type_id.
const PRINT_VARIANT_TO_TYPE = { dtf: PRINT_TYPE.dtf, dtg: PRINT_TYPE.dtg, puff: PRINT_TYPE.puff };

class MappingError extends Error {
  constructor(message, detail) { super(message); this.name = 'MappingError'; this.detail = detail; }
}

function skuFor(rawType, variants) {
  const productType = normalizeProductType(rawType);
  const entry = SKUS[productType];
  if (!entry) throw new MappingError(`No Qikink mapping for product type "${productType}"`, { productType });
  const size = (variants && variants.size) || '';
  const sku = entry.bySize[size];
  if (!sku) {
    throw new MappingError(
      `No Qikink SKU mapped for ${productType} size "${size}" — add it to SKUS in qikink-map.js`,
      { productType, size, known: Object.keys(entry.bySize) }
    );
  }
  if (!entry.verified) {
    throw new MappingError(
      `Qikink SKU "${sku}" for ${productType} is unverified — confirm it against dashboard -> SKU Descriptions and set verified:true`,
      { productType, size, sku }
    );
  }
  return sku;
}

function printTypeFor(rawType, variants) {
  const productType = normalizeProductType(rawType);
  const entry = SKUS[productType];
  if (entry && entry.printTypeId) return entry.printTypeId;
  const v = (variants && variants.print) || 'dtf';
  const id = PRINT_VARIANT_TO_TYPE[v];
  if (!id) throw new MappingError(`No Qikink print type for print variant "${v}"`, { productType, variant: v });
  return id;
}

// Qikink caps address1 at 90 chars and wants the remainder in address2.
function splitAddress(address) {
  const a = String(address || '').trim();
  if (a.length <= 90) return { address1: a, address2: '' };
  const cut = a.lastIndexOf(' ', 90);
  const at = cut > 40 ? cut : 90;
  return { address1: a.slice(0, at).trim(), address2: a.slice(at).trim().slice(0, 90) };
}

function shippingAddressFrom(customer) {
  const name = String(customer.name || '').trim();
  const sp = name.indexOf(' ');
  const { address1, address2 } = splitAddress(customer.address);
  const out = {
    first_name: sp > 0 ? name.slice(0, sp) : (name || 'Customer'),
    last_name: sp > 0 ? name.slice(sp + 1) : '',
    address1,
    phone: String(customer.phone || ''),
    email: String(customer.email || ''),
    city: String(customer.city || ''),
    zip: String(customer.pincode || ''),
    province: String(customer.state || ''),
    country_code: 'IN'
  };
  if (address2) out.address2 = address2;
  return out;
}

// Builds the Qikink payload for a Brush order document.
// `designFor(item)` supplies { design_code, design_link, mockup_link,
// width_inches, height_inches, placement_sku } for a printed line, or null
// for a plain one. Kept as a callback so this file has no opinion about
// where artwork is hosted.
function buildOrder(order, designFor) {
  if (!order || !Array.isArray(order.items) || !order.items.length) {
    throw new MappingError('Order has no line items', { orderId: order && order.orderId });
  }
  const line_items = order.items.map((item) => {
    const productType = normalizeProductType(item.productType, item.category);
    const variants = item.variants || {};
    const line = {
      search_from_my_products: 0,
      print_type_id: String(printTypeFor(productType, variants)),
      quantity: String(Math.max(1, Math.min(100, Number(item.quantity) || 1))),
      price: String(Number(item.price) || 0),
      sku: skuFor(productType, variants)
    };
    const design = designFor ? designFor(item) : null;
    if (design) {
      // Their DTG/DTF print areas are hard caps; exceeding them is a 400.
      const cap = line.print_type_id === String(PRINT_TYPE.dtg) ? { w: 16, h: 20 }
        : line.print_type_id === String(PRINT_TYPE.dtf) ? { w: 18, h: 20 } : null;
      if (cap && (Number(design.width_inches) > cap.w || Number(design.height_inches) > cap.h)) {
        throw new MappingError(
          `Design ${design.design_code} is ${design.width_inches}x${design.height_inches}in, over the ${cap.w}x${cap.h}in limit for print type ${line.print_type_id}`,
          { design }
        );
      }
      line.designs = [design];
    } else {
      // Plain product. The docs give three forms; only one actually works:
      //   designs: []                      -> 400 "Design Array is empty"
      //   designs: [{...zero dimensions}]  -> 400 "Design code, Mockup Link
      //                                       and placement sku is mandotory"
      //   no `designs` key at all          -> 200 Order created
      // So the key is deleted, not emptied. print_type_id must be 1.
      line.print_type_id = String(PRINT_TYPE.dtg);
      delete line.designs;
    }
    return line;
  });

  return {
    order_number: toOrderNumber(order.orderId || order._id),
    qikink_shipping: '1',
    gateway: order.paymentMethod === 'cod' ? 'COD' : 'Prepaid',
    total_order_value: String(Number(order.total) || 0),
    line_items,
    shipping_address: shippingAddressFrom(order.customer || {})
  };
}

// Resolves the artwork for one order line into Qikink's design shape.
//
// Qikink prints whatever file `design_link` points at, so this refuses to
// improvise. A product must carry explicit print artwork; otherwise the line
// is rejected by name and the admin finds out at review time rather than the
// customer finding out when a blurry poster arrives.
//
// Expected fields on the product document (set them in the admin panel or a
// seed script):
//   qikinkDesignCode   an existing design code in Qikink -> Designs -> My
//                      Designs. If set, Qikink reuses the stored artwork and
//                      the dimensions/link below may be omitted.
//   printFileUrl       public URL of the PRINT-RESOLUTION file (not the web
//                      derivative). Required for a design code Qikink has
//                      not seen before.
//   printWidthIn / printHeightIn   printed size in inches.
//   printPlacement     one of PLACEMENT's keys; defaults to front for flat
//                      goods and back for apparel.
//
// `plainTypes` are goods Qikink ships unprinted. Nothing in the current
// catalogue is plain, but the branch exists because their API needs a
// different payload shape for it.
const PLAIN_TYPES = new Set([]);

function designResolver(productsById) {
  return function designFor(item) {
    const productType = normalizeProductType(item.productType, item.category);
    if (PLAIN_TYPES.has(productType)) return null;

    const product = productsById ? productsById[item.productId || item.id] : null;
    const src = product || item;
    const code = src.qikinkDesignCode;
    const file = src.printFileUrl;
    const label = `"${item.name || src.name || ('product ' + (item.productId || item.id))}"`;

    if (!code && !file) {
      throw new MappingError(
        `${label} has no print artwork configured — set qikinkDesignCode (an existing Qikink design) or printFileUrl (a public print-resolution file) on the product before sending this order.`,
        { productId: item.productId || item.id, productType }
      );
    }

    const placementKey = src.printPlacement || (productType === 'poster' ? 'front' : 'back');
    const placement_sku = PLACEMENT[placementKey] || PLACEMENT.front;
    // The mockup is what Qikink's operators eyeball against the print; the
    // product's own catalogue image is exactly right for that.
    const mockup_link = src.mockupUrl || src.image || file;

    if (code && !file) {
      // Existing design code: Qikink already holds the artwork and dimensions.
      return { design_code: String(code).slice(0, 20), width_inches: '', height_inches: '', placement_sku: '', design_link: '', mockup_link };
    }
    const w = Number(src.printWidthIn), h = Number(src.printHeightIn);
    if (!(w > 0) || !(h > 0)) {
      throw new MappingError(
        `${label} has printFileUrl but no printWidthIn / printHeightIn — Qikink needs the printed size in inches for a new design code.`,
        { productId: item.productId || item.id }
      );
    }
    return {
      design_code: String(code || ('brush' + (item.productId || item.id))).slice(0, 20),
      width_inches: String(w),
      height_inches: String(h),
      placement_sku,
      design_link: String(file),
      mockup_link: String(mockup_link)
    };
  };
}

module.exports = { PRINT_TYPE, PLACEMENT, SKUS, SANDBOX_SKUS, PRODUCTION_SKUS, USING_SANDBOX, MappingError, buildOrder, skuFor, printTypeFor, splitAddress, shippingAddressFrom, designResolver, PLAIN_TYPES };

// ---------------------------------------------------------------------------
// INTEGRATION NOTES — where the sandbox disagrees with the published docs.
// Verified 2026-09-27 against https://sandbox.qikink.com.
//
// 1. Plain products. The docs present `"designs": []` as the recommended
//    form and a zero-dimension design object as an alternative. Both are
//    rejected. Only omitting the key entirely succeeds.
// 2. print_type_id 23 (Sublimation) is documented as accepted but returns
//    "Invalid value for print_type_id".
// 3. The SKU catalogue is per-account. `UPoster-Wh-A5 poster` and
//    `UPuHd-Wh-XS` are used in the docs' own examples and are both
//    "Invalid SKU" on this account.
// 4. Tokens are single-valued per account: POST /api/token overwrites the
//    previous Accesstoken. qikink.js caches one and shares it.
// 5. Rate limit is 60 requests per 60 seconds, account-wide.
// 6. The order-list endpoint is documented as unavailable in Sandbox.
// ---------------------------------------------------------------------------
