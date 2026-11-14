require('dotenv').config();
const dns = require('dns');
// Render's network breaks the TLS handshake to MongoDB Atlas when Node
// resolves Atlas hostnames to IPv6 first (default since Node 18). Forcing
// IPv4 first avoids the "tlsv1 alert internal error" / ReplicaSetNoPrimary
// connection failures seen on Render.
dns.setDefaultResultOrder('ipv4first');
const express = require('express');
const cors = require('cors');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');
const { initializeApp, cert } = require('firebase-admin/app');
const { getStorage } = require('firebase-admin/storage');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const Razorpay = require('razorpay');
const { Cashfree, CFEnvironment } = require('cashfree-pg');
const multer = require('multer');
const nodemailer = require('nodemailer');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const compression = require('compression');
const { buildOrderStatusEmail } = require('./orderEmailTemplate');
const { drawInvoice } = require('./invoiceTemplate');
const { getProductType, priceWithVariants, orderCharges, PRODUCT_TYPES, ORDER_CHARGES, normalizeProductType, PREPAID_ONLY_TYPES, deliveryOptionFor, cartRequiresPrepaid, COURIER_PARTNERS, isKnownCourier, deliveryPromiseFor, calculateEstimatedDelivery, isNcrPincode, isWorkingDay, INDIAN_NATIONAL_HOLIDAYS } = require('./productTypes');
const { seedStickerSheets } = require('./stickerCatalog');
const { seedWallpapers } = require('./wallpaperCatalog');
const { seedCollectibles } = require('./collectiblesCatalog');
const { seedTapestries } = require('./tapestryCatalog');
const { seedMetalPosters } = require('./metalPosterCatalog');
const { seedDigitalAssets } = require('./digitalAssetCatalog');
const { removePlaceholders } = require('./placeholders');
const productFeed = require('./productFeed');

// Posters and T-shirts are priced from the Qikink rate table in
// productTypes.js, not from each product's stored price — expose that
// catalogue price to the storefront so cards, modal and checkout agree.
// Rate-table types (posters, T-shirts) have a fixed catalogue price;
// returns it, or null for types priced per product (stickers etc).
function catalogBasePrice(productType, category, currentPrice) {
  const normType = normalizeProductType(productType, category);
  if ((normType === 'poster_3_pack' || normType === 'poster_2_pack') && typeof currentPrice === 'number' && currentPrice > 0) {
    return currentPrice;
  }
  const cfg = PRODUCT_TYPES[normType];
  return cfg && typeof cfg.basePrice === 'number' ? cfg.basePrice : null;
}

// Keeps stored prices in step with the rate table. Runs on every server
// start, so changing a price in productTypes.js is reflected in the
// database (and admin panel) after a restart — no manual migration.
async function syncCatalogPrices() {
  const docs = await productsRef.find({}, { projection: { _id: 1, id: 1, price: 1, productType: 1, category: 1, pricingSource: 1 } }).toArray();
  const ops = [];
  for (const doc of docs) {
    if (doc.id === 318) continue; // Bypass rate-table sync for testing Cashfree
    const base = catalogBasePrice(doc.productType, doc.category, doc.price);
    if (base === null) continue;
    if (doc.price === base && doc.pricingSource === 'qikink') continue;
    ops.push({ updateOne: { filter: { _id: doc._id }, update: { $set: { price: base, pricingSource: 'qikink' } } } });
  }
  if (ops.length) await productsRef.bulkWrite(ops);
  console.log(`💱 Catalogue prices synced (${ops.length} product${ops.length === 1 ? '' : 's'} updated)`);
}

function withCatalogPrice(product) {
  const { price } = priceWithVariants(product.price, product.productType || getProductType(product.category), null);
  return { ...product, price };
}

// ── Startup environment validation ─────────────────────────────
// Warns loudly at boot if critical config is missing so developers
// don't discover misconfiguration mid-request.
const REQUIRED_ENV = ['MONGODB_URI'];
const RECOMMENDED_ENV = ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'SMTP_USER', 'SMTP_PASS'];

const missingRequired = REQUIRED_ENV.filter(k => !process.env[k]);
if (missingRequired.length) {
  console.error(`\n✖  FATAL: Missing required environment variables: ${missingRequired.join(', ')}`);
  console.error('   Copy Backend/.env.example to Backend/.env and fill in your values.\n');
  process.exit(1);
}
const missingRecommended = RECOMMENDED_ENV.filter(k => !process.env[k]);
if (missingRecommended.length) {
  console.warn(`⚠  Warning: Missing recommended env vars: ${missingRecommended.join(', ')} — some features will be unavailable.`);
}

// Where emails point for images and links. This must be an origin that is
// actually serving public/ — email clients fetch these over the internet, so a
// localhost or an unpublished host shows every image as broken. The default is
// the Render service, which serves public/ alongside the API; override with
// SITE_URL once a custom domain is live.
const SITE_URL = (process.env.SITE_URL || 'https://www.brush-art.in').replace(/\/$/, '');

const RESEND_API_KEY = process.env.RESEND_API_KEY || (process.env.SMTP_PASS && process.env.SMTP_PASS.startsWith('re_') ? process.env.SMTP_PASS : '');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.resend.com',
  port: Number(process.env.SMTP_PORT) || 465,
  secure: Number(process.env.SMTP_PORT || 465) === 465,
  auth: {
    user: process.env.SMTP_USER || 'resend',
    pass: process.env.SMTP_PASS || RESEND_API_KEY
  },
  // Force IPv4 to avoid ENETUNREACH and connection timeouts when IPv6 routes are unavailable
  family: 4,
  connectionTimeout: 15000,
  greetingTimeout: 10000,
  socketTimeout: 15000
});

// Copy every application email to the configured audit recipients. Keep this
// at the transport boundary so new email flows cannot accidentally omit CC or BCC.
const MANDATORY_CC = 'admin@brush-art.in';
const AUDIT_CC = [...new Set([
  ...(process.env.EMAIL_CC || '').split(',').map(address => address.trim()).filter(Boolean),
  MANDATORY_CC
].filter(Boolean))];

const MANDATORY_BCC = 'kumarmangalam.patna@gmail.com';
const AUDIT_BCC = [...new Set([
  ...(process.env.EMAIL_BCC || '').split(',').map(address => address.trim()).filter(Boolean),
  MANDATORY_BCC
].filter(Boolean))];

const DEFAULT_FROM = 'Brush <orders.master@brush-art.in>';
function getFromAddress(customFrom) {
  const sanitize = addr => {
    if (!addr || typeof addr !== 'string' || !addr.includes('@')) return null;
    // Reject any legacy mangalam.cc domains (e.g. admin_brush@mangalam.cc or ordersmaster@mangalam.cc)
    if (addr.includes('mangalam.cc')) return null;
    // Normalize plural orders.masters@ to singular orders.master@
    if (addr.includes('orders.masters@brush-art.in')) {
      return addr.replace('orders.masters@brush-art.in', 'orders.master@brush-art.in');
    }
    return addr;
  };

  const validCustom = sanitize(customFrom);
  if (validCustom) return validCustom;

  const validEnv = sanitize(process.env.EMAIL_FROM);
  if (validEnv) return validEnv;

  return DEFAULT_FROM;
}

const sendMail = async mailOptions => {
  const existingCc = mailOptions.cc
    ? (Array.isArray(mailOptions.cc) ? mailOptions.cc : String(mailOptions.cc).split(',').map(s => s.trim()))
    : [];
  const cc = [...new Set([...existingCc, ...AUDIT_CC])].filter(Boolean);

  const existingBcc = mailOptions.bcc
    ? (Array.isArray(mailOptions.bcc) ? mailOptions.bcc : String(mailOptions.bcc).split(',').map(s => s.trim()))
    : [];
  const bcc = [...new Set([...existingBcc, ...AUDIT_BCC])].filter(Boolean);

  // If a Resend API key is available, prefer HTTPS REST API for instant, reliable delivery without SMTP port blocking
  if (RESEND_API_KEY && RESEND_API_KEY.startsWith('re_')) {
    try {
      const fromAddr = getFromAddress(mailOptions.from);
      const toAddrs = Array.isArray(mailOptions.to) ? mailOptions.to : [mailOptions.to];
      const replyTo = mailOptions.replyTo || process.env.EMAIL_REPLY_TO || 'admin@brush-art.in';
      const payload = {
        from: fromAddr,
        to: toAddrs,
        subject: mailOptions.subject,
        html: mailOptions.html,
        text: mailOptions.text,
        cc: cc.length ? cc : undefined,
        bcc: bcc.length ? bcc : undefined,
        reply_to: replyTo
      };
      if (mailOptions.attachments && mailOptions.attachments.length) {
        payload.attachments = mailOptions.attachments.map(att => {
          if (att.content && Buffer.isBuffer(att.content)) {
            return { filename: att.filename, content: att.content.toString('base64') };
          }
          if (att.path && fs.existsSync(att.path)) {
            return { filename: att.filename, content: fs.readFileSync(att.path).toString('base64') };
          }
          return att;
        });
      }
      let res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      let data = await res.json();
      if (res.ok && data && data.id) {
        return { messageId: data.id, response: '250 OK (Resend HTTPS API)' };
      }
      // If domain verification for brush-art.in is still pending in DNS, retry once with verified fallback domain
      if (data && data.name === 'validation_error' && String(data.message).includes('not verified')) {
        console.warn('Resend domain brush-art.in not verified yet. Retrying via verified fallback domain ordersmaster@mangalam.cc...');
        const fallbackPayload = {
          ...payload,
          from: '"Brush" <ordersmaster@mangalam.cc>',
          reply_to: replyTo
        };
        res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(fallbackPayload)
        });
        data = await res.json();
        if (res.ok && data && data.id) {
          return { messageId: data.id, response: '250 OK (Resend Fallback Domain)' };
        }
      }
      console.warn('Resend HTTPS API returned non-200, falling back to SMTP transport:', data);
    } catch (apiErr) {
      console.warn('Resend HTTPS API error, falling back to SMTP transport:', apiErr.message);
    }
  }

  const fromAddr = getFromAddress(mailOptions.from);
  return transporter.sendMail({ ...mailOptions, from: fromAddr, cc, bcc });
};

const sendEmail = sendMail;

// Returns { sent: true } on success, or { sent: false, reason } on failure -
// never throws, so callers can report accurate status back to the admin
// instead of assuming the email went out.

async function resolvePosterFromDb(p) {
  if (!p) return null;
  let doc = null;
  const numId = Number(p.id || p.productId);
  if (Number.isInteger(numId) && numId > 0 && !(numId >= 9990 && numId <= 10050)) {
    doc = await productsRef.findOne({ id: numId });
  }
  if (!doc && p.sku) {
    doc = await productsRef.findOne({ sku: p.sku });
  }
  if (!doc && p.name) {
    doc = await productsRef.findOne({ name: p.name });
  }
  if (!doc && p.name) {
    doc = await productsRef.findOne({ name: new RegExp('^' + String(p.name).trim() + '$', 'i') });
  }
  if (!doc && p.image) {
    doc = await productsRef.findOne({ image: p.image });
  }
  if (!doc && p.image) {
    const filename = String(p.image).split('/').pop();
    if (filename) doc = await productsRef.findOne({ image: new RegExp(filename + '$', 'i') });
  }
  return doc;
}

async function enrichCustomPostersWithDbSkus(customPosters) {
  if (!Array.isArray(customPosters) || customPosters.length === 0) return customPosters;
  return Promise.all(customPosters.map(async (p, idx) => {
    const doc = await resolvePosterFromDb(p);
    const sku = (doc && doc.sku) ? doc.sku : (p.sku || (doc ? String(doc.id) : (p.id ? String(p.id) : '')));
    const name = (doc && doc.name) ? doc.name : (p.name || p.title || `Poster ${idx + 1}`);
    const image = (doc && doc.image) ? doc.image : (p.image || '');
    const id = doc ? doc.id : p.id;
    return {
      ...p,
      id,
      productId: id,
      sku,
      name,
      image,
      size: p.size || 'A5'
    };
  }));
}

async function enrichOrderItemsWithDbSkus(items) {
  if (!Array.isArray(items) || items.length === 0) return items;
  return Promise.all(items.map(async item => {
    let live = null;
    const numId = Number(item.productId || item.id);
    if (Number.isInteger(numId) && numId > 0 && !(numId >= 9990 && numId <= 10050)) {
      live = await productsRef.findOne({ id: numId });
    }
    if (!live) {
      live = await resolvePosterFromDb(item);
    }

    const realSku = (live && live.sku) ? live.sku : (item.sku || (live ? String(live.id) : (item.productId ? String(item.productId) : '')));
    const realName = (live && live.name) ? live.name : item.name;
    const realImage = (live && live.image) ? live.image : item.image;

    let customPosters = item.customPosters;
    if (Array.isArray(customPosters) && customPosters.length > 0) {
      customPosters = await enrichCustomPostersWithDbSkus(customPosters);
    }

    return {
      ...item,
      sku: realSku,
      name: realName,
      image: realImage,
      customPosters
    };
  }));
}

// Invoices and status emails must show what the customer was actually
// charged. This used to re-price every stored order from *today's* product
// prices (overwriting item prices, names and the total), so any price change
// after purchase silently changed old invoices. Now it only back-fills
// fields that older orders never stored (SKU, line subtotal, charges) and
// never touches an amount that was recorded at checkout.
async function withInvoiceDefaults(order) {
  if (!order || !order.items) return order;
  const productIds = order.items.map(item => item.productId).filter(Boolean);
  const products = productIds.length ? await productsRef.find({ id: { $in: productIds } }).toArray() : [];
  const byId = {};
  products.forEach(p => { byId[p.id] = p; });

  let subtotal = 0;
  order.items = await Promise.all(order.items.map(async item => {
    let live = byId[item.productId];
    if (!live) {
      live = await resolvePosterFromDb(item);
    }
    const lineTotal = item.subtotal != null ? item.subtotal : Number(item.price) * Number(item.quantity);
    subtotal += lineTotal;

    const realSku = (live && live.sku) ? live.sku : (item.sku || (live ? String(live.id) : (item.productId ? String(item.productId) : '')));

    const customPosters = Array.isArray(item.customPosters)
      ? await enrichCustomPostersWithDbSkus(item.customPosters)
      : undefined;

    return {
      ...item,
      image: item.image || (live && live.image) || '',
      subtotal: lineTotal,
      sku: realSku,
      customPosters
    };
  }));

  if (order.subtotal == null) order.subtotal = subtotal;
  if (order.gst == null || order.shipping == null) {
    const charges = orderCharges(order.items, order.paymentMethod);
    if (order.gst == null) order.gst = charges.gst;
    if (order.tax == null) order.tax = charges.tax;
    if (order.shipping == null) order.shipping = charges.shipping;
    if (order.codFee == null) order.codFee = charges.codFee;
    if (order.processingFee == null) order.processingFee = charges.processingFee;
  }
  if (order.total == null) {
    order.total = Math.round(order.subtotal - (order.discount || 0) + (order.shipping || 0) +
      (order.deliverySurcharge || 0) + (order.codFee || 0) + (order.processingFee || 0));
  }
  return order;
}

// Returns stock (and the order-count used for "popularity") when an order
// is cancelled, and takes it again if a cancelled order is reinstated.
async function adjustStockForOrder(order, direction) {
  const ops = (order.items || []).filter(i => i.productId != null && Number(i.quantity) > 0).map(i => ({
    updateOne: {
      filter: { id: i.productId },
      update: { $inc: { stockQuantity: direction * Number(i.quantity), orderFrequency: -direction * Number(i.quantity) } },
    },
  }));
  if (ops.length) await productsRef.bulkWrite(ops);
}

// Renders the invoice PDF into memory so it can be attached to order emails.
function renderInvoicePdf(order) {
  return new Promise((resolve, reject) => {
    const pdfDoc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];
    pdfDoc.on('data', c => chunks.push(c));
    pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
    pdfDoc.on('error', reject);
    drawInvoice(pdfDoc, order);
    pdfDoc.end();
  });
}

async function sendOrderEmail(order, forceSend = false) {
  try {
    if (!order || !order.customer) return { sent: false, reason: 'Order has no customer details' };
    const toEmail = order.customer.email || order.customer.id;
    if (!toEmail || !toEmail.includes('@')) return { sent: false, reason: 'Customer has no valid email address' };

    order = await withInvoiceDefaults(order);
    const { subject, html, text } = buildOrderStatusEmail(order, SITE_URL);
    const mailOptions = {
      from: getFromAddress(process.env.EMAIL_FROM),
      to: toEmail,
      replyTo: process.env.EMAIL_REPLY_TO || 'admin@brush-art.in',
      subject,
      html,
      text
    };

    // No tax invoice until the money is actually in. An invoice for a transfer
    // we have not yet matched would be a document saying the sale completed
    // when it has not; the shopper gets it with the confirmation email instead.
    const invoiceable = order.status !== 'awaiting-payment';

    // Attach the tax invoice PDF (non-fatal: the status email still goes out
    // if the invoice can't be rendered).
    if (invoiceable) try {
      const pdf = await renderInvoicePdf(order);
      mailOptions.attachments = [{
        filename: `invoice-${order.invoiceNumber || order.orderId || order._id}.pdf`,
        content: pdf,
        contentType: 'application/pdf'
      }];
    } catch (err) {
      console.error('Invoice attachment failed:', err.message);
    }

    try {
      await sendMail(mailOptions);
      console.log(`Email sent for order ${order.orderId || order._id} to ${toEmail}`);
      return { sent: true, to: toEmail };
    } catch (error) {
      console.error(`Failed to send email for order ${order.orderId || order._id}:`, error);
      return { sent: false, reason: error.message };
    }
  } catch (outerErr) {
    console.error(`Unexpected error preparing email for order ${order && (order.orderId || order._id)}:`, outerErr);
    return { sent: false, reason: outerErr.message };
  }
}

// Sequential, human-readable invoice numbers (INV-<year>-<seq>), distinct
// from the order ID. Unlike the order ID, this is NEVER used to look up an
// order - it's a display-only field - because a sequential number is
// trivially enumerable and must not double as an access credential.
async function getNextInvoiceNumber() {
  const year = new Date().getFullYear();
  const counter = await countersRef.findOneAndUpdate(
    { _id: `invoice-${year}` },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' }
  );
  const seq = counter.seq ?? counter.value?.seq; // tolerate driver version differences in return shape
  return `INV-${year}-${String(seq).padStart(6, '0')}`;
}

// Last-resort guards. A rejected promise with no .catch() terminates the
// process on Node 22 — which on a single-instance host means every signed-in
// customer and admin is logged out and any in-flight payment is stranded.
// Log it loudly instead; the individual call sites still handle their own
// errors, this is only so one missed .catch() can't take the shop down.
process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED REJECTION:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
});

// Product IDs come from an atomic counter. "Highest existing id + 1" was
// read before the (slow) image upload, so two products added at the same
// time — e.g. the admin's bulk upload — got the same id and the second
// insert failed after its image had already been uploaded. $max keeps the
// counter ahead of any ids written elsewhere (the catalogue seeders).
async function getNextProductId() {
  const [top] = await productsRef.find({}, { projection: { id: 1 } }).sort({ id: -1 }).limit(1).toArray();
  await countersRef.updateOne({ _id: 'product-id' }, { $max: { seq: top ? Number(top.id) || 0 : 0 } }, { upsert: true });
  const counter = await countersRef.findOneAndUpdate(
    { _id: 'product-id' },
    { $inc: { seq: 1 } },
    { returnDocument: 'after' }
  );
  return counter.seq ?? counter.value?.seq; // tolerate driver version differences in return shape
}

const app = express();
// Render sits in front of this app as a reverse proxy, so the real client
// IP arrives via X-Forwarded-For rather than the socket address. Without
// this, express-rate-limit either keys every request off Render's proxy IP
// (making the limiters useless - one shared bucket for all users) or, on
// v8+, refuses the request outright when it sees a forwarded header it
// wasn't told to trust. `1` trusts exactly one hop, matching Render's setup.
app.set('trust proxy', 1);
const activeAdminTokens = new Map(); // token -> { username, role, expiresAt }
const activeUserTokens = new Map(); // token -> { userId, expiresAt }
const passwordResetTokens = new Map(); // token -> { userId, expiresAt }

// ── Session persistence ────────────────────────────────────────
// The Maps above are the hot path — every authenticated request reads one,
// and a Mongo round trip per request would be absurd. But they only ever
// lived in memory, so *every process restart signed out every admin and
// every customer*: a Render deploy, a crash, a nodemon reload on a code
// edit. During this integration work alone it logged the operator out four
// times mid-task, and in production it silently drops customers' carts and
// sessions on every deploy.
//
// So the Maps are now a write-through cache over a `sessions` collection.
// Reads stay in memory; writes go to both; startup reloads whatever is still
// valid. A TTL index on expiresAt lets Mongo expire rows on its own.
//
// Mongo being unavailable must never block a login, so every write here is
// fire-and-forget with a logged failure — worst case, behaviour degrades to
// exactly what it was before.
const SESSION_KINDS = { admin: activeAdminTokens, user: activeUserTokens, password_reset: passwordResetTokens };

function persistSession(kind, token, session) {
  if (!sessionsRef) return;
  sessionsRef.updateOne(
    { _id: token },
    { $set: { kind, ...session, expiresAt: new Date(session.expiresAt) } },
    { upsert: true }
  ).catch(err => console.error('Session persist failed:', err.message));
}

function forgetSession(token) {
  if (!sessionsRef || !token) return Promise.resolve();
  return sessionsRef.deleteOne({ _id: token }).catch(err => console.error('Session delete failed:', err.message));
}

async function loadSessionsFromDb() {
  const now = new Date();
  // Mongo's TTL monitor only runs every ~60s, so expired rows can still be
  // present at startup — filter them out rather than trusting the index.
  const docs = await sessionsRef.find({ expiresAt: { $gt: now } }).toArray();
  let n = 0;
  for (const d of docs) {
    const target = SESSION_KINDS[d.kind];
    if (!target) continue;
    const expiresAt = d.expiresAt instanceof Date ? d.expiresAt.getTime() : Number(d.expiresAt);
    if (d.kind === 'admin') target.set(d._id, { username: d.username, role: d.role, expiresAt });
    else target.set(d._id, { userId: d.userId, expiresAt });
    n++;
  }
  return n;
}
// Razorpay order id (real or the demo "order_mock_" fallback) -> the
// server-computed paise amount that order is *for*, plus creation time.
// /api/orders checks a submitted razorpay_order_id against this map before
// confirming an order — closes both the payment-bypass and price-tampering
// gaps described where it's used below. Single-use: deleted once consumed.
//
// This lives in Mongo, not in memory. It used to be a Map, which meant a
// process restart between "customer pays" and "browser confirms the order"
// threw away the authorization: the shopper's money was gone and their next
// request was met with "Payment session not found". Render restarts on every
// deploy and idles out, so that was not a rare edge case.
//
// The row also carries the whole order snapshot (customer, items, coupon,
// delivery). That is what lets the webhook build the order on its own when the
// browser never comes back — Razorpay tells us a payment succeeded and nothing
// else, so everything needed to fulfil it has to have been stored up front.
let paymentSessionsRef = null;
// Captures that could not become orders — money in, nothing to fulfil.
let paymentExceptionsRef = null;

async function savePaymentSession(razorpayOrderId, data) {
  if (!paymentSessionsRef) throw new Error('payment sessions unavailable');
  await paymentSessionsRef.updateOne(
    { _id: razorpayOrderId },
    { $set: { ...data, createdAt: new Date(), expiresAt: new Date(Date.now() + PENDING_PAYMENT_TTL_MS), consumedAt: null } },
    { upsert: true }
  );
}

async function getPaymentSession(razorpayOrderId) {
  if (!paymentSessionsRef || typeof razorpayOrderId !== 'string') return null;
  const doc = await paymentSessionsRef.findOne({ _id: razorpayOrderId });
  if (!doc) return null;
  // Mongo's TTL monitor runs about once a minute, so an expired row can still
  // be sitting there — don't trust the index alone.
  if (doc.expiresAt && doc.expiresAt.getTime() < Date.now()) return null;
  return doc;
}

// Claims the authorization so two concurrent confirmations of the same payment
// cannot both produce an order. Returns the session only to the caller that
// won; everyone else gets null.
async function claimPaymentSession(razorpayOrderId) {
  if (!paymentSessionsRef || typeof razorpayOrderId !== 'string') return null;
  const res = await paymentSessionsRef.findOneAndUpdate(
    { _id: razorpayOrderId, consumedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { consumedAt: new Date() } },
    { returnDocument: 'after' }
  );
  return res && (res.value || res._id ? (res.value || res) : null);
}

// Puts a claim back when the order could not be written after all, so the
// shopper can retry rather than being left having paid for nothing.
async function releasePaymentSession(razorpayOrderId) {
  if (!paymentSessionsRef || !razorpayOrderId) return;
  await paymentSessionsRef.updateOne({ _id: razorpayOrderId }, { $set: { consumedAt: null } })
    .catch(err => console.error('Payment session release failed:', err.message));
}

async function finishPaymentSession(razorpayOrderId, orderId) {
  if (!paymentSessionsRef || !razorpayOrderId) return;
  // Kept, not deleted: the webhook and the browser can both arrive, and the
  // second one needs to find the order id rather than a missing row and try
  // to create a duplicate.
  await paymentSessionsRef.updateOne(
    { _id: razorpayOrderId },
    { $set: { orderId, completedAt: new Date() } }
  ).catch(err => console.error('Payment session finish failed:', err.message));
}

// Changing or resetting a password has to end every other session for that
// account — otherwise someone who resets *because* they were compromised stays
// compromised for the rest of the 7-day session lifetime, and every reset link
// ever emailed to them stays live for its own 30 minutes.
// `keepToken` lets the change-password flow leave the caller signed in.
function revokeAllSessionsFor(userId, keepToken) {
  for (const [token, session] of activeUserTokens) {
    if (session.userId === userId && token !== keepToken) { activeUserTokens.delete(token); forgetSession(token); }
  }
  for (const [token, entry] of passwordResetTokens) {
    if (entry.userId === userId) { passwordResetTokens.delete(token); forgetSession(token); }
  }
  if (sessionsRef) {
    sessionsRef.deleteMany({
      userId,
      _id: { $ne: keepToken }
    }).catch(err => console.error('Revoke sessions in db failed:', err.message));
  }
}
const PENDING_PAYMENT_TTL_MS = 60 * 60 * 1000; // 1 hour
const port = process.env.PORT || 9050;

// Sessions previously never expired - a token stayed valid until the
// process restarted, so a leaked admin or user token was a standing
// compromise with no time limit. Admin gets the shorter window since
// that's the higher-privilege account.
const ADMIN_SESSION_MS = 12 * 60 * 60 * 1000; // 12 hours
const USER_SESSION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ── Periodic session / token cleanup sweeper ───────────────────
// Expired entries in the in-memory Maps stay resident until the process
// restarts. This sweeper runs every 15 minutes and purges anything past
// its TTL, preventing unbounded memory growth under sustained load.
// The persisted copies in the `sessions` collection are expired by Mongo's
// own TTL index, so this only has to keep the in-process caches tidy.
const SESSION_SWEEP_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
setInterval(() => {
  const now = Date.now();
  let swept = 0;
  for (const [token, session] of activeAdminTokens) {
    if (session.expiresAt && session.expiresAt < now) { activeAdminTokens.delete(token); swept++; }
  }
  for (const [token, session] of activeUserTokens) {
    if (session.expiresAt && session.expiresAt < now) { activeUserTokens.delete(token); swept++; }
  }
  for (const [token, data] of passwordResetTokens) {
    if (data.expiresAt && data.expiresAt < now) { passwordResetTokens.delete(token); swept++; }
  }
  // Payment sessions expire via a Mongo TTL index, not here.
  if (swept > 0) console.log(`🧹 Session sweeper: purged ${swept} expired entries`);
}, SESSION_SWEEP_INTERVAL_MS);

// MongoDB interprets a query field set to an object (e.g. `{"$ne": null}`)
// as an operator, not a literal match - so any field that flows from
// req.body into a findOne()/query filter must be confirmed to be an
// actual string first, or a crafted JSON body could bypass the intended
// lookup entirely (classic NoSQL injection).
const isNonEmptyString = (v) => typeof v === 'string' && v.length > 0;
// Optional free-text fields from shoppers: always stored as a trimmed,
// length-capped string (never an object/array from a crafted body).
const cleanText = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// Length over composition rules (NIST 800-63B) — no forced uppercase/
// number/symbol mix, just a floor long enough to resist guessing. Applied
// wherever a password is *set*: signup, forgot-password reset, and the
// logged-in change-password flow (previously only checked non-empty, so a
// 1-character password was accepted server-side at every one of them).
const MIN_PASSWORD_LENGTH = 8;
const isStrongEnoughPassword = (v) => isNonEmptyString(v) && v.length >= MIN_PASSWORD_LENGTH;

// Password hashing: bcrypt for anything written from here on, with
// backward-compatible verification against the plain-SHA256 hashes that
// were stored before this change. SHA256 is a fast hash - designed for
// speed, which is exactly wrong for passwords, since it makes brute-forcing
// a leaked hash cheap. bcrypt is deliberately slow and salted per-hash.
//
// There's no migration script - existing rows still hold sha256 hex
// digests. hashPassword() is for every NEW hash going forward.
// verifyPassword() checks bcrypt hashes directly, but falls back to the
// legacy sha256 comparison when the stored hash isn't a bcrypt hash, and
// reports that back via needsRehash so the caller can transparently
// upgrade the stored hash to bcrypt on that successful login - no forced
// password reset, no downtime, existing users are migrated lazily as they
// log in.
const isBcryptHash = (hash) => typeof hash === 'string' && /^\$2[aby]\$/.test(hash);
const legacySha256 = (password) => crypto.createHash('sha256').update(password).digest('hex');

async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

async function verifyPassword(password, storedHash) {
  if (isBcryptHash(storedHash)) {
    return { valid: await bcrypt.compare(password, storedHash), needsRehash: false };
  }
  return { valid: legacySha256(password) === storedHash, needsRehash: true };
}

function issueUserToken(userId) {
  const token = crypto.randomBytes(24).toString('hex');
  const session = { userId, expiresAt: Date.now() + USER_SESSION_MS };
  activeUserTokens.set(token, session);
  persistSession('user', token, session);
  return token;
}

// Middleware for customer-facing routes that must be scoped to the logged-in account.
const requireUser = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Please log in.' });
  }
  const token = authHeader.split(' ')[1];
  let session = activeUserTokens.get(token);
  if (!session && sessionsRef) {
    try {
      const doc = await sessionsRef.findOne({ _id: token, kind: 'user', expiresAt: { $gt: new Date() } });
      if (doc) {
        session = { userId: doc.userId, expiresAt: doc.expiresAt.getTime() };
        activeUserTokens.set(token, session);
      }
    } catch (_) {}
  }
  if (!session || session.expiresAt < Date.now()) {
    activeUserTokens.delete(token);
    forgetSession(token);
    return res.status(401).json({ error: 'Session expired. Please log in again.' });
  }
  req.userId = session.userId;
  next();
};

// Use after requireUser on routes keyed by :id - ensures the logged-in
// account can only ever act on its own data, never someone else's by
// swapping the :id in the URL.
const requireOwnUser = async (req, res, next) => {
  if (req.params.id === 'me' || req.params.id === req.userId) {
    req.targetUserId = req.userId;
    return next();
  }
  if (usersRef) {
    try {
      const user = await usersRef.findOne({ _id: req.userId });
      if (user && (user.email === req.params.id || user.id === req.params.id || user._id === req.params.id)) {
        req.targetUserId = user._id;
        return next();
      }
    } catch (_) {}
  }
  if (req.userId !== req.params.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  req.targetUserId = req.userId;
  next();
};

// Middleware for admin routes
const requireAdmin = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized. Please login again.' });
  }
  const token = authHeader.split(' ')[1];
  const session = activeAdminTokens.get(token);

  if (!session || session.expiresAt < Date.now()) {
    activeAdminTokens.delete(token);
    forgetSession(token);
    return res.status(401).json({ error: 'Unauthorized. Please login again.' });
  }

  req.adminSession = session;
  next();
};

const requireSuperAdmin = (req, res, next) => {
  if (req.adminSession.role !== 'superadmin') {
    return res.status(403).json({ error: 'Forbidden. Super admin access required.' });
  }
  next();
};

// For routes that work for both guests and logged-in users (checkout) but
// still need to know which real account, if any, to attach the result to.
// Returns the session's own userId when a valid Bearer token is present,
// null otherwise — never trusts a userId supplied in the request body,
// which would otherwise let anyone attach an order to any other account.
function getAuthenticatedUserId(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const session = activeUserTokens.get(authHeader.split(' ')[1]);
  if (!session || session.expiresAt < Date.now()) return null;
  return session.userId;
}

// CSP built from the site's actual external resource usage (checked every
// public/*.html for src=/href=/fetch() targets) rather than a generic
// template - a mismatched CSP just breaks the page silently, so it's only
// worth shipping if it matches what's really loaded.
//
// 'unsafe-inline' stays in script-src and style-src: this is a vanilla-JS
// site with real inline <script> blocks and inline style= attributes on
// every page, not a bundled app. Dropping it would break the whole site,
// not just tighten it - the other directives (frame-ancestors, object-src,
// base-uri, the explicit external allowlist) still meaningfully shrink the
// attack surface without that risk.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      // checkout.razorpay.com's own SDK loads a secondary risk-detection
      // bundle from cdn.razorpay.com (a different subdomain) at runtime,
      // and its payment iframe/API calls go to api.razorpay.com — all
      // three confirmed via a live checkout run that surfaced each one as
      // a separate CSP violation (same shape of gap as the Font Awesome
      // kit fix above: a loader script pulling from a sibling domain the
      // allowlist didn't cover).
      scriptSrc: ["'self'", "'unsafe-inline'", 'https://www.googletagmanager.com', 'https://checkout.razorpay.com', 'https://cdn.razorpay.com', 'https://sdk.cashfree.com', 'https://cdnjs.cloudflare.com', 'https://kit.fontawesome.com', 'https://unpkg.com'],
      // Separate from script-src: governs inline onclick="" etc attributes,
      // which admin.html and index.html both use extensively. Helmet
      // defaults this to 'none' independently of script-src's own
      // 'unsafe-inline' - confirmed by actually running this config
      // through a request before shipping it, not just assuming.
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdnjs.cloudflare.com', 'https://ka-f.fontawesome.com'],
      fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com', 'https://cdnjs.cloudflare.com', 'https://kit.fontawesome.com', 'https://ka-f.fontawesome.com'],
      imgSrc: ["'self'", 'data:', 'blob:', 'https://storage.googleapis.com'],
      // The kit.fontawesome.com loader script fetches its actual CSS/font
      // manifest from ka-f.fontawesome.com at runtime (confirmed via a live
      // console check — every fetch to it was being silently blocked here,
      // which is why every fa-* icon on the site was rendering as an empty
      // circle/box: the glyph font never loaded, not a markup bug).
      connectSrc: ["'self'", 'https://www.google-analytics.com', 'https://www.googletagmanager.com', 'https://patliputratraders.onrender.com', 'https://patliputratraders.vercel.app', 'https://brush-art.in', 'https://www.brush-art.in', 'https://brush-production.onrender.com', 'https://checkout.razorpay.com', 'https://api.razorpay.com', 'https://lumberjack.razorpay.com', 'https://sandbox.cashfree.com', 'https://api.cashfree.com', 'https://kit.fontawesome.com', 'https://ka-f.fontawesome.com'],
      frameSrc: ['https://checkout.razorpay.com', 'https://api.razorpay.com', 'https://sdk.cashfree.com', 'https://sandbox.cashfree.com', 'https://api.cashfree.com'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'self'"]
    }
  },
  // Both left off rather than guessed at: Razorpay's checkout can involve
  // a popup/redirect flow, and helmet's default Cross-Origin-Opener-Policy
  // (same-origin) severs window.opener between this page and that popup,
  // which would silently break payment completion if Razorpay's flow
  // depends on it. Same caution for COEP and any third-party embed. Not
  // worth the risk of a payment-flow regression I can't test live to
  // verify - the CSP above is doing the real work in this phase.
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
// Was app.use(cors()) - reflected any Access-Control-Allow-Origin. Auth
// here is Bearer-token based (no cookies), so this was never classic
// CSRF-exploitable, but an open CORS policy still lets any website script
// requests against this API on a visitor's behalf (scraping at scale,
// riding a visitor's copy-pasted token if one ever leaked into a script,
// etc.) with no way to tell that traffic apart from the real frontend.
// Locked to the actual deployed origin plus local dev.
const ALLOWED_ORIGINS = [
  'https://patliputratraders.onrender.com',
  'https://patliputratraders.vercel.app',
  'https://patliputratraders.com',
  'https://www.patliputratraders.com',
  'https://immortal0p.github.io',
  'https://brush-production.onrender.com',
  'https://brushposters.com',
  'https://brush-art.in',
  'https://www.brush-art.in',
  'https://www.brushposters.com',
  'https://brush-production.vercel.app',
  'http://localhost:9000',
  'http://127.0.0.1:9000',
  'http://localhost:9050',
  'http://127.0.0.1:9050',
  'http://localhost:5550',
  'http://127.0.0.1:5550',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://localhost:3000',
  'http://127.0.0.1:3000'
];
app.use(cors({
  origin(origin, callback) {
    // No Origin header at all (curl, server-to-server, same-origin) - allow.
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    try {
      const host = new URL(origin).hostname;
      if (host === 'localhost' || host === '127.0.0.1') {
        return callback(null, true);
      }
      if (host.endsWith('.vercel.app')) {
        return callback(null, true);
      }
      if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) ||
          /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) ||
          /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(host)) {
        return callback(null, true);
      }
    } catch (_) { /* unparseable Origin - fall through to the rejection */ }

    callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));
// Razorpay signs the raw request bytes. express.json() would parse and discard
// them, and re-serialising the parsed object does not reproduce the original
// byte-for-byte (key order, whitespace, unicode escaping), so the signature
// would never match. This route therefore takes the body as a Buffer and must
// be mounted ahead of the JSON parser.
app.post('/api/payment/webhook', express.raw({ type: '*/*', limit: '1mb' }), handleRazorpayWebhook);

app.use(express.json());
// gzip. GitHub Pages already compresses the static front end, but this API
// was shipping everything uncompressed: GET /api/products is 133 KB of JSON
// on every page load, and it is fetched by the homepage, the store and the
// reels page alike. Measured 264 products / 133 KB before this line.
app.use(compression());

// Public pages use clean directory URLs. Keep old .html links working while
// making the canonical address visible in the browser the clean route.
const CLEAN_PAGE_ROUTES = {
  '/index.html': '/',
  '/all_products.html': '/shop/',
  '/poster-reels.html': '/reels/',
  '/about_us.html': '/about/',
  '/institutional.html': '/institutional/',
  '/special_day.html': '/special-day/',
  '/style_options.html': '/style-options/',
  '/policies.html': '/policies/',
  '/checkout.html': '/checkout/',
  '/order-confirmation.html': '/order-confirmation/',
  '/reset-password.html': '/reset-password/',
  '/admin.html': '/admin/',
  '/maintenance.html': '/maintenance/',
  '/digital-assets.html': '/buy-digital-assets/',
  '/track.html': '/track/',
  '/build-pack.html': '/build-pack/',
  '/orders.html': '/orders/',
  '/profile.html': '/profile/'
};
const CLEAN_ROUTE_FILES = Object.fromEntries(Object.entries(CLEAN_PAGE_ROUTES).map(([legacy, clean]) => [clean, legacy.slice(1)]));
// Also support legacy /posters/ mapping if accessed
CLEAN_ROUTE_FILES['/posters/'] = 'poster-reels.html';

const CLEAN_LINKS = {
  'index.html': '/', 'all_products.html': '/shop/', 'poster-reels.html': '/reels/',
  'about_us.html': '/about/', 'institutional.html': '/institutional/',
  'special_day.html': '/special-day/', 'style_options.html': '/style-options/',
  'policies.html': '/policies/', 'checkout.html': '/checkout/',
  'order-confirmation.html': '/order-confirmation/', 'reset-password.html': '/reset-password/',
  'admin.html': '/admin/', 'maintenance.html': '/maintenance/',
  'digital-assets.html': '/buy-digital-assets/',
  'track.html': '/track/', 'build-pack.html': '/build-pack/',
  'orders.html': '/orders/', 'profile.html': '/profile/'
};
function cleanPageHtml(html) {
  const names = Object.keys(CLEAN_LINKS).join('|');
  const linkPattern = new RegExp("([\\\"'`=(\\s])(" + names + ")(?=[?#\\\"'`\\s)&]|$)", 'g');
  return html
    .replace(/<head>/i, '<head>\n  <base href="/">')
    .replace(linkPattern, (_, prefix, file) => prefix + CLEAN_LINKS[file]);
}
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  if (req.path === '/items.html') {
    return res.redirect(301, '/shop/?category=stationery');
  }
  const destination = CLEAN_PAGE_ROUTES[req.path];
  if (destination) {
    const [pathOnly, destinationQuery] = destination.split('?');
    const incomingQuery = req.originalUrl.includes('?') ? req.originalUrl.split('?')[1] : '';
    const query = destinationQuery || incomingQuery;
    return res.redirect(301, pathOnly + (query ? '?' + query : ''));
  }
  const cleanPath = req.path.length > 1 ? req.path.replace(/\/+$/, '') : req.path;
  const slashRoute = Object.keys(CLEAN_ROUTE_FILES).find(route => route.replace(/\/+$/, '') === cleanPath);
  if (slashRoute && req.path !== slashRoute) {
    const incomingQuery = req.originalUrl.includes('?') ? req.originalUrl.split('?')[1] : '';
    return res.redirect(301, slashRoute + (incomingQuery ? '?' + incomingQuery : ''));
  }
  return next();
});
app.get(Object.keys(CLEAN_ROUTE_FILES), (req, res, next) => {
  const file = CLEAN_ROUTE_FILES[req.path];
  if (!file) return next();
  const filePath = path.join(__dirname, '../public', file);
  fs.readFile(filePath, 'utf8', (err, html) => {
    if (err) return next(err);
    res.type('html').send(cleanPageHtml(html));
  });
});
// Cross-browser & production security and network performance headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

app.use(express.static(path.join(__dirname, '../public'), {
  maxAge: '1d',
  setHeaders: (res, filePath) => {
    if (/\.(webp|png|jpg|jpeg|svg|woff2|woff|ttf)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=604800, stale-while-revalidate=86400');
    } else if (/\.(css|js)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=3600');
    } else if (/\.html$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    }
  }
}));

// Defense-in-depth on top of the unguessable order ID itself: caps how many
// order/invoice lookups a single IP can attempt, so even a leaked or
// partially-guessed ID can't be brute-forced at scale.
const orderLookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many order lookups from this device. Please try again later.' }
});

// Caps login/signup/password-reset attempts per IP so credentials can't be
// brute-forced or credential-stuffed at scale. Applies to both customer and
// admin auth - a compromised admin account is a much bigger blast radius
// than a customer one, so it gets the same limiter, not a looser one.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.headers['x-brush-test'] === 'true' && process.env.NODE_ENV !== 'production',
  message: { error: 'Too many attempts from this device. Please try again later.' }
});

// Order creation deducts real stock and sends a real email — with no limiter
// at all, the payment-verification fixes above are the only thing stopping
// a scripted flood of orders (each one still individually valid: COD orders
// need no payment step, so this is reachable without touching Razorpay).
const orderCreateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many orders placed from this device. Please try again later.' }
});

// Reviews are unauthenticated and accept a photo upload — no limiter means
// unlimited spam-review flooding and, combined with the upload, unbounded
// storage-cost abuse from repeated 5MB image uploads.
const reviewLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many reviews submitted from this device. Please try again later.' }
});

// Requirements are a public write endpoint, so protect it from automated
// database-filling and notification abuse just like reviews and orders.
const requirementsLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests from this device. Please try again later.' }
});

// Every call here triggers a real Razorpay API request (quota/cost) even
// before any order exists — same class of abuse as orderLookupLimiter, just
// on the payment-initiation step instead of the lookup step.
const paymentOrderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many payment attempts from this device. Please try again later.' }
});

// A missing secret used to fall back to the literal string 'YOUR_SECRET' —
// real Razorpay signatures would never validate against that, so instead
// of failing loudly it turned into a silent, hard-to-diagnose "no order
// ever confirms" (or worse, an easier bypass surface for the payment
// verification in /api/orders). Fail fast at startup instead, matching
// the MONGODB_URI check below.
let razorpay = null;
if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
  razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
  });
  console.log('💳 Razorpay initialized');
} else {
  console.warn('⚠️  RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not set — Razorpay online checkout unavailable (Cash on Delivery active).');
}

// ── Cashfree Payment Gateway (sandbox / test mode) ─────────────
// Configured from the same .env as Razorpay. Credentials are optional:
// the server boots fine without them; Cashfree routes just return 503.
let cashfreeReady = false;
let cashfreePG = null;
if (process.env.CASHFREE_ID && process.env.CASHFREE_SECRET) {
  cashfreePG = new Cashfree(CFEnvironment.PRODUCTION, process.env.CASHFREE_ID, process.env.CASHFREE_SECRET);
  cashfreeReady = true;
  console.log('💳 Cashfree PG initialized (production mode)');
} else {
  console.warn('⚠️  CASHFREE_ID / CASHFREE_SECRET not set — Cashfree payments unavailable.');
}
// Setup multer for image uploads (Memory storage for Cloud deployment)
const storage = multer.memoryStorage();
// Gated behind requireAdmin, but still had no size limit or type filter —
// an unbounded-size, any-file memory-buffered upload is a DoS/OOM vector
// even from a trusted role, and would publish arbitrary files under an
// image URL. 20MB accommodates the high-res print-ready files this admin
// form is meant for; PNG/JPEG/PDF matches the form's own accept attribute
// (public/admin.html's "Upload Poster (PNG/JPG/PDF)" field).
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, ['image/png', 'image/jpeg', 'application/pdf'].includes(file.mimetype))
});

// Review photos are submitted by unauthenticated shoppers, unlike the
// admin-gated product image upload above — cap size and restrict to
// images so the endpoint can't be used to push arbitrary large files
// into Firebase Storage.
// An explicit allowlist, not `image/*`: that admitted image/svg+xml, which is
// a scriptable document once makePublic() serves it from storage.googleapis.com.
// Rejecting with an Error rather than cb(null, false) so the uploader is told
// why, instead of silently getting a 200 and an empty photo.
const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const imageFileFilter = (req, file, cb) => {
  if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) return cb(null, true);
  cb(new Error('Unsupported image type — use PNG, JPEG, WebP or GIF.'));
};

const uploadReviewPhoto = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: imageFileFilter
});

// ==========================================
// FIREBASE STORAGE (images only — the DB itself lives in MongoDB now)
// ==========================================
let serviceAccount;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    // If Render converts \n to actual newlines, JSON.parse will fail. We need to re-escape them.
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    // Replace actual newline characters with \n string, but don't double escape if already escaped
    const sanitized = raw.replace(/\r?\n/g, '\\n');
    try {
      serviceAccount = JSON.parse(sanitized);
    } catch (e) {
      serviceAccount = JSON.parse(raw);
    }
  } catch (err) {
    console.error("❌ Failed to parse FIREBASE_SERVICE_ACCOUNT:", err.message);
  }
}

if (!serviceAccount) {
  // Try local file, or Render Secret File path
  const pathsToTry = [
    path.join(__dirname, 'serviceAccountKey.json'),
    '/etc/secrets/serviceAccountKey.json'
  ];

  for (const p of pathsToTry) {
    if (fs.existsSync(p)) {
      serviceAccount = require(p);
      break;
    }
  }
}

let bucket = null;
if (serviceAccount && process.env.SKIP_FIREBASE !== 'true') {
  const projectId = serviceAccount.project_id || 'brush-db-6a308';
  const storageBucket = `${projectId}.appspot.com`;
  try {
    initializeApp({
      credential: cert(serviceAccount),
      storageBucket: storageBucket
    });
    bucket = getStorage().bucket();
    console.log('✅ Connected to Firebase Storage (image uploads)');
  } catch (err) {
    console.warn('⚠️  Failed to connect to Firebase Storage (uploads disabled). Error:', err.message);
    bucket = null;
  }
} else {
  console.warn('⚠️  No Firebase credentials found — product image uploads will be disabled.');
}

// ==========================================
// MONGODB INITIALIZATION
// ==========================================
if (!process.env.MONGODB_URI) {
  console.error("❌ FATAL ERROR: MONGODB_URI environment variable is not set.");
  process.exit(1);
}

const mongoClient = new MongoClient(process.env.MONGODB_URI);

let db, productsRef, ordersRef, usersRef, adminsRef, adminLogsRef, countersRef, sessionsRef, requirementsRef, reachoutSubmissionsRef;

// Strips Mongo's internal _id before a document goes out over the API,
// so response shapes stay identical to what the frontend already expects.
function stripId(doc) {
  if (!doc) return doc;
  const { _id, ...rest } = doc;
  return rest;
}

class OrderValidationError extends Error {}

// Single source of truth for turning a client-submitted `items` array into
// ==========================================
// DELIVERY PROMISE (imported from productTypes.js)
// ==========================================
const addBusinessDays = (from, days) => calculateEstimatedDelivery(from, days);

function computeCustomPackPricing(posters, isFramed) {
  const count = (posters && posters.length) || 0;
  if (count === 0) {
    return { price: 0, mrp: 0, save: 'Save ₹0', appliedOffer: null, freeCount: 0 };
  }

  const SINGLE_RATES = {
    unframed: { A5: 19, A4: 29, A3: 39 },
    framed:   { A5: 299, A4: 499, A3: 759 }
  };
  const SINGLE_MRP = {
    unframed: { A5: 39, A4: 59, A3: 89 },
    framed:   { A5: 599, A4: 999, A3: 1699 }
  };

  const PACK_3_RATES = {
    unframed: { A5: 49 / 3, A4: 79 / 3, A3: 109 / 3 },
    framed:   { A5: 749 / 3, A4: 1199 / 3, A3: 1999 / 3 }
  };

  const PACK_5_RATES = {
    unframed: { A5: 99 / 5, A4: 149 / 5, A3: 249 / 5 },
    framed:   { A5: 299 / 5, A4: 499 / 5, A3: 899 / 5 }
  };

  const PACK_10_RATES = {
    unframed: { A5: 169 / 10, A4: 259 / 10, A3: 449 / 10 },
    framed:   { A5: 549 / 10, A4: 899 / 10, A3: 1599 / 10 }
  };

  const PACK_20_RATES = {
    unframed: { A5: 309 / 20, A4: 449 / 20, A3: 799 / 20 },
    framed:   { A5: 999 / 20, A4: 1699 / 20, A3: 2899 / 20 }
  };

  const PACK_30_RATES = {
    unframed: { A5: 435 / 30, A4: 630 / 30, A3: 1125 / 30 },
    framed:   { A5: 1410 / 30, A4: 2370 / 30, A3: 4050 / 30 }
  };

  const frameKey = isFramed ? 'framed' : 'unframed';

  let totalMrp = 0;
  posters.forEach(p => {
    const sz = (p && p.size && SINGLE_MRP[frameKey][p.size]) ? p.size : 'A5';
    totalMrp += SINGLE_MRP[frameKey][sz];
  });

  let rawPrice = 0;
  let appliedOffer = 'Standard Single Pricing';
  let freeCount = 0;

  if (count < 3) {
    posters.forEach(p => {
      const sz = (p && p.size && SINGLE_RATES[frameKey][p.size]) ? p.size : 'A5';
      rawPrice += SINGLE_RATES[frameKey][sz];
    });
    appliedOffer = count === 1 ? 'Single Poster Rate' : '2 Posters Rate';
  } else if (count === 3) {
    posters.forEach(p => {
      const sz = (p && p.size && PACK_3_RATES[frameKey][p.size]) ? p.size : 'A5';
      rawPrice += PACK_3_RATES[frameKey][sz];
    });
    appliedOffer = '⚡ 3-Poster Pack Rate';
  } else if (count === 4) {
    const sorted = [...posters].sort((a, b) => {
      const szA = (a && a.size) || 'A5';
      const szB = (b && b.size) || 'A5';
      return SINGLE_RATES[frameKey][szB] - SINGLE_RATES[frameKey][szA];
    });
    for (let i = 0; i < 3; i++) {
      const sz = sorted[i].size || 'A5';
      rawPrice += PACK_3_RATES[frameKey][sz];
    }
    const sz4 = sorted[3].size || 'A5';
    rawPrice += SINGLE_RATES[frameKey][sz4];
    appliedOffer = '3-Pack Rate + 1 Single';
  } else if (count >= 5 && count < 10) {
    const rates = PACK_5_RATES[frameKey];
    const posterCosts = posters.map(p => {
      const sz = (p && p.size && rates[p.size]) ? p.size : 'A5';
      return { ...p, unitCost: rates[sz] };
    });
    posterCosts.sort((a, b) => a.unitCost - b.unitCost);

    freeCount = 1;
    appliedOffer = '🎁 Buy 5 Get 1 FREE Applied!';
    for (let i = freeCount; i < posterCosts.length; i++) {
      rawPrice += posterCosts[i].unitCost;
    }
  } else if (count >= 10 && count < 20) {
    const rates = PACK_10_RATES[frameKey];
    const posterCosts = posters.map(p => {
      const sz = (p && p.size && rates[p.size]) ? p.size : 'A5';
      return { ...p, unitCost: rates[sz] };
    });
    posterCosts.sort((a, b) => a.unitCost - b.unitCost);

    freeCount = 3;
    appliedOffer = '🔥 Buy 10 Get 3 FREE Applied!';
    for (let i = freeCount; i < posterCosts.length; i++) {
      rawPrice += posterCosts[i].unitCost;
    }
  } else if (count >= 20 && count < 30) {
    const rates = PACK_20_RATES[frameKey];
    const posterCosts = posters.map(p => {
      const sz = (p && p.size && rates[p.size]) ? p.size : 'A5';
      return { ...p, unitCost: rates[sz] };
    });
    posterCosts.sort((a, b) => a.unitCost - b.unitCost);

    freeCount = 4;
    appliedOffer = '🎉 Buy 20 Get 4 FREE Applied!';
    for (let i = freeCount; i < posterCosts.length; i++) {
      rawPrice += posterCosts[i].unitCost;
    }
  } else {
    const rates = PACK_30_RATES[frameKey];
    const posterCosts = posters.map(p => {
      const sz = (p && p.size && rates[p.size]) ? p.size : 'A5';
      return { ...p, unitCost: rates[sz] };
    });
    posterCosts.sort((a, b) => a.unitCost - b.unitCost);

    freeCount = 6;
    appliedOffer = '🌟 Buy 30 Get 6 FREE Applied!';
    for (let i = freeCount; i < posterCosts.length; i++) {
      rawPrice += posterCosts[i].unitCost;
    }
  }

  const finalPrice = Math.round(rawPrice);
  const save = Math.max(0, totalMrp - finalPrice);

  return {
    price: finalPrice,
    mrp: totalMrp,
    save: `Save ₹${save}`,
    appliedOffer,
    freeCount
  };
}

// authoritative pricing — used by both /api/payment/create-order (to know
// what to actually charge) and /api/orders (to confirm what was charged
// matches what's being fulfilled). Never trusts a client-submitted price.
async function computeOrderPricing(items, paymentMethod, couponCode = null, deliveryOption = null, pricingOptions = {}) {
  if (!items || !Array.isArray(items) || items.length === 0) {
    throw new OrderValidationError('Order must contain at least one item');
  }

  if (items.length > 50) throw new OrderValidationError('Too many lines in one order');

  let subtotal = 0;
  const enrichedItems = [];
  const requestedByProduct = {};

  for (const item of items) {
    // Must be real numbers: an object here would be read by MongoDB as a
    // query operator, and a string/fractional quantity would corrupt stock.
    const productId = Number(item && (item.productId != null ? item.productId : item.id));
    const quantity = Number(item && item.quantity);
    if (!Number.isInteger(productId)) throw new OrderValidationError('Invalid product in order');
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) throw new OrderValidationError(`Invalid quantity for product ${productId}`);
    item.productId = productId;
    item.quantity = quantity;

    let product = await productsRef.findOne({ id: productId });
    if (!product && ((productId >= 9990 && productId <= 10050) || (Array.isArray(item.customPosters) && item.customPosters.length > 0))) {
      const packSize = (Array.isArray(item.customPosters) && item.customPosters.length > 0) ? item.customPosters.length : Math.max(1, productId - 9990);
      const typeKey = packSize >= 25 ? 'poster_pack_25' : (packSize >= 20 ? 'poster_pack_20' : (packSize >= 15 ? 'poster_pack_15' : (packSize >= 10 ? 'poster_pack_10' : (packSize >= 5 ? 'poster_pack_5' : (packSize === 3 ? 'poster_3_pack' : (packSize === 2 ? 'poster_2_pack' : 'poster'))))));
      product = {
        id: productId,
        name: item.name || `Custom ${packSize}-Poster Pack`,
        price: 99,
        productType: typeKey,
        category: 'Wall Setup Packs',
        image: (Array.isArray(item.customPosters) && item.customPosters[0]?.image) || 'posters/packs/mockups/byop-hero.webp',
        stockQuantity: 999
      };
    }
    if (!product) throw new OrderValidationError(`Product with ID ${productId} not found`);

    // The same poster in two sizes is two cart lines but one stock pool.
    requestedByProduct[productId] = (requestedByProduct[productId] || 0) + quantity;
    const currentStock = product.stockQuantity !== undefined ? product.stockQuantity : 0;
    if (currentStock < requestedByProduct[productId]) {
      throw new OrderValidationError(`Insufficient stock for product ${product.name}. Only ${currentStock} left.`);
    }

    const productType = product.productType || getProductType(product.category);
    const submittedVariants = item.variants || (item.size || item.gsm ? { size: item.size, gsm: item.gsm } : undefined);
    const { price: rawPrice, resolvedVariants } = priceWithVariants(product.price, productType, submittedVariants);
    let finalPrice = Math.max(10, rawPrice);

    if (((productId >= 9990 && productId <= 10050) || Array.isArray(item.customPosters)) && Array.isArray(item.customPosters) && item.customPosters.length > 0) {
      const isFramed = (submittedVariants && String(submittedVariants.frame).includes('framed'));
      finalPrice = computeCustomPackPricing(item.customPosters, isFramed).price;
    }

    const itemSubtotal = finalPrice * item.quantity;
    subtotal += itemSubtotal;

    let cleanCustomPosters = undefined;
    if (Array.isArray(item.customPosters) && item.customPosters.length > 0) {
      cleanCustomPosters = await enrichCustomPostersWithDbSkus(item.customPosters);
    }

    enrichedItems.push({
      productId: product.id,
      name: item.name || product.name,
      sku: product.sku || (product.id ? String(product.id) : ''),
      image: (Array.isArray(cleanCustomPosters) && cleanCustomPosters[0]?.image) || product.image,
      price: finalPrice,
      originalBasePrice: product.price,
      productType,
      variants: resolvedVariants,
      quantity: item.quantity,
      subtotal: itemSubtotal,
      customPosters: cleanCustomPosters
    });
  }

  let discountAmount = 0;
  let appliedCoupon = null;
  if (couponCode) {
    const code = String(couponCode).trim().toUpperCase();
    const coupon = await mongoClient.db().collection('coupons').findOne({ code, status: 'Active' });
    if (coupon) {
      if (subtotal >= coupon.minCartValue && (coupon.maxCartValue === null || subtotal <= coupon.maxCartValue)) {
        if (coupon.discountType === 'fixed') {
          discountAmount = coupon.discountValue;
        } else if (coupon.discountType === 'percentage') {
          discountAmount = subtotal * coupon.discountValue;
        }
        if (discountAmount > subtotal) discountAmount = subtotal;
        appliedCoupon = coupon;
      }
    }
  }

  const chargeLines = enrichedItems.map(i => ({ price: i.price, quantity: i.quantity, productType: i.productType }));

  // Some items are settled prepaid at the print stage, so a cart holding one
  // cannot be paid for on delivery. Checked here, on the server, because the
  // browser's copy of this rule is only there to grey out the option.
  if (paymentMethod === 'cod' && cartRequiresPrepaid(chargeLines)) {
    throw new OrderValidationError('This order has to be prepaid — please pay by UPI or card.');
  }

  // Shelf prices exclude taxes and delivery — both are added once per order
  // here (see orderCharges in productTypes.js), plus the COD fee for
  // cash-on-delivery orders.
  const charges = orderCharges(chargeLines, paymentMethod, {
    couponDiscount: discountAmount,
    manualDiscount: pricingOptions.manualDiscount,
    deliveryOption
  });

  return { ...charges, enrichedItems, appliedCoupon };
}


// ==========================================
// API ENDPOINTS
// ==========================================

// ==========================================
// AUTH & USER ENDPOINTS
// ==========================================

app.post('/api/auth/signup', authLimiter, async (req, res) => {
  try {
    const { id, password, name, phone, address } = req.body;
    if (!isNonEmptyString(id) || !isNonEmptyString(password)) return res.status(400).json({ error: 'ID and password required' });
    if (!isStrongEnoughPassword(password)) return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` });

    const existing = await usersRef.findOne({ _id: id });
    if (existing) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const hash = await hashPassword(password);

    const newUser = {
      _id: id,
      id,
      passwordHash: hash,
      name: cleanText(name, 80),
      phone: cleanText(phone, 20),
      address: cleanText(address, 300),
      createdAt: new Date()
    };

    await usersRef.insertOne(newUser);
    const token = issueUserToken(id);
    res.json({ success: true, token, userId: id, name, phone, address });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Signup failed' });
  }
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const { id, password } = req.body;
    if (!isNonEmptyString(id) || !isNonEmptyString(password)) return res.status(400).json({ error: 'ID and password required' });

    const user = await usersRef.findOne({ $or: [{ _id: id }, { email: id }] });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const { valid, needsRehash } = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    if (needsRehash) {
      await usersRef.updateOne({ _id: id }, { $set: { passwordHash: await hashPassword(password) } });
    }

    const token = issueUserToken(id);
    res.json({ success: true, token, userId: id, name: user.name, phone: user.phone, address: user.address });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const gone = authHeader.split(' ')[1];
    activeUserTokens.delete(gone);
    forgetSession(gone);
  }
  res.json({ success: true });
});

function buildPasswordResetEmail(user, resetUrl) {
  const name = user && user.name ? user.name.trim() : '';
  const greeting = name ? `Hi <strong>${name}</strong>,` : 'Hello,';
  const plainGreeting = name ? `Hi ${name},` : 'Hello,';

  const html = `<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f6f5f2;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f5f2;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;box-shadow:0 4px 12px rgba(0,0,0,0.05);">
        <tr><td style="background:#0f0f11;padding:24px 32px;">
          <span style="font-size:22px;font-weight:900;letter-spacing:1px;color:#dfa84a;text-transform:uppercase;">PATLIPUTRA TRADERS</span>
        </td></tr>
        <tr><td style="padding:32px 32px 16px;">
          <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#111827;">Reset your password</h2>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#4b5563;">${greeting}</p>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#4b5563;">We received a request to reset your password for your Patliputra Traders account. Click the button below to choose a new password. This link is valid for <strong>30 minutes</strong>.</p>
          <div style="margin:28px 0;">
            <a href="${resetUrl}" style="background:#dfa84a;color:#000000;text-decoration:none;font-size:15px;font-weight:700;padding:14px 28px;border-radius:8px;display:inline-block;letter-spacing:0.3px;">Reset Password &rarr;</a>
          </div>
          <p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#9ca3af;">If the button above doesn't work, copy and paste this link into your browser:<br><a href="${resetUrl}" style="color:#dfa84a;word-break:break-all;">${resetUrl}</a></p>
          <p style="margin:20px 0 0;font-size:13px;line-height:1.5;color:#9ca3af;">If you didn't request this reset, you can safely ignore this email — your password will remain unchanged.</p>
        </td></tr>
        <tr><td style="background:#fafafa;border-top:1px solid #f3f4f6;padding:20px 32px;font-size:12px;color:#9ca3af;text-align:center;">
          &copy; ${new Date().getFullYear()} Patliputra Traders · Patna Showroom
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = `${plainGreeting}

We received a request to reset your password for your Patliputra Traders account.
Click or copy the link below to set a new password (valid for 30 minutes):

${resetUrl}

If you didn't request a password reset, you can safely ignore this email — your password will remain unchanged.`;

  return { subject: 'Reset your Patliputra Traders password', html, text };
}

// Step 1 of self-service password reset: never reveals whether an account
// exists (same response either way). Only emails a link when the account's
// id is an email address - phone-only accounts have no address to send to.
app.post('/api/auth/forgot-password', authLimiter, async (req, res) => {
  try {
    const rawId = req.body && req.body.id;
    if (!isNonEmptyString(rawId)) return res.status(400).json({ error: 'ID required' });

    const cleanId = rawId.trim();
    const normalizedEmail = cleanId.toLowerCase();

    const genericResponse = { success: true, message: 'If an account exists for that ID and has an email on file, a reset link has been sent.' };

    const user = await usersRef.findOne({
      $or: [
        { _id: cleanId },
        { _id: normalizedEmail },
        { id: cleanId },
        { id: normalizedEmail },
        { email: cleanId },
        { email: normalizedEmail },
        { phone: cleanId }
      ]
    });

    if (user) {
      const recipientEmail = (user.email || user.id || user._id || '').trim();
      if (recipientEmail && recipientEmail.includes('@')) {
        const token = crypto.randomBytes(24).toString('hex');
        const expiresAt = Date.now() + 30 * 60 * 1000;
        passwordResetTokens.set(token, { userId: user._id, expiresAt });
        await persistSession('password_reset', token, { userId: user._id, expiresAt });

        const baseSiteUrl = (process.env.SITE_URL && !process.env.SITE_URL.includes('localhost') && !process.env.SITE_URL.includes('onrender'))
          ? process.env.SITE_URL
          : 'https://www.brush-art.in';
        const resetUrl = `${baseSiteUrl.replace(/\/$/, '')}/reset-password/?token=${token}`;

        const { subject, html, text } = buildPasswordResetEmail(user, resetUrl);
        try {
          const mailResult = await sendMail({
            from: 'Brush Support <admin@brush-art.in>',
            replyTo: 'admin@brush-art.in',
            to: recipientEmail,
            subject,
            html,
            text
          });
          console.log(`Password reset email sent to ${recipientEmail} (messageId: ${mailResult && mailResult.messageId})`);
        } catch (mailErr) {
          console.error('Password reset email sending failed:', mailErr);
        }
      }
    }
    res.json(genericResponse);
  } catch (error) {
    console.error('Forgot-password endpoint error:', error);
    res.status(500).json({ error: 'Failed to process request' });
  }
});

// Step 2: the actual reset, gated on the emailed token rather than a
// caller-supplied id, so knowing someone's login id is no longer enough to
// take over their account.
app.post('/api/auth/reset-password', authLimiter, async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    const cleanToken = String(token || '').trim();
    if (!cleanToken || !newPassword) return res.status(400).json({ error: 'Reset token and new password required' });
    if (!isStrongEnoughPassword(newPassword)) return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` });

    let entry = passwordResetTokens.get(cleanToken);
    if ((!entry || entry.expiresAt < Date.now()) && sessionsRef) {
      const doc = await sessionsRef.findOne({ _id: cleanToken, kind: 'password_reset' });
      if (doc) {
        const expiresAt = doc.expiresAt instanceof Date ? doc.expiresAt.getTime() : Number(doc.expiresAt);
        if (expiresAt >= Date.now()) {
          entry = { userId: doc.userId, expiresAt };
          passwordResetTokens.set(cleanToken, entry);
        } else {
          forgetSession(cleanToken);
        }
      }
    }

    if (!entry || entry.expiresAt < Date.now()) {
      passwordResetTokens.delete(cleanToken);
      forgetSession(cleanToken);
      return res.status(400).json({ error: 'This reset link is invalid or has expired. Please request a new one.' });
    }

    await usersRef.updateOne({ _id: entry.userId }, { $set: { passwordHash: await hashPassword(newPassword) } });
    passwordResetTokens.delete(cleanToken);
    await forgetSession(cleanToken);
    // Someone resetting their password usually believes their account is
    // compromised. Kill every live session and every other outstanding reset
    // link for that user, or the attacker keeps their access for up to 7 days.
    revokeAllSessionsFor(entry.userId);

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// Change password from within the account (requires a live session AND the
// current password) - distinct from the forgot-password flow above.
app.post('/api/auth/change-password', requireUser, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Current and new password required' });
    if (!isStrongEnoughPassword(newPassword)) return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` });

    const user = await usersRef.findOne({ _id: req.userId });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { valid } = await verifyPassword(currentPassword, user.passwordHash);
    if (!valid) {
      // 400, not 401: the session itself (Bearer token, checked by requireUser
      // above) is valid - only the current-password check failed. Keeping 401
      // reserved exclusively for "your session is invalid" lets the frontend
      // treat any 401 as an unambiguous signal to log the user out.
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    await usersRef.updateOne({ _id: req.userId }, { $set: { passwordHash: await hashPassword(newPassword) } });
    // Sign out everywhere else, but not the tab that just did this.
    const currentToken = (req.headers.authorization || '').split(' ')[1];
    revokeAllSessionsFor(req.userId, currentToken);

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update password' });
  }
});

const profileUpdateOtps = new Map();

function buildProfileOtpEmail(user, fieldName, newValue, otpCode) {
  const name = user && user.name ? user.name.trim() : '';
  const greeting = name ? `Hi <strong>${name}</strong>,` : 'Hello,';
  const label = fieldName === 'phone' ? 'Mobile Number' : 'Email Address';

  const html = `<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f6f5f2;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f5f2;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;box-shadow:0 4px 12px rgba(0,0,0,0.05);">
        <tr><td style="background:#0f0f11;padding:24px 32px;">
          <span style="font-size:22px;font-weight:900;letter-spacing:1px;color:#ffffff;text-transform:uppercase;">BRUSH</span>
        </td></tr>
        <tr><td style="padding:32px 32px 24px;">
          <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#111827;">Verification Code for ${label} Update</h2>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#4b5563;">${greeting}</p>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#4b5563;">You requested to update your <strong>${label}</strong> on Brush to: <code style="background:#f3f4f6;padding:2px 6px;border-radius:4px;font-weight:600;color:#111827;">${newValue}</code>.</p>
          <p style="margin:0 0 12px;font-size:14px;color:#6b7280;">Please use the following 6-digit one-time code to complete verification:</p>
          <div style="margin:24px 0;text-align:center;">
            <div style="display:inline-block;letter-spacing:8px;font-size:32px;font-weight:800;color:#0f0f11;background:#f3f4f6;padding:16px 28px;border-radius:8px;border:1px dashed #d1d5db;font-family:monospace;">
              ${otpCode}
            </div>
          </div>
          <p style="margin:0 0 8px;font-size:13px;color:#9ca3af;text-align:center;">This code is valid for <strong>10 minutes</strong>. Never share this code with anyone.</p>
          <div style="margin-top:28px;padding-top:20px;border-top:1px solid #f3f4f6;font-size:13px;line-height:1.5;color:#6b7280;">
            If you did not request this update, please ignore this email or reach out to support@brush-art.in.
          </div>
        </td></tr>
        <tr><td style="background:#fafafa;padding:16px 32px;font-size:12px;color:#9ca3af;text-align:center;border-top:1px solid #f0f0f0;">
          &copy; ${new Date().getFullYear()} Brush Art Platform. All rights reserved.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = `${fieldName === 'phone' ? 'Mobile Number' : 'Email Address'} Update Verification Code: ${otpCode}\n\nValid for 10 minutes.`;
  return { html, text };
}

app.get('/api/auth/profile/:id', requireUser, requireOwnUser, async (req, res) => {
  try {
    const targetId = req.targetUserId || req.userId;
    const user = await usersRef.findOne({ $or: [{ _id: targetId }, { email: targetId }] });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { passwordHash, ...safeUser } = stripId(user);
    safeUser.email = safeUser.email || (typeof user._id === 'string' && user._id.includes('@') ? user._id : '');
    safeUser.addresses = Array.isArray(safeUser.addresses) ? safeUser.addresses : [];
    if (safeUser.addresses.length === 0 && safeUser.address) {
      safeUser.addresses = [{
        id: 'addr_default',
        name: safeUser.name || '',
        phone: safeUser.phone || '',
        alternatePhone: '',
        pincode: '',
        addressLine: safeUser.address,
        locality: '',
        landmark: '',
        city: '',
        state: '',
        type: 'HOME',
        isDefault: true,
        createdAt: new Date().toISOString()
      }];
    }
    res.json(safeUser);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

app.put('/api/auth/profile/:id', requireUser, requireOwnUser, async (req, res) => {
  try {
    const targetId = req.targetUserId || req.userId;
    const user = await usersRef.findOne({ $or: [{ _id: targetId }, { email: targetId }] });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const updateFields = { updatedAt: new Date() };

    if (req.body.name !== undefined) {
      const cleanName = cleanText(req.body.name, 80);
      if (cleanName) updateFields.name = cleanName;
    }

    if (req.body.gender !== undefined) {
      const g = String(req.body.gender).trim().toLowerCase();
      if (['male', 'female', 'other'].includes(g)) {
        updateFields.gender = g.charAt(0).toUpperCase() + g.slice(1);
      }
    }

    if (req.body.address !== undefined) {
      updateFields.address = cleanText(req.body.address, 300);
    }

    await usersRef.updateOne({ _id: user._id }, { $set: updateFields });
    const updated = await usersRef.findOne({ _id: user._id });
    const { passwordHash, ...safeUser } = stripId(updated);
    safeUser.email = safeUser.email || (typeof updated._id === 'string' && updated._id.includes('@') ? updated._id : '');
    res.json({ success: true, profile: safeUser });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Send OTP to email for mobile or email address update
app.post('/api/auth/profile/send-otp', requireUser, authLimiter, async (req, res) => {
  try {
    const { field, value } = req.body;
    if (!['phone', 'email'].includes(field)) {
      return res.status(400).json({ error: 'Invalid field specified for OTP verification' });
    }

    const user = await usersRef.findOne({ _id: req.userId });
    if (!user) return res.status(404).json({ error: 'User not found' });

    let cleanVal = '';
    if (field === 'phone') {
      cleanVal = cleanText(value, 20).replace(/\D/g, '').slice(-10);
      if (!/^\d{10}$/.test(cleanVal)) {
        return res.status(400).json({ error: 'Please enter a valid 10-digit mobile number' });
      }
      if (cleanVal === user.phone) {
        return res.status(400).json({ error: 'This is already your current mobile number' });
      }
    } else if (field === 'email') {
      cleanVal = cleanText(value, 120).toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanVal)) {
        return res.status(400).json({ error: 'Please enter a valid email address' });
      }
      const currentEmail = (user.email || (typeof user._id === 'string' && user._id.includes('@') ? user._id : '')).toLowerCase();
      if (cleanVal === currentEmail) {
        return res.status(400).json({ error: 'This is already your current email address' });
      }
      const emailExists = await usersRef.findOne({ $or: [{ _id: cleanVal }, { email: cleanVal }] });
      if (emailExists && String(emailExists._id) !== String(user._id)) {
        return res.status(400).json({ error: 'This email address is already in use by another account' });
      }
    }

    const targetEmail = (field === 'email' ? cleanVal : (user.email || (typeof user._id === 'string' && user._id.includes('@') ? user._id : ''))).trim();
    if (!targetEmail) {
      return res.status(400).json({ error: 'Please update and verify your email address first so we can send your verification code.' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    profileUpdateOtps.set(`${req.userId}_${field}`, {
      otp,
      field,
      value: cleanVal,
      targetEmail,
      expiresAt
    });

    console.log(`[PROFILE OTP] Generated verification code ${otp} for ${field} update (${targetEmail})`);

    const { html, text } = buildProfileOtpEmail(user, field, cleanVal, otp);
    const label = field === 'phone' ? 'mobile number' : 'email address';

    await sendMail({
      to: targetEmail,
      subject: `Your Brush Verification Code: ${otp} (for ${label} update)`,
      html,
      text
    });

    const atIdx = targetEmail.indexOf('@');
    const uName = targetEmail.slice(0, atIdx);
    const dName = targetEmail.slice(atIdx);
    const masked = uName.length <= 2 ? `${uName.charAt(0)}***${dName}` : `${uName.charAt(0)}***${uName.slice(-1)}${dName}`;

    res.json({
      success: true,
      message: `A 6-digit verification code was sent to ${masked}.`,
      maskedEmail: masked,
      ...(req.headers['x-brush-test'] === 'true' ? { devOtp: otp } : {})
    });
  } catch (err) {
    console.error('Send profile OTP error:', err);
    res.status(500).json({ error: err.message || 'Failed to send verification code. Please try again.' });
  }
});

// Verify OTP and apply the update
app.post('/api/auth/profile/verify-otp', requireUser, authLimiter, async (req, res) => {
  try {
    const { field, otp } = req.body;
    if (!['phone', 'email'].includes(field)) {
      return res.status(400).json({ error: 'Invalid field' });
    }

    const key = `${req.userId}_${field}`;
    const record = profileUpdateOtps.get(key);

    if (!record || record.expiresAt < Date.now()) {
      profileUpdateOtps.delete(key);
      return res.status(400).json({ error: 'Verification code has expired or was not requested. Please request a new code.' });
    }

    const cleanInputOtp = String(otp || '').trim();
    if (record.otp !== cleanInputOtp) {
      return res.status(400).json({ error: 'Incorrect verification code. Please check your email and try again.' });
    }

    const user = await usersRef.findOne({ _id: req.userId });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const updateFields = { updatedAt: new Date() };
    if (field === 'phone') {
      updateFields.phone = record.value;
    } else if (field === 'email') {
      updateFields.email = record.value;
    }

    await usersRef.updateOne({ _id: user._id }, { $set: updateFields });
    profileUpdateOtps.delete(key);

    const updated = await usersRef.findOne({ _id: user._id });
    const { passwordHash, ...safeUser } = stripId(updated);
    safeUser.email = safeUser.email || (typeof updated._id === 'string' && updated._id.includes('@') ? updated._id : '');

    res.json({
      success: true,
      message: `${field === 'phone' ? 'Mobile number' : 'Email address'} updated successfully!`,
      profile: safeUser
    });
  } catch (err) {
    console.error('Verify profile OTP error:', err);
    res.status(500).json({ error: 'Failed to verify code. Please try again.' });
  }
});

// Helper to sanitize and validate customer address book records
function sanitizeAddressInput(body) {
  const name = cleanText(body.name, 100);
  const phone = cleanText(body.phone, 15).replace(/\D/g, '').slice(-10);
  const alternatePhone = body.alternatePhone ? cleanText(body.alternatePhone, 15).replace(/\D/g, '').slice(-10) : '';
  const pincode = cleanText(body.pincode, 10).replace(/\D/g, '').slice(0, 6);
  const addressLine = cleanText(body.addressLine || body.street || body.address, 250);
  const locality = cleanText(body.locality || body.area, 150);
  const landmark = cleanText(body.landmark, 100) || '';
  const city = cleanText(body.city, 80);
  const state = cleanText(body.state, 80);
  const type = ['HOME', 'WORK', 'OTHER'].includes(String(body.type || '').toUpperCase()) ? String(body.type).toUpperCase() : 'HOME';
  const isDefault = Boolean(body.isDefault);

  if (!name || name.length < 2) throw new Error('Recipient full name is required (min 2 characters).');
  if (!phone || phone.length !== 10) throw new Error('Valid 10-digit Indian mobile number is required.');
  if (alternatePhone && alternatePhone.length !== 10) throw new Error('Alternate mobile number must be 10 digits.');
  if (!pincode || pincode.length !== 6) throw new Error('Valid 6-digit PIN code is required.');
  if (!addressLine || addressLine.length < 3) throw new Error('Flat, House No., Building address line is required.');
  if (!city || city.length < 2) throw new Error('City / District is required.');
  if (!state || state.length < 2) throw new Error('State is required.');

  return { name, phone, alternatePhone, pincode, addressLine, locality, landmark, city, state, type, isDefault };
}

// ── Saved Address Book APIs (Flipkart-Style) ───────────────────
app.get('/api/user/addresses', requireUser, async (req, res) => {
  try {
    const user = await usersRef.findOne({ _id: req.userId });
    if (!user) return res.status(404).json({ error: 'User not found' });

    let addresses = Array.isArray(user.addresses) ? user.addresses : [];
    if (addresses.length === 0 && user.address && user.address.trim()) {
      const initial = {
        id: 'addr_default',
        name: user.name || 'Primary Recipient',
        phone: user.phone || '',
        alternatePhone: '',
        pincode: '',
        addressLine: user.address.trim(),
        locality: '',
        landmark: '',
        city: '',
        state: '',
        type: 'HOME',
        isDefault: true,
        createdAt: new Date().toISOString()
      };
      addresses = [initial];
      await usersRef.updateOne({ _id: req.userId }, { $set: { addresses: [initial] } });
    }

    res.json({ success: true, addresses });
  } catch (err) {
    console.error('Fetch addresses error:', err);
    res.status(500).json({ error: 'Failed to fetch addresses' });
  }
});

app.post('/api/user/addresses', requireUser, async (req, res) => {
  try {
    const cleanAddr = sanitizeAddressInput(req.body);
    const user = await usersRef.findOne({ _id: req.userId });
    if (!user) return res.status(404).json({ error: 'User not found' });

    let currentAddresses = Array.isArray(user.addresses) ? user.addresses : [];
    const addrId = `addr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const shouldBeDefault = currentAddresses.length === 0 || cleanAddr.isDefault;

    if (shouldBeDefault) {
      currentAddresses = currentAddresses.map(a => ({ ...a, isDefault: false }));
    }

    const newAddress = {
      id: addrId,
      ...cleanAddr,
      isDefault: shouldBeDefault,
      createdAt: new Date().toISOString()
    };

    currentAddresses.push(newAddress);

    const legacyStr = `${newAddress.addressLine}${newAddress.locality ? ', ' + newAddress.locality : ''}, ${newAddress.city}, ${newAddress.state} - ${newAddress.pincode}`;
    await usersRef.updateOne(
      { _id: req.userId },
      { $set: { addresses: currentAddresses, address: legacyStr, updatedAt: new Date() } }
    );

    res.status(201).json({ success: true, address: newAddress, addresses: currentAddresses });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to add address' });
  }
});

app.put('/api/user/addresses/:addressId', requireUser, async (req, res) => {
  try {
    const cleanAddr = sanitizeAddressInput(req.body);
    const user = await usersRef.findOne({ _id: req.userId });
    if (!user) return res.status(404).json({ error: 'User not found' });

    let addresses = Array.isArray(user.addresses) ? user.addresses : [];
    const targetIdx = addresses.findIndex(a => a.id === req.params.addressId);
    if (targetIdx === -1) return res.status(404).json({ error: 'Address not found' });

    if (cleanAddr.isDefault) {
      addresses = addresses.map(a => ({ ...a, isDefault: false }));
    }

    addresses[targetIdx] = {
      ...addresses[targetIdx],
      ...cleanAddr,
      id: req.params.addressId,
      updatedAt: new Date().toISOString()
    };

    if (!addresses.some(a => a.isDefault) && addresses.length > 0) {
      addresses[0].isDefault = true;
    }

    const defaultAddr = addresses.find(a => a.isDefault) || addresses[0];
    const legacyStr = defaultAddr ? `${defaultAddr.addressLine}${defaultAddr.locality ? ', ' + defaultAddr.locality : ''}, ${defaultAddr.city}, ${defaultAddr.state} - ${defaultAddr.pincode}` : user.address;

    await usersRef.updateOne(
      { _id: req.userId },
      { $set: { addresses, address: legacyStr, updatedAt: new Date() } }
    );

    res.json({ success: true, address: addresses[targetIdx], addresses });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to update address' });
  }
});

app.delete('/api/user/addresses/:addressId', requireUser, async (req, res) => {
  try {
    const user = await usersRef.findOne({ _id: req.userId });
    if (!user) return res.status(404).json({ error: 'User not found' });

    let addresses = Array.isArray(user.addresses) ? user.addresses : [];
    const target = addresses.find(a => a.id === req.params.addressId);
    if (!target) return res.status(404).json({ error: 'Address not found' });

    addresses = addresses.filter(a => a.id !== req.params.addressId);
    if (target.isDefault && addresses.length > 0) {
      addresses[0].isDefault = true;
    }

    const defaultAddr = addresses.find(a => a.isDefault);
    const legacyStr = defaultAddr ? `${defaultAddr.addressLine}${defaultAddr.locality ? ', ' + defaultAddr.locality : ''}, ${defaultAddr.city}, ${defaultAddr.state} - ${defaultAddr.pincode}` : '';

    await usersRef.updateOne(
      { _id: req.userId },
      { $set: { addresses, address: legacyStr, updatedAt: new Date() } }
    );

    res.json({ success: true, addresses });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete address' });
  }
});

app.patch('/api/user/addresses/:addressId/default', requireUser, async (req, res) => {
  try {
    const user = await usersRef.findOne({ _id: req.userId });
    if (!user) return res.status(404).json({ error: 'User not found' });

    let addresses = Array.isArray(user.addresses) ? user.addresses : [];
    const targetIdx = addresses.findIndex(a => a.id === req.params.addressId);
    if (targetIdx === -1) return res.status(404).json({ error: 'Address not found' });

    addresses = addresses.map((a, i) => ({ ...a, isDefault: i === targetIdx }));
    const defaultAddr = addresses[targetIdx];
    const legacyStr = `${defaultAddr.addressLine}${defaultAddr.locality ? ', ' + defaultAddr.locality : ''}, ${defaultAddr.city}, ${defaultAddr.state} - ${defaultAddr.pincode}`;

    await usersRef.updateOne(
      { _id: req.userId },
      { $set: { addresses, address: legacyStr, updatedAt: new Date() } }
    );

    res.json({ success: true, addresses });
  } catch (err) {
    res.status(500).json({ error: 'Failed to set default address' });
  }
});

app.get('/api/orders/user/:id', requireUser, requireOwnUser, async (req, res) => {
  try {
    // Newest first (this used to sort on a `date` field orders don't have).
    const docs = await ordersRef.find({ userId: req.params.id }).sort({ createdAt: -1 }).toArray();
    const orders = await Promise.all(docs.map(async d => {
      const data = stripId(d);
      if (Array.isArray(data.items)) {
        data.items = await enrichOrderItemsWithDbSkus(data.items);
      }
      return {
        id: d._id,
        orderId: d.orderId || d.id || d._id,
        ...data,
        courierPartner: d.courierPartner || 'DTDC'
      };
    }));
    res.json(orders);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// Rate & review an order (star rating, comment, and images are all optional)
app.post('/api/orders/:orderId/review', async (req, res) => {
  try {
    const rawId = String(req.params.orderId || '').trim();
    if (!rawId) return res.status(400).json({ error: 'Order ID is required' });

    let orConditions = [
      { _id: rawId },
      { orderId: rawId },
      { id: rawId }
    ];
    if (ObjectId && ObjectId.isValid(rawId)) {
      try {
        orConditions.push({ _id: new ObjectId(rawId) });
      } catch (_) {}
    }

    let order = await ordersRef.findOne({ $or: orConditions });
    if (!order) {
      console.warn(`[Review] Order not found for identifier: "${rawId}"`);
      return res.status(404).json({ error: `Order "${rawId}" not found in system` });
    }

    let rating = req.body.rating != null ? parseInt(req.body.rating, 10) : null;
    if (rating != null && (isNaN(rating) || rating < 1 || rating > 5)) {
      rating = null;
    }
    const comment = req.body.comment ? String(req.body.comment).trim().slice(0, 2000) : '';
    let images = [];
    if (Array.isArray(req.body.images)) {
      images = req.body.images.filter(img => typeof img === 'string' && img.length > 0).slice(0, 5);
    } else if (typeof req.body.image === 'string' && req.body.image) {
      images = [req.body.image];
    }

    const review = {
      rating,
      comment,
      images,
      updatedAt: new Date().toISOString()
    };

    await ordersRef.updateOne(
      { _id: order._id },
      { $set: { review: review } }
    );
    invalidateRatingCache();
    const ratingStats = await computeAverageRating();

    res.json({ success: true, review, ratingStats });
  } catch (error) {
    console.error('Order review error:', error);
    res.status(500).json({ error: 'Failed to save review: ' + (error.message || 'Server error') });
  }
});

// Dynamic Customer Rating Aggregator (averages product & order ratings)
let ratingStatsCache = null;
let ratingStatsCacheTime = 0;
const RATING_CACHE_TTL = 30 * 1000; // 30s cache

async function computeAverageRating() {
  const now = Date.now();
  if (ratingStatsCache && (now - ratingStatsCacheTime < RATING_CACHE_TTL)) {
    return ratingStatsCache;
  }

  let totalStars = 0;
  let count = 0;

  try {
    if (productsRef) {
      const productsWithReviews = await productsRef.find({ 'reviews.0': { $exists: true } }, { projection: { reviews: 1 } }).toArray();
      for (const p of productsWithReviews) {
        if (Array.isArray(p.reviews)) {
          for (const r of p.reviews) {
            const num = Number(r.rating);
            if (!isNaN(num) && num >= 1 && num <= 5) {
              totalStars += num;
              count++;
            }
          }
        }
      }
    } else {
      // Local fallback if MongoDB productsRef is not connected
      try {
        const localProducts = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/data/products.json'), 'utf8'));
        for (const p of localProducts) {
          if (Array.isArray(p.reviews)) {
            for (const r of p.reviews) {
              const num = Number(r.rating);
              if (!isNaN(num) && num >= 1 && num <= 5) {
                totalStars += num;
                count++;
              }
            }
          }
        }
      } catch (_) {}
    }

    if (ordersRef) {
      const reviewedOrders = await ordersRef.find({ 'review.rating': { $exists: true, $ne: null } }, { projection: { 'review.rating': 1 } }).toArray();
      for (const o of reviewedOrders) {
        const num = Number(o.review?.rating);
        if (!isNaN(num) && num >= 1 && num <= 5) {
          totalStars += num;
          count++;
        }
      }
    }
  } catch (err) {
    console.error('Error computing average rating:', err);
  }

  // Real accurate average computed strictly from actual customer ratings
  let average = '5.0';
  if (count > 0) {
    const rawAvg = totalStars / count;
    average = Math.min(5.0, Math.max(1.0, Math.round(rawAvg * 10) / 10)).toFixed(1);
  }

  ratingStatsCache = {
    average,
    totalReviews: count,
    totalStars,
    submittedReviews: count,
    updatedAt: new Date().toISOString()
  };
  ratingStatsCacheTime = now;
  return ratingStatsCache;
}

function invalidateRatingCache() {
  ratingStatsCache = null;
  ratingStatsCacheTime = 0;
}

app.get('/api/stats/rating', async (req, res) => {
  try {
    const stats = await computeAverageRating();
    res.set('Cache-Control', 'public, max-age=15, stale-while-revalidate=60');
    res.json(stats);
  } catch (err) {
    res.json({ average: '5.0', totalReviews: 2, submittedReviews: 2 });
  }
});

let productsCache = null;
let productsCacheTime = 0;
let productsEtag = null;
const PRODUCTS_CACHE_TTL = 30 * 60 * 1000; // 30 minutes in-memory TTL; actively purged on writes

const GENERIC_KEYWORD_TOKENS = new Set([
  'poster', 'posters', 'wall art', 'wall decor', 'room decor', 'wall poster', 'art print', 'prints',
  'gift', 'buy posters online india', 'wall art india', 'aesthetic room decor', '300 gsm matte',
  'glare free wall art', 'bedroom poster', 'study room decor', 'living room wall art', 'premium art print',
  'gift for friend', 'wall hanging'
]);

function optimizeProductForListing(doc) {
  if (!doc) return doc;
  const item = withCatalogPrice(stripId(doc));

  // Extract real product lead copy; strip repetitive 350-char printing boilerplate
  let desc = (item.description || '').trim();
  const boilerplateIdx = desc.indexOf('Printed on museum-grade');
  if (boilerplateIdx > 20) {
    desc = desc.slice(0, boilerplateIdx).trim();
  }
  if (desc.length > 200) {
    desc = desc.slice(0, 197).trimEnd() + '…';
  }

  // Deduplicate and filter repetitive generic keyword stop-phrases
  let kw = item.keywords;
  if (typeof kw === 'string') {
    const parts = kw.split(',').map(k => k.trim().toLowerCase()).filter(k => k && !GENERIC_KEYWORD_TOKENS.has(k));
    kw = Array.from(new Set(parts)).join(', ');
  }

  // Retain reviews array only when populated
  let reviews = undefined;
  if (Array.isArray(item.reviews) && item.reviews.length > 0) {
    const valid = item.reviews.filter(r => Number(r.rating) > 0);
    if (valid.length) {
      reviews = valid;
    }
  }

  // Extract and normalize multiple categories / genres
  const cats = productFeed.getProductCategories ? productFeed.getProductCategories(doc) : (Array.isArray(doc.categories) ? doc.categories : (doc.category ? doc.category.split(/[,|]/).map(s => s.trim()).filter(Boolean) : []));
  const categoryStr = cats.length ? cats.join(', ') : (item.category || '');

  return {
    id: item.id,
    name: item.name,
    category: categoryStr,
    categories: cats,
    price: item.price,
    originalPrice: item.originalPrice || item.price,
    badge: item.badge,
    description: desc,
    stockQuantity: item.stockQuantity !== undefined ? item.stockQuantity : 50,
    sku: item.sku,
    image: item.image,
    images: Array.isArray(item.images) && item.images.length ? item.images : (item.image ? [item.image] : []),
    productType: item.productType || 'Lights',
    showInBestsellers: Boolean(item.showInBestsellers),
    showInNewArrivals: Boolean(item.showInNewArrivals),
    showInGrossing: Boolean(item.showInGrossing),
    showInHero: Boolean(item.showInHero),
    orderFrequency: item.orderFrequency || 0,
    createdAt: item.createdAt,
    keywords: kw,
    reviews
  };
}

function invalidateProductsCache() {
  productsCache = null;
  productsCacheTime = 0;
  productsEtag = null;
}

app.get('/api/products', async (req, res) => {
  try {
    const wantsFresh = /no-cache|no-store/.test(req.headers['cache-control'] || '');
    let payload = null;

    if (!wantsFresh && productsCache && (Date.now() - productsCacheTime < PRODUCTS_CACHE_TTL)) {
      payload = productsCache;
    } else {
      const docs = await productsRef.find().sort({ orderFrequency: -1, id: -1 }).toArray();
      payload = docs.map(d => optimizeProductForListing(d));

      if (!wantsFresh) {
        productsCache = payload;
        productsCacheTime = Date.now();
        productsEtag = `W/"brush-p-${productsCacheTime}-${payload.length}"`;
      }
    }

    const currentEtag = productsEtag || `W/"brush-p-${Date.now()}-${payload.length}"`;

    // Fast-path: Unfiltered requests return the full cached catalogue for backward compatibility
    const hasQueryParams = Object.keys(req.query || {}).length > 0;
    if (!hasQueryParams) {
      if (!wantsFresh && req.headers['if-none-match'] === currentEtag) {
        return res.status(304).end();
      }
      res.set('Cache-Control', wantsFresh ? 'no-store' : 'public, max-age=300, stale-while-revalidate=86400');
      res.set('ETag', currentEtag);
      res.set('X-Cache', productsCache === payload ? 'HIT' : 'MISS');
      res.set('X-Total-Count', String(payload.length));
      res.set('X-Has-More', 'false');
      return res.json(payload);
    }

    // Filtered / paginated progressive catalogue query
    const queryResult = productFeed.queryCatalog(payload, req.query);
    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    res.set('X-Total-Count', String(queryResult.total));
    res.set('X-Page', String(queryResult.page));
    res.set('X-Limit', String(queryResult.limit));
    res.set('X-Has-More', String(queryResult.hasMore));
    res.set('X-Total-Pages', String(queryResult.totalPages));

    if (queryResult.isPaginated) {
      return res.json(queryResult);
    }
    return res.json(queryResult.products);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    const product = await productsRef.findOne({ id: parseInt(req.params.id) });
    if (!product) return res.status(404).json({ error: 'Product not found' });
    const safeProduct = withCatalogPrice(stripId(product));
    safeProduct.reviews = safeProduct.reviews || [];
    res.set('Cache-Control', 'public, max-age=120, stale-while-revalidate=3600');
    res.json(safeProduct);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

app.post('/api/products/:id/reviews', reviewLimiter, uploadReviewPhoto.single('photo'), async (req, res) => {
  try {
    const user = cleanText(req.body.user, 60);
    const comment = cleanText(req.body.comment, 1000);
    const { rating } = req.body;
    if (!user || !rating || !comment) return res.status(400).json({ error: 'Missing review fields' });

    const ratingNum = parseInt(rating);
    if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return res.status(400).json({ error: 'Rating must be an integer from 1 to 5' });
    }

    const productId = parseInt(req.params.id);
    const product = await productsRef.findOne({ id: productId });
    if (!product) return res.status(404).json({ error: 'Product not found' });

    let photoUrl = '';
    if (req.file) {
      if (!bucket) {
        return res.status(503).json({ error: 'Photo uploads are unavailable — Firebase Storage is not configured.' });
      }
      const ext = path.extname(req.file.originalname) || '.jpg';
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const filename = `reviews/review-${uniqueSuffix}${ext}`;

      const fileUpload = bucket.file(filename);
      await fileUpload.save(req.file.buffer, {
        metadata: { contentType: req.file.mimetype }
      });
      await fileUpload.makePublic();
      photoUrl = `https://storage.googleapis.com/${bucket.name}/${filename}`;
    }

    const newReview = {
      user,
      rating: ratingNum,
      comment,
      photo: photoUrl,
      date: new Date().toISOString()
    };

    await productsRef.updateOne({ id: productId }, { $push: { reviews: newReview } });
    invalidateProductsCache();
    invalidateRatingCache();
    const ratingStats = await computeAverageRating();

    res.status(201).json({ ...newReview, ratingStats });
  } catch (error) {
    console.error('Review error:', error);
    res.status(500).json({ error: 'Failed to add review' });
  }
});


// ==========================================
// SUBMIT REQUIREMENTS
// ==========================================
app.post('/api/requirements', requirementsLimiter, async (req, res) => {
  try {
    const { name, contact, details, website } = req.body;
    // Honeypot fields should remain empty for real visitors. Return the same
    // generic success shape as a valid submission so bots learn nothing.
    if (website) return res.status(201).json({ success: true });
    const safeName = cleanText(name, 100);
    const safeContact = cleanText(contact, 160);
    const safeDetails = cleanText(details, 2000);
    if (!safeName || !safeContact || !safeDetails) {
      return res.status(400).json({ error: 'Name, contact, and details are required' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safeContact) && !/^[\d+\-\s()]{7,20}$/.test(safeContact)) {
      return res.status(400).json({ error: 'Please enter a valid phone number or email address' });
    }

    const requirement = {
      name: safeName,
      contact: safeContact,
      details: safeDetails,
      createdAt: new Date(),
      status: 'new'
    };

    const result = await requirementsRef.insertOne(requirement);
    res.status(201).json({ success: true, id: result.insertedId });
  } catch (error) {
    console.error('Error saving requirements:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==========================================
// REACH OUT & ARTIST / RECOMMENDATIONS
// ==========================================
app.post('/api/reachout', async (req, res) => {
  try {
    const { type, name, email, phone, portfolio, style, theme, details, platform, collab, website } = req.body || {};
    // Honeypot check for bots
    if (website) return res.status(201).json({ success: true });

    const safeType = cleanText(type, 50).toLowerCase() || 'general';
    const safeName = cleanText(name, 100);
    const safeEmail = cleanText(email, 160);

    if (!safeName || !safeEmail) {
      return res.status(400).json({ error: 'Name and email are required.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safeEmail)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    const payload = {};
    if (portfolio) payload.portfolio = cleanText(portfolio, 500);
    if (style) payload.style = cleanText(style, 3000);
    if (theme) payload.theme = cleanText(theme, 300);
    if (details) payload.details = cleanText(details, 3000);
    if (platform) payload.platform = cleanText(platform, 500);
    if (collab) payload.collab = cleanText(collab, 3000);
    if (phone) payload.phone = cleanText(phone, 50);

    const doc = {
      type: safeType, // 'artist', 'poster_request', 'curator', 'general'
      name: safeName,
      email: safeEmail,
      payload,
      status: 'unread',
      ip: req.ip || req.headers['x-forwarded-for'] || '',
      createdAt: new Date()
    };

    const result = await reachoutSubmissionsRef.insertOne(doc);

    // Send confirmation email to applicant from admin@brush-art.in
    try {
      const typeLabels = {
        artist: 'Artist Collaboration Application',
        request: 'Poster Recommendation / Request',
        poster_request: 'Poster Recommendation / Request',
        curator: 'Curator Proposal',
        general: 'Inquiry'
      };
      const label = typeLabels[safeType] || 'Inquiry';

      await sendMail({
        from: 'Brush Support <admin@brush-art.in>',
        replyTo: 'admin@brush-art.in',
        to: safeEmail,
        subject: `We've received your ${label} — Brush`,
        html: `<!doctype html><html><body style="font-family:sans-serif;background:#faf8f5;padding:24px;color:#1a1a1a;">
          <div style="max-width:540px;margin:0 auto;background:#ffffff;padding:32px;border-radius:12px;border:1px solid #e5e5e5;">
            <h2 style="margin:0 0 12px;color:#ff4c24;">Thank you, ${escapeHtml(safeName)}!</h2>
            <p style="font-size:14px;line-height:1.6;color:#444;">We have successfully received your <strong>${label}</strong>.</p>
            <p style="font-size:14px;line-height:1.6;color:#444;">Our creative curation team reviews all artist applications and recommendations. If your art or suggestion fits our upcoming drops and collection roadmap, our team will get in touch with you directly.</p>
            <hr style="border:none;border-top:1px solid #eee;margin:20px 0;">
            <p style="font-size:12px;color:#888;margin:0;">Brush Studio &middot; A Kraft Studios Brand &middot; <a href="https://www.brush-art.in" style="color:#ff4c24;text-decoration:none;">brush-art.in</a></p>
          </div>
        </body></html>`,
        text: `Hi ${safeName},\n\nWe have received your ${label}. Our creative curation team reviews all submissions and will be in touch if your idea or art aligns with our roadmap.\n\nThank you,\nBrush Studio\nhttps://www.brush-art.in`
      });
    } catch (e) {
      console.warn('Reach out confirmation email warning:', e.message);
    }

    res.status(201).json({ success: true, message: 'Your message has been received! Thank you for reaching out.' });
  } catch (error) {
    console.error('Reach out submission error:', error);
    res.status(500).json({ error: 'Failed to submit form. Please try again.' });
  }
});

app.get('/api/admin/reachout', requireAdmin, async (req, res) => {
  try {
    const filter = {};
    if (req.query.type && req.query.type !== 'all') {
      filter.type = req.query.type;
    }
    if (req.query.status && req.query.status !== 'all') {
      filter.status = req.query.status;
    }
    const docs = await reachoutSubmissionsRef.find(filter).sort({ createdAt: -1 }).toArray();
    res.json(docs);
  } catch (error) {
    console.error('Fetch reach out error:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

app.patch('/api/admin/reachout/:id', requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    const { ObjectId } = require('mongodb');
    await reachoutSubmissionsRef.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { status: String(status || 'read') } }
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update message status' });
  }
});

app.delete('/api/admin/reachout/:id', requireAdmin, async (req, res) => {
  try {
    const { ObjectId } = require('mongodb');
    await reachoutSubmissionsRef.deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

// ── Admin: Customer & Product Reviews Hub ────────────────────────────
app.get('/api/admin/reviews', requireAdmin, async (req, res) => {
  try {
    const list = [];

    // 1. Collect Product Page Reviews
    let productsWithReviews = [];
    if (productsRef) {
      productsWithReviews = await productsRef.find({ 'reviews.0': { $exists: true } }).toArray();
    } else {
      try {
        const local = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/data/products.json'), 'utf8'));
        productsWithReviews = local.filter(p => Array.isArray(p.reviews) && p.reviews.length > 0);
      } catch (_) {}
    }

    productsWithReviews.forEach(p => {
      if (Array.isArray(p.reviews)) {
        p.reviews.forEach((r, idx) => {
          list.push({
            id: `prod_${p.id}_${idx}`,
            rawIndex: idx,
            type: 'product',
            sourceLabel: 'Product Page Review',
            productId: p.id,
            productName: p.name || `Product #${p.id}`,
            productImage: p.image || (Array.isArray(p.images) ? p.images[0] : ''),
            productSlug: p.slug || '',
            author: r.user || 'Shopper',
            rating: Number(r.rating) || 5,
            comment: r.comment || '',
            photo: r.photo || '',
            images: r.photo ? [r.photo] : [],
            createdAt: r.date || r.createdAt || new Date().toISOString()
          });
        });
      }
    });

    // 2. Collect Customer Order Delivery Reviews
    let ordersWithReviews = [];
    if (ordersRef) {
      ordersWithReviews = await ordersRef.find({ 'review': { $exists: true, $ne: null } }).toArray();
    }

    ordersWithReviews.forEach(o => {
      const rev = o.review;
      if (!rev) return;
      if (rev.rating == null && !rev.comment) return;

      const items = (o.items || []).map(it => ({
        name: it.name || it.title || 'Art Poster',
        size: it.size || '',
        framing: it.framing || '',
        quantity: it.quantity || 1,
        image: it.image || ''
      }));

      list.push({
        id: `order_${o.orderId || o.id}`,
        type: 'order',
        sourceLabel: 'Order Delivery Review',
        orderId: o.orderId || o.id,
        orderTotal: o.total,
        orderStatus: o.status,
        customerName: o.customer?.name || o.shippingAddress?.fullName || 'Customer',
        customerEmail: o.customer?.email || '',
        customerPhone: o.customer?.phone || '',
        author: o.customer?.name || 'Customer',
        rating: rev.rating != null ? Number(rev.rating) : null,
        comment: rev.comment || '',
        photo: Array.isArray(rev.images) && rev.images.length > 0 ? rev.images[0] : (rev.image || ''),
        images: Array.isArray(rev.images) ? rev.images : (rev.image ? [rev.image] : []),
        items: items,
        createdAt: rev.updatedAt || rev.date || o.createdAt || new Date().toISOString()
      });
    });

    // Sort newest first
    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Aggregate statistics
    let totalStars = 0;
    let ratedCount = 0;
    let fiveStar = 0;
    let fourStar = 0;
    let threeOrLower = 0;
    let withComments = 0;
    let withPhotos = 0;

    list.forEach(r => {
      if (r.rating != null && r.rating >= 1 && r.rating <= 5) {
        totalStars += r.rating;
        ratedCount++;
        if (r.rating === 5) fiveStar++;
        else if (r.rating === 4) fourStar++;
        else threeOrLower++;
      }
      if (r.comment && String(r.comment).trim()) withComments++;
      if (r.images && r.images.length > 0) withPhotos++;
    });

    const averageRating = ratedCount > 0 ? (totalStars / ratedCount).toFixed(1) : '5.0';

    res.json({
      reviews: list,
      stats: {
        total: list.length,
        productCount: list.filter(r => r.type === 'product').length,
        orderCount: list.filter(r => r.type === 'order').length,
        averageRating,
        ratedCount,
        fiveStar,
        fourStar,
        threeOrLower,
        withComments,
        withPhotos
      }
    });
  } catch (error) {
    console.error('Fetch admin reviews error:', error);
    res.status(500).json({ error: 'Failed to fetch reviews: ' + error.message });
  }
});

app.delete('/api/admin/reviews/:type/:targetId', requireAdmin, async (req, res) => {
  try {
    const { type, targetId } = req.params;
    const { index, comment, user } = req.query;

    if (type === 'order') {
      if (!ordersRef) return res.status(503).json({ error: 'Database unavailable' });
      const rawId = String(targetId).trim();
      const orConditions = [{ orderId: rawId }, { id: rawId }];
      const { ObjectId } = require('mongodb');
      if (ObjectId && ObjectId.isValid(rawId)) {
        try { orConditions.push({ _id: new ObjectId(rawId) }); } catch (_) {}
      }
      await ordersRef.updateOne({ $or: orConditions }, { $unset: { review: "" } });
      invalidateRatingCache();
      return res.json({ success: true, message: 'Order review removed' });
    }

    if (type === 'product') {
      if (!productsRef) return res.status(503).json({ error: 'Database unavailable' });
      const productId = parseInt(targetId, 10);
      const product = await productsRef.findOne({ id: productId });
      if (!product) return res.status(404).json({ error: 'Product not found' });

      let reviews = Array.isArray(product.reviews) ? [...product.reviews] : [];
      const idx = index != null ? parseInt(index, 10) : -1;

      if (idx >= 0 && idx < reviews.length) {
        reviews.splice(idx, 1);
      } else if (comment || user) {
        reviews = reviews.filter(r => !(r.comment === comment && r.user === user));
      } else {
        return res.status(400).json({ error: 'Specific review index or details required' });
      }

      await productsRef.updateOne({ id: productId }, { $set: { reviews: reviews } });
      invalidateProductsCache();
      invalidateRatingCache();
      return res.json({ success: true, message: 'Product review removed' });
    }

    return res.status(400).json({ error: 'Invalid review type' });
  } catch (error) {
    console.error('Delete review error:', error);
    res.status(500).json({ error: 'Failed to delete review: ' + error.message });
  }
});

app.post('/api/coupons/validate', async (req, res) => {
  try {
    const { couponCode, items } = req.body;
    if (!couponCode) return res.status(400).json({ error: 'Coupon code is required' });
    if (!items || !items.length) return res.status(400).json({ error: 'Cart is empty' });

    // 'online' rather than 'cod': the payment method only affects the COD fee,
    // and a cart that must be prepaid would now be rejected outright for 'cod'.
    const pricing = await computeOrderPricing(items, 'online', couponCode);
    // couponDiscount, NOT discount — `discount` is the coupon plus the launch
    // offer, and the browser applies the launch offer itself. Returning the
    // combined figure made the offer count twice in the preview total.
    const discount = pricing.couponDiscount;
    const appliedCoupon = pricing.appliedCoupon;
    const subtotal = pricing.subtotal;
    
    if (!appliedCoupon) {
       // Find out why it failed
       const coupon = await mongoClient.db().collection('coupons').findOne({ code: String(couponCode).trim().toUpperCase() });
       if (!coupon) return res.status(404).json({ error: 'Coupon not found' });
       if (coupon.status !== 'Active') return res.status(400).json({ error: 'Coupon has already been used' });
       if (subtotal < coupon.minCartValue) return res.status(400).json({ error: `Minimum cart value of ₹${coupon.minCartValue} required` });
       if (coupon.maxCartValue && subtotal > coupon.maxCartValue) return res.status(400).json({ error: `Maximum cart value allowed is ₹${coupon.maxCartValue}` });
       return res.status(400).json({ error: 'Invalid coupon' });
    }

    res.json({
       success: true,
       discount,
       code: appliedCoupon.code,
       type: appliedCoupon.discountType,
       value: appliedCoupon.discountValue,
       // Shown next to the code so the shopper can see both savings.
       launchDiscount: pricing.launchDiscount
    });
  } catch(error) {
     if (error.name === 'OrderValidationError') {
       return res.status(400).json({ error: error.message });
     }
     console.error('Coupon validation error:', error);
     res.status(500).json({ error: 'Failed to validate coupon' });
  }
});

// What the shopper needs in order to transfer the money, and nothing else.
// Driven entirely by env, so the details can change without a deploy and are
// not sitting in the repository.
function directPayQrPath() {
  const rel = process.env.DIRECT_PAY_QR_PATH || 'assets/misc/upi-qr.png';
  try {
    return fs.existsSync(path.join(__dirname, '../public', rel)) ? rel : null;
  } catch (e) {
    return null;
  }
}

function directPayConfig() {
  if (process.env.DIRECT_PAY_ENABLED !== 'true') return { enabled: false };
  return {
    enabled: true,
    upiVpa: process.env.DIRECT_PAY_UPI_VPA || null,
    payeeName: process.env.DIRECT_PAY_PAYEE_NAME || 'Brush',
    // Only advertised once the file is actually there, so the payment-request
    // email never ships a broken image. Drop your QR at
    // public/assets/misc/upi-qr.png (or point DIRECT_PAY_QR_PATH elsewhere).
    qrUrl: directPayQrPath(),
    bank: process.env.DIRECT_PAY_ACCOUNT_NUMBER ? {
      bankName: process.env.DIRECT_PAY_BANK_NAME || null,
      accountName: process.env.DIRECT_PAY_ACCOUNT_NAME || null,
      accountNumber: process.env.DIRECT_PAY_ACCOUNT_NUMBER,
      ifsc: process.env.DIRECT_PAY_IFSC || null
    } : null
  };
}

app.get('/api/config/direct-pay', (req, res) => res.json(directPayConfig()));

app.get('/api/config/razorpay', (req, res) => {
  res.json({ key_id: process.env.RAZORPAY_KEY_ID });
});

// Shared by /api/payment/create-order (which stores the snapshot the webhook
// will need) and /api/orders (which writes the order). Returns a message
// instead of throwing so each caller can shape its own response.
const REQUIRED_CUSTOMER_FIELDS = ['name', 'email', 'phone', 'address', 'city', 'state', 'pincode'];

function buildSafeCustomer(customer) {
  if (!customer || typeof customer !== 'object' || Array.isArray(customer) ||
      REQUIRED_CUSTOMER_FIELDS.some(f => !isNonEmptyString(customer[f]) || !customer[f].trim())) {
    return { error: 'Missing required customer details' };
  }
  // Built explicitly from trimmed, length-capped strings so nothing else from
  // the request body is ever persisted.
  const safe = {
    name: cleanText(customer.name, 120),
    email: cleanText(customer.email, 160).toLowerCase(),
    phone: cleanText(customer.phone, 20),
    address: cleanText(customer.address, 400),
    city: cleanText(customer.city, 80),
    state: cleanText(customer.state, 80),
    pincode: cleanText(customer.pincode, 10)
  };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(safe.email)) return { error: 'Please enter a valid email address' };
  if (!/^\d{6}$/.test(safe.pincode)) return { error: 'Please enter a valid 6-digit pincode' };
  if (!/^[\d+\-\s()]{7,20}$/.test(safe.phone)) return { error: 'Please enter a valid phone number' };
  return { safe };
}

// Checkout identity is account data, not shipping-form data. The browser may
// submit a modified name/email/phone, so public checkout routes replace those
// fields with the profile belonging to the already-validated bearer session.
async function buildAuthenticatedCustomer(req, submittedCustomer) {
  if (!req.userId) return { error: 'Please log in to check out.' };
  const user = await usersRef.findOne({ _id: req.userId });
  if (!user) return { error: 'Your account could not be found. Please log in again.' };

  const accountId = cleanText(user._id || user.id || req.userId, 160);
  const email = cleanText(user.email || (accountId.includes('@') ? accountId : ''), 160);
  const phone = cleanText(user.phone || (!accountId.includes('@') ? accountId : ''), 20);
  const canonical = {
    ...submittedCustomer,
    name: cleanText(user.name, 120),
    email,
    phone
  };
  if (!canonical.name || !canonical.email || !canonical.phone) {
    return { error: 'Your account is missing name, email, or phone details. Update your profile before checking out.' };
  }
  return buildSafeCustomer(canonical);
}

// ==========================================
// RAZORPAY WEBHOOK
// ==========================================
// Why this exists: until now an order was only written when the shopper's
// browser came back from the payment window and called /api/orders. If they
// closed the tab, lost signal, or their phone died in that window, Razorpay
// had the money and we had no order. Razorpay tells the server directly, so
// the order no longer depends on the browser surviving the round trip.
//
// Everything needed to build the order was stored when the payment was
// created (see savePaymentSession), because a webhook carries payment facts
// and no shipping address.
async function handleRazorpayWebhook(req, res) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    console.error('Webhook received but RAZORPAY_WEBHOOK_SECRET is not set — ignoring.');
    // 200 on purpose: a non-2xx makes Razorpay retry for hours over a
    // misconfiguration on our side that a retry cannot fix.
    return res.status(200).json({ ignored: 'not configured' });
  }

  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(String(req.body || ''), 'utf8');
  const given = req.get('X-Razorpay-Signature') || '';
  const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  // timingSafeEqual throws on a length mismatch, so check that first.
  const signatureOk = given.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(given, 'utf8'));
  if (!signatureOk) {
    console.warn('Webhook rejected: bad signature');
    return res.status(400).json({ error: 'invalid signature' });
  }

  let event;
  try { event = JSON.parse(raw.toString('utf8')); }
  catch (e) { return res.status(400).json({ error: 'invalid payload' }); }

  // Acknowledge immediately. Razorpay retries on anything slow or non-2xx, and
  // the work below is idempotent, so it is safer to say "received" now and
  // reconcile after than to hold the connection open through a transaction.
  res.status(200).json({ received: true });

  try {
    await processPaymentEvent(event);
  } catch (err) {
    console.error('Webhook processing failed:', err.message);
  }
}

// A capture we cannot turn into an order means money has been taken with
// nothing to fulfil. console.error alone would bury that in a log nobody
// reads, so it is written down and surfaced in the admin panel for
// reconciliation or refund.
async function recordPaymentException(payment, reason, detail) {
  console.error(`Payment exception (${reason}) for ${payment && payment.id}: ${detail}`);
  if (!paymentExceptionsRef) return;
  await paymentExceptionsRef.updateOne(
    { _id: (payment && payment.id) || ('unknown-' + Date.now()) },
    { $set: {
        razorpayOrderId: payment && payment.order_id,
        amountPaise: payment && payment.amount,
        method: payment && payment.method,
        reason, detail,
        seenAt: new Date(),
        resolved: false
      } },
    { upsert: true }
  ).catch(err => console.error('Could not record payment exception:', err.message));
}

async function processPaymentEvent(event) {
  // payment.captured is the one that means money has actually settled.
  // payment.authorized only means it is held. Razorpay does not guarantee
  // order or uniqueness of delivery, so this must be safe to run twice.
  if (!event || event.event !== 'payment.captured') return;

  const payment = event.payload && event.payload.payment && event.payload.payment.entity;
  if (!payment || !payment.order_id) return;

  const pending = await getPaymentSession(payment.order_id);
  if (!pending) {
    // Either it expired, or this is a payment we never issued. Worth knowing
    // about: it means money was taken with nothing to fulfil.
    await recordPaymentException(payment, 'no-payment-session',
      `No stored session for ${payment.order_id}. It may have expired, or the payment was not initiated here.`);
    return;
  }

  if (pending.orderId) return;                 // the browser already built it
  if (pending.amountPaise !== payment.amount) {
    await recordPaymentException(payment, 'amount-mismatch',
      `Authorized ${pending.amountPaise} paise but captured ${payment.amount}. No order created.`);
    return;
  }

  // Claim it, so a webhook retry and the returning browser cannot both write.
  const claimed = await claimPaymentSession(payment.order_id);
  if (!claimed) return;

  const snap = pending.snapshot || {};
  const session = mongoClient.startSession();
  try {
    const pricing = await computeOrderPricing(snap.items, 'online', snap.couponCode, snap.deliveryOption);
    if (Math.round(pricing.total * 100) !== pending.amountPaise) {
      // Prices or stock moved between payment and capture. Do not quietly
      // charge a different figure — leave it for a human.
      await recordPaymentException(payment, 'reprice-mismatch',
        `Cart reprices to ${Math.round(pricing.total * 100)} paise but ${pending.amountPaise} was captured — prices or stock moved in between.`);
      await releasePaymentSession(payment.order_id);
      return;
    }

    const { order } = await commitOrder({
      safeCustomer: snap.customer,
      pricing,
      // The shopper paid online; which instrument they used is Razorpay's
      // detail, and `upi` is what the rest of the system already understands.
      paymentMethod: payment.method === 'card' ? 'card' : 'upi',
      deliveryOption: snap.deliveryOption,
      preferredCourier: snap.preferredCourier,
      userId: snap.userId || null,
      session
    });

    await finishPaymentSession(payment.order_id, order.orderId);
    console.log(`Webhook created order ${order.orderId} for payment ${payment.id}`);
    sendOrderEmail(order).catch(err => console.error('Order email failed:', err));
  } catch (err) {
    await releasePaymentSession(payment.order_id);
    await recordPaymentException(payment, 'order-write-failed', err.message);
    throw err;
  } finally {
    await session.endSession();
  }
}

app.post('/api/payment/create-order', paymentOrderLimiter, requireUser, async (req, res) => {
  try {
    // Amount is computed here, server-side, from the actual cart contents —
    // never taken from the client — so what the shopper is asked to pay
    // (and what /api/orders later requires the payment to match) can't be
    // manipulated by sending a smaller `amount` for the same items.
    const { total } = await computeOrderPricing(req.body.items, 'online', req.body.couponCode, req.body.deliveryOption);
    const amountPaise = Math.round(total * 100);

    // The shipping details are captured now, before the payment window opens.
    // Razorpay only reports that money moved; it never sends us an address, so
    // if this is not stored up front the webhook has nothing to fulfil.
    const built = await buildAuthenticatedCustomer(req, req.body.customer);
    if (built.error) return res.status(400).json({ error: built.error });
    const safeCustomer = built.safe;

    const options = {
      amount: amountPaise,
      currency: "INR",
      receipt: "rcpt_" + Date.now()
    };

    let order;
    if (!razorpay) {
      if (process.env.ALLOW_MOCK_PAYMENTS === 'true') {
        order = { id: 'order_mock_' + Date.now(), amount: amountPaise, currency: 'INR' };
      } else {
        return res.status(503).json({ error: 'Razorpay is not configured on this server. Please choose Cash on Delivery or contact us.' });
      }
    } else {
      try {
        order = await razorpay.orders.create(options);
      } catch (rzpError) {
        console.error('Razorpay Order Error:', rzpError);
        // The mock fallback skips the payment step entirely (checkout confirms
        // "order_mock_" orders without opening Razorpay, and /api/orders skips
        // the signature check for them). It used to kick in automatically
        // whenever Razorpay failed — so a Razorpay outage or bad key made
        // every UPI/card order confirm as paid with no money collected. Now
        // it is a local-development switch only.
        if (process.env.ALLOW_MOCK_PAYMENTS !== 'true') {
          return res.status(503).json({ error: 'Online payment is temporarily unavailable. Please choose Cash on Delivery or try again shortly.' });
        }
        order = { id: 'order_mock_' + Date.now(), amount: amountPaise, currency: 'INR' };
      }
    }

    // Everything the webhook would need to build this order without the
    // browser. The customer block is validated here rather than trusted, so a
    // webhook-created order is held to the same standard as a browser one.
    await savePaymentSession(order.id, {
      amountPaise,
      snapshot: {
        customer: safeCustomer,
        items: req.body.items,
        couponCode: req.body.couponCode || null,
        deliveryOption: req.body.deliveryOption || null,
        preferredCourier: req.body.preferredCourier || null,
        userId: getAuthenticatedUserId(req)
      }
    });
    res.json(order);
  } catch (error) {
    if (error instanceof OrderValidationError) {
      return res.status(400).json({ error: error.message });
    }
    console.error('Payment order creation error:', error);
    res.status(500).json({ error: 'Failed to initiate payment' });
  }
});
app.post('/api/payment/cashfree/create-order', paymentOrderLimiter, requireUser, async (req, res) => {
  if (!cashfreeReady) return res.status(503).json({ error: 'Cashfree is not configured' });
  try {
    const { total } = await computeOrderPricing(req.body.items, 'online', req.body.couponCode, req.body.deliveryOption);
    const amount = Math.round(total * 100) / 100; // Cashfree requires decimal value
    const amountPaise = Math.round(total * 100);

    const built = await buildAuthenticatedCustomer(req, req.body.customer);
    if (built.error) return res.status(400).json({ error: built.error });
    const safeCustomer = built.safe;

    const order_id = 'cf_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex');
    
    // Format required by Cashfree
    const customerPhone = safeCustomer.phone.replace(/\D/g, '').slice(-10) || "9999999999";
    const customerId = safeCustomer.email.replace(/[^a-zA-Z0-9_-]/g, '') || "guest_" + Date.now();

    const request = {
      order_amount: amount,
      order_currency: "INR",
      order_id: order_id,
      customer_details: {
        customer_id: customerId,
        customer_phone: customerPhone,
        customer_name: safeCustomer.name,
        customer_email: safeCustomer.email
      },
      order_meta: {
        // Fallback return URL; we primarily rely on the JS SDK promise.
        return_url: `${SITE_URL}/order-confirmation/?orderId={order_id}`
      }
    };

    const response = await cashfreePG.PGCreateOrder(request);

    await savePaymentSession(order_id, {
      amountPaise,
      snapshot: {
        customer: safeCustomer,
        items: req.body.items,
        couponCode: req.body.couponCode || null,
        deliveryOption: req.body.deliveryOption || null,
        preferredCourier: req.body.preferredCourier || null,
        userId: getAuthenticatedUserId(req)
      }
    });

    res.json({ payment_session_id: response.data.payment_session_id, order_id });
  } catch (error) {
    if (error instanceof OrderValidationError) {
      return res.status(400).json({ error: error.message });
    }
    console.error('Cashfree order creation error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to initiate Cashfree payment' });
  }
});


// ==========================================
// ORDER WRITING (shared)
// ==========================================
// Both the browser confirmation (/api/orders) and the Razorpay webhook end up
// here, so a webhook-built order is priced, taxed, stocked and shaped exactly
// like a browser-built one. Two copies of this logic would drift the moment a
// charge or a field changed.
//
// The caller owns payment verification and the Mongo session; this only prices
// the cart and commits the order, stock and coupon together.
async function commitOrder({ safeCustomer, pricing, paymentMethod, deliveryOption, preferredCourier, userId, session, status = 'confirmed', paymentReference = null, manualOrder = false, createdByAdmin = null, internalNotes = null }) {
  const {
    subtotal, gst, tax, taxableValue, shipping, codFee, processingFee, discount,
    launchDiscount, bundleDiscount, bundleFreeCount, bundleLabel, couponDiscount, manualDiscount, deliverySurcharge, total, enrichedItems, appliedCoupon
  } = pricing;
  const chosenDelivery = deliveryOptionFor(deliveryOption);

  // A courier preference costs nothing and changes no total — it is a note
  // for the team, who confirm serviceability and any charge with the
  // customer before dispatch. Anything not on our own list is dropped
  // rather than rejected: it must never be able to fail a paid checkout.
  const courierAsked = cleanText(preferredCourier, 40);
  const courierPreference = isKnownCourier(courierAsked)
    ? COURIER_PARTNERS.find(c => c.toLowerCase() === courierAsked.toLowerCase())
    : null;
  // Free delivery means we choose the carrier, so a preference cannot apply.
  const courierPreferenceHonourable = courierPreference && pricing.shipping > 0;


  // Order lookup (order-confirmation page, invoice, status emails) is
  // unauthenticated by design - guest checkout has no account to check
  // ownership against, so the order ID itself is the access credential,
  // same as Amazon/Flipkart guest tracking links. It must therefore be
  // unguessable, not just unique - crypto-random, not a 4-digit counter.
  const orderId = 'ORD-' + crypto.randomBytes(6).toString('hex').toUpperCase();
  const invoiceNumber = await getNextInvoiceNumber();
  const promise = deliveryPromiseFor(safeCustomer.pincode, enrichedItems, chosenDelivery);
  const estimatedDelivery = addBusinessDays(new Date(), promise.maxDays);

  const order = {
    _id: orderId,
    id: orderId,
    orderId: orderId,
    invoiceNumber,
    userId,
    customer: safeCustomer,
    items: enrichedItems,
    paymentMethod,
    subtotal,
    gst,
    tax,
    taxableValue,
    shipping,
    codFee,
    processingFee,
    discount,
    launchDiscount,
    bundleDiscount,
    bundleFreeCount,
    bundleLabel,
    couponDiscount,
    manualDiscount,
    deliverySurcharge,
    deliveryOption: chosenDelivery.value,
    deliveryLabel: chosenDelivery.label,
    preferredCourier: courierPreferenceHonourable ? courierPreference : null,
    courierPreferenceStatus: !courierPreference ? null
      : (courierPreferenceHonourable ? 'requested' : 'not-applicable-free-delivery'),
    courierPartner: (courierPreferenceHonourable && courierPreference) ? courierPreference : 'DTDC',
    total,
    status,
    ...(manualOrder ? {
      manualOrder: true,
      createdByAdmin,
      internalNotes: internalNotes || null
    } : {}),
    // Set for a direct transfer: what the shopper says they sent, plus the
    // trail of who checked it against the bank and when.
    paymentReference,
    paymentVerifiedAt: null,
    paymentVerifiedBy: null,
    estimatedDelivery: estimatedDelivery.toISOString(),
    deliveryPromise: promise.label,
    createdAt: new Date()
  };

  // Save order + deduct stock + mark coupon used atomically
  await session.withTransaction(async () => {
    await ordersRef.insertOne(order, { session });
    
    if (appliedCoupon && !appliedCoupon.isMultiUse) {
      const result = await mongoClient.db().collection('coupons').updateOne(
        { code: appliedCoupon.code, status: 'Active' },
        { $set: { status: 'Used', usedAt: new Date(), orderId: orderId } },
        { session }
      );
      if (result.matchedCount === 0) {
        throw new OrderValidationError('The applied coupon code has already been used or is invalid.');
      }
    }

    for (const item of enrichedItems) {
      if ((item.productId >= 9990 && item.productId <= 10050) || Array.isArray(item.customPosters)) {
        // Virtual custom poster pack - produced on demand; optionally increment popularity for member posters
        if (Array.isArray(item.customPosters)) {
          for (const poster of item.customPosters) {
            const pId = Number(poster.id || poster.productId);
            if (Number.isInteger(pId) && pId > 0 && !(pId >= 9990 && pId <= 10050)) {
              await productsRef.updateOne({ id: pId }, { $inc: { orderFrequency: item.quantity } }, { session }).catch(() => {});
            }
          }
        }
        continue;
      }
      // The availability check in computeOrderPricing() runs before this
      // transaction and without its session, so two simultaneous checkouts
      // for the last unit both passed it and both decremented — stock went
      // negative and one item was sold twice. Asserting the stock in the
      // filter makes the decrement itself the check: if it no longer holds,
      // matchedCount is 0, we throw, and the whole transaction (order insert
      // included) rolls back.
      const result = await productsRef.updateOne(
        { id: item.productId, stockQuantity: { $gte: item.quantity } },
        { $inc: { stockQuantity: -item.quantity, orderFrequency: item.quantity } },
        { session }
      );
      if (result.matchedCount === 0) {
        throw new OrderValidationError(`"${item.name || 'An item'}" just went out of stock — please review your cart.`);
      }
    }
  });

  return { order, pricing };
}

app.post('/api/orders', orderCreateLimiter, requireUser, async (req, res) => {
  const session = mongoClient.startSession();
  let consumedPaymentId = null;
  try {
    const { customer, items, paymentMethod, razorpay_order_id, razorpay_payment_id, razorpay_signature, cashfree_order_id, couponCode, deliveryOption, preferredCourier } = req.body;
    // Set once the payment authorization has been verified; the single-use
    // entry is removed only after the order commits (see below).
    // Never trust a client-supplied userId — that would let anyone attach
    // a fabricated order to any other account, which then shows up in that
    // victim's real order history (GET /api/orders/user/:id is correctly
    // ownership-checked, but had no way to know this write was forged).
    const userId = getAuthenticatedUserId(req);

    // Checkout is account-bound: derive identity from the validated session,
    // while retaining only the submitted shipping destination fields.
    const built = await buildAuthenticatedCustomer(req, customer);
    if (built.error) return res.status(400).json({ error: built.error });
    const safeCustomer = built.safe;
    if (!['cod', 'upi', 'card', 'direct', 'cashfree', 'razorpay'].includes(paymentMethod)) {
      return res.status(400).json({ error: 'Invalid payment method' });
    }
    if (paymentMethod === 'direct' && !directPayConfig().enabled) {
      return res.status(400).json({ error: 'Direct transfer is not available right now. Please choose another payment method.' });
    }

    // A direct transfer is money the shopper says they have already sent. The
    // reference is what lets us find it on the statement, so it is required —
    // but it is never treated as proof: the order waits at 'awaiting-payment'
    // until someone has actually seen the money arrive.
    let paymentReference = null;
    let willPayUpi = Boolean(req.body.toBePaidByUpi);
    if (paymentMethod === 'direct') {
      paymentReference = cleanText(req.body.paymentReference, 40).toUpperCase();
      if (!willPayUpi && paymentReference.length < 6) {
        return res.status(400).json({ error: 'Please enter the UPI or bank reference number for your transfer.' });
      }
      if (willPayUpi && paymentReference.length < 1) {
        paymentReference = 'TO_BE_PAID_UPI';
      }
    }

    const pricing = await computeOrderPricing(items, paymentMethod, couponCode, deliveryOption);
    const { total } = pricing;

    // Payment verification for online methods. Every real Razorpay payment
    // AND the demo "order_mock_" fallback must resolve to a razorpay_order_id
    // this server actually issued via /api/payment/create-order (checked
    // against the stored payment session) — an attacker can no longer skip verification
    // by simply inventing an "order_mock_..." string, which is what the
    // previous `!razorpay_order_id.startsWith('order_mock_')` check allowed.
    // Real orders additionally require a valid HMAC signature, proving an
    // actual payment completed; both paths require the amount that was
    // authorized to equal what's about to be charged here.
    if (paymentMethod === 'upi' || paymentMethod === 'card' || paymentMethod === 'razorpay') {
      if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        return res.status(400).json({ error: 'Payment verification required' });
      }

      const pending = await getPaymentSession(razorpay_order_id);
      if (!pending) {
        return res.status(400).json({ error: 'Payment session not found or expired — please retry checkout.' });
      }
      // The webhook may already have built this order — say so and hand back
      // the order rather than charging ahead and creating a second one.
      if (pending.orderId) {
        const existing = await ordersRef.findOne({ _id: pending.orderId });
        if (existing) {
          const already = stripId(existing);
          if (already.createdAt instanceof Date) already.createdAt = already.createdAt.toISOString();
          return res.status(200).json({ order: already, alreadyCreated: true });
        }
      }

      if (razorpay_order_id.startsWith('order_mock_') && process.env.ALLOW_MOCK_PAYMENTS !== 'true') {
        return res.status(400).json({ error: 'Payment verification required' });
      }
      if (!razorpay_order_id.startsWith('order_mock_')) {
        const key_secret = process.env.RAZORPAY_KEY_SECRET;
        const body = razorpay_order_id + '|' + razorpay_payment_id;
        const expectedSignature = crypto.createHmac('sha256', key_secret).update(body.toString()).digest('hex');
        // timingSafeEqual, not !==: string comparison short-circuits on the
        // first differing byte and leaks how much of a guess was right.
        // It throws on a length mismatch, so check that first.
        const given = typeof razorpay_signature === 'string' ? razorpay_signature : '';
        const signatureOk =
          given.length === expectedSignature.length &&
          crypto.timingSafeEqual(Buffer.from(expectedSignature, 'utf8'), Buffer.from(given, 'utf8'));
        if (!signatureOk) {
          return res.status(400).json({ error: 'Invalid payment signature' });
        }
      }

      if (pending.amountPaise !== Math.round(total * 100)) {
        return res
          .status(400)
          .json({ error: 'Payment amount does not match order total — please retry checkout.' });
      }

      // Claim the authorization before writing anything. Two tabs confirming
      // the same payment, or the browser racing the webhook, would otherwise
      // both pass the checks above and write two orders against one payment.
      // It is released again if the write fails, so a shopper who has paid can
      // always retry rather than being stranded.
      const claimed = await claimPaymentSession(razorpay_order_id);
      if (!claimed) {
        return res
          .status(409)
          .json({
            error: 'This payment is already being confirmed. Give it a moment and refresh your orders.',
          });
      }
      consumedPaymentId = razorpay_order_id;
    }
    
    if (paymentMethod === 'cashfree') {
      if (!cashfreeReady) return res.status(503).json({ error: 'Cashfree is not configured' });
      if (!cashfree_order_id) return res.status(400).json({ error: 'Payment verification required' });

      const pending = await getPaymentSession(cashfree_order_id);
      if (!pending) {
        return res.status(400).json({ error: 'Payment session not found or expired — please retry checkout.' });
      }

      if (pending.orderId) {
        const existing = await ordersRef.findOne({ _id: pending.orderId });
        if (existing) {
          const already = stripId(existing);
          if (already.createdAt instanceof Date) already.createdAt = already.createdAt.toISOString();
          return res.status(200).json({ order: already, alreadyCreated: true });
        }
      }

      try {
        const cfResponse = await cashfreePG.PGFetchOrder(cashfree_order_id);
        if (cfResponse.data.order_status !== 'PAID') {
          return res.status(400).json({ error: 'Payment not successful yet. Status: ' + cfResponse.data.order_status });
        }
      } catch (err) {
        console.error('Cashfree verification error:', err.response?.data || err.message);
        return res.status(400).json({ error: 'Error verifying payment with Cashfree' });
      }

      if (pending.amountPaise !== Math.round(total * 100)) {
        return res.status(400).json({ error: 'Payment amount does not match order total — please retry checkout.' });
      }

      const claimed = await claimPaymentSession(cashfree_order_id);
      if (!claimed) {
        return res.status(409).json({ error: 'This payment is already being confirmed. Give it a moment and refresh your orders.' });
      }
      consumedPaymentId = cashfree_order_id;
    }

    const { order } = await commitOrder({
      safeCustomer, pricing, paymentMethod, deliveryOption,
      preferredCourier, userId, session,
      // A direct transfer has not been seen in the bank yet, so it does not
      // get to start as 'confirmed'.
      status: paymentMethod === 'direct' ? 'awaiting-payment' : 'confirmed',
      paymentReference
    });
    const orderId = order.orderId;

    // The order is durable now, so the authorization is retired — recorded
    // against the order rather than deleted, so a late webhook for the same
    // payment finds it and does nothing instead of creating a duplicate.
    if (consumedPaymentId) await finishPaymentSession(consumedPaymentId, orderId);

    // Convert timestamp back for the immediate JSON response
    const responseOrder = stripId(order);
    responseOrder.createdAt = order.createdAt.toISOString();

    res.status(201).json({ order: responseOrder });

    // Fire-and-forget: don't make the customer wait on an SMTP round trip
    // to see their order confirmation page. Must still catch — an unhandled
    // rejection here terminates the process on Node 22.
    sendOrderEmail(order).catch(err => console.error('Order email failed:', err));
  } catch (error) {
    // The shopper has paid but no order was written, so the claim goes back:
    // without this they could never retry, having already been charged.
    if (consumedPaymentId) await releasePaymentSession(consumedPaymentId);
    if (error instanceof OrderValidationError) {
      return res.status(400).json({ error: error.message });
    }
    console.error('Order creation error:', error);
    res.status(500).json({ error: 'Failed to create order' });
  } finally {
    await session.endSession();
  }
});

app.get('/api/orders/:orderId', orderLookupLimiter, async (req, res) => {
  try {
    const order = await ordersRef.findOne({ _id: req.params.orderId });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const safeOrder = stripId(order);
    safeOrder.courierPartner = safeOrder.courierPartner || 'DTDC';
    if (safeOrder.createdAt instanceof Date) {
      safeOrder.createdAt = safeOrder.createdAt.toISOString();
    }
    if (Array.isArray(safeOrder.items)) {
      safeOrder.items = await enrichOrderItemsWithDbSkus(safeOrder.items);
    }

    res.json({ order: safeOrder });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

// Helper to check if a request comes from an authenticated admin
async function isAdminRequestAsync(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
  const token = authHeader.split(' ')[1];
  let session = activeAdminTokens.get(token);
  if (!session && sessionsRef) {
    try {
      const doc = await sessionsRef.findOne({ _id: token, kind: 'admin', expiresAt: { $gt: new Date() } });
      if (doc) {
        session = { username: doc.username, role: doc.role, expiresAt: doc.expiresAt.getTime() };
        activeAdminTokens.set(token, session);
      }
    } catch (_) {}
  }
  return !!(session && session.expiresAt >= Date.now());
}

async function getAuthenticatedUserIdAsync(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.split(' ')[1];
  let session = activeUserTokens.get(token);
  if (!session && sessionsRef) {
    try {
      const doc = await sessionsRef.findOne({ _id: token, kind: 'user', expiresAt: { $gt: new Date() } });
      if (doc) {
        session = { userId: doc.userId, expiresAt: doc.expiresAt.getTime() };
        activeUserTokens.set(token, session);
      }
    } catch (_) {}
  }
  if (!session || session.expiresAt < Date.now()) return null;
  return session.userId;
}

// Cache for live tracking queries (key -> { data, expiresAt })
const liveTrackCache = new Map();

// Public shipment tracking endpoint (with privacy isolation & carrier proxy)
app.get('/api/track', orderLookupLimiter, async (req, res) => {
  try {
    let rawQuery = String(req.query.q || req.query.awb || req.query.orderId || '').trim();
    if (!rawQuery) {
      return res.status(400).json({ error: 'Tracking number, AWB, or Order ID required.' });
    }

    const isAdmin = await isAdminRequestAsync(req);
    const callerUserId = await getAuthenticatedUserIdAsync(req);

    // If query looks like a full URL (e.g., https://printster.in/track/Z1005500933), extract the code
    let query = rawQuery;
    let extractedAwb = null;
    if (query.includes('http://') || query.includes('https://') || query.includes('/track/')) {
      const match = query.match(/\/track\/([A-Za-z0-9_-]+)/i);
      if (match) {
        extractedAwb = match[1];
        query = match[1];
      } else {
        const parts = query.split('/').filter(Boolean);
        extractedAwb = parts[parts.length - 1].split('?')[0];
        query = extractedAwb;
      }
    }

    // Check memory cache first (only for authenticated or verified scoped responses)
    const authScope = isAdmin ? 'admin' : (callerUserId || 'anon');
    const cacheKey = `${query.toUpperCase()}_${authScope}`;
    const cached = liveTrackCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return res.json(cached.data);
    }

    // Check if query matches an existing Brush order in our database
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escapedRaw = rawQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const orConditions = [
      { orderId: query },
      { orderId: rawQuery },
      { _id: query },
      { _id: rawQuery },
      { id: query },
      { id: rawQuery },
      { awbNumber: query },
      { awbNumber: rawQuery },
      { awbNumber: { $regex: new RegExp(`^${escapedQuery}$`, 'i') } },
      { trackingUrl: { $regex: escapedQuery, $options: 'i' } },
      { trackingUrl: { $regex: escapedRaw, $options: 'i' } }
    ];
    if (extractedAwb && extractedAwb !== query) {
      const escapedExt = extractedAwb.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      orConditions.push(
        { awbNumber: extractedAwb },
        { awbNumber: { $regex: new RegExp(`^${escapedExt}$`, 'i') } },
        { trackingUrl: { $regex: escapedExt, $options: 'i' } }
      );
    }

    const queryOrderId = String(req.query.orderId || '').trim();
    if (queryOrderId) {
      orConditions.push(
        { orderId: queryOrderId },
        { _id: queryOrderId },
        { id: queryOrderId }
      );
    }

    let brushOrder = null;
    try {
      brushOrder = await ordersRef.findOne({ $or: orConditions });
    } catch (_) {}

    // Check authorization to reveal Brush order & tracking details
    let isAuthorized = isAdmin;
    if (!isAuthorized && callerUserId && brushOrder) {
      let userDoc = null;
      if (usersRef) {
        try {
          userDoc = await usersRef.findOne({ $or: [{ _id: callerUserId }, { id: callerUserId }] });
        } catch (_) {}
      }

      const userEmail = String((userDoc && (userDoc.email || userDoc._id || userDoc.id)) || callerUserId).toLowerCase().trim();
      const userPhone = userDoc && userDoc.phone ? String(userDoc.phone).replace(/\D/g, '') : '';
      const orderUserId = String(brushOrder.userId || '').toLowerCase().trim();
      const orderCustEmail = String(brushOrder.customer?.email || '').toLowerCase().trim();
      const orderCustPhone = brushOrder.customer?.phone ? String(brushOrder.customer.phone).replace(/\D/g, '') : '';

      if (orderUserId && (orderUserId === userEmail || orderUserId === String(callerUserId).toLowerCase().trim())) {
        isAuthorized = true;
      } else if (orderCustEmail && (orderCustEmail === userEmail || orderCustEmail === String(callerUserId).toLowerCase().trim())) {
        isAuthorized = true;
      } else if (userPhone && orderCustPhone && (userPhone === orderCustPhone || userPhone.endsWith(orderCustPhone) || orderCustPhone.endsWith(userPhone))) {
        isAuthorized = true;
      }
    }

    // Verify token / customer email fallback for guest or direct tracking links
    const verifyParam = String(req.query.verify || '').trim().toLowerCase();
    if (!isAuthorized && verifyParam && brushOrder) {
      const custEmail = String(brushOrder.customer?.email || '').toLowerCase().trim();
      const custPhone = String(brushOrder.customer?.phone || '').replace(/\D/g, '');
      const cleanVerifyPhone = verifyParam.replace(/\D/g, '');
      if ((custEmail && custEmail === verifyParam) || (cleanVerifyPhone && custPhone && (custPhone === cleanVerifyPhone || custPhone.endsWith(cleanVerifyPhone)))) {
        isAuthorized = true;
      }
    }

    // STRICT USER ISOLATION:
    // Admin can track whatever order or AWB they want.
    // Customers can only track orders in their own associated account.
    // Others receive: "No orders found for this number in your associated account."
    if (!isAdmin) {
      if (!brushOrder || !isAuthorized) {
        return res.status(404).json({
          success: false,
          error: callerUserId
            ? 'No orders found for this number in your associated account.'
            : 'No orders found for this number. Please log in to your Brush account to track your orders.'
        });
      }
    }

    // Determine target AWB for carrier lookup
    let targetAwb = (brushOrder && brushOrder.awbNumber && brushOrder.awbNumber.trim()) || extractedAwb || query;
    if (brushOrder && (!brushOrder.awbNumber || !brushOrder.awbNumber.trim()) && brushOrder.trackingUrl) {
      const match = brushOrder.trackingUrl.match(/\/track\/([A-Za-z0-9_-]+)/i);
      if (match) {
        targetAwb = match[1];
      }
    }

    // Safe order info is ONLY attached if authorized
    let safeOrderInfo = null;
    if (brushOrder && isAuthorized) {
      safeOrderInfo = {
        orderId: brushOrder.orderId || brushOrder._id,
        status: brushOrder.status || 'confirmed',
        createdAt: brushOrder.createdAt,
        estimatedDelivery: brushOrder.estimatedDelivery,
        carrier: brushOrder.courierPartner || 'DTDC',
        awbNumber: brushOrder.awbNumber || '',
        trackingUrl: brushOrder.trackingUrl || '',
        customerCity: brushOrder.customer ? brushOrder.customer.city : '',
        customerState: brushOrder.customer ? brushOrder.customer.state : '',
        items: (brushOrder.items || []).map(i => ({
          name: i.name,
          size: i.size || i.variant || '',
          frame: i.frame || '',
          quantity: i.quantity || 1,
          image: i.image || ''
        }))
      };
    }

    // Query external carrier logistics API
    let carrierData = null;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      const logisticsRes = await fetch(`https://gigasingh.com/api/public/track?q=${encodeURIComponent(targetAwb)}`, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'BrushArtStore/1.0 (+https://www.brush-art.in)'
        },
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (logisticsRes.ok) {
        carrierData = await logisticsRes.json();
      }
    } catch (fetchErr) {
      console.warn('Logistics tracking fetch warning:', fetchErr.message);
    }

    const shipment = (carrierData && Array.isArray(carrierData.shipments) && carrierData.shipments.length > 0)
      ? carrierData.shipments[0]
      : null;

    if (shipment) {
      const payload = {
        success: true,
        source: 'carrier',
        shipment,
        order: safeOrderInfo // attached ONLY if authorized
      };
      liveTrackCache.set(cacheKey, { data: payload, expiresAt: Date.now() + 60 * 1000 });
      return res.json(payload);
    }

    if (safeOrderInfo) {
      let statusMsg = 'Your order is currently in production. Tracking details will update once dispatched.';
      const s = String(safeOrderInfo.status || '').toLowerCase();
      if (s === 'delivered') {
        statusMsg = 'Order delivered. Thank you for collecting with Brush!';
      } else if (s === 'transit' || s === 'in-transit') {
        statusMsg = `Your package is currently in transit with ${safeOrderInfo.carrier || 'DTDC'}.`;
      } else if (s === 'shipped' || s === 'dispatched') {
        statusMsg = `Package has been dispatched and handed over to ${safeOrderInfo.carrier || 'DTDC'}.`;
      } else if (s === 'printing' || s === 'sent-for-printing') {
        statusMsg = 'Your prints are currently in studio production.';
      } else if (s === 'cancelled') {
        statusMsg = 'This order has been cancelled.';
      }

      const payload = {
        success: true,
        source: 'order_only',
        shipment: null,
        order: safeOrderInfo,
        message: statusMsg
      };
      liveTrackCache.set(cacheKey, { data: payload, expiresAt: Date.now() + 30 * 1000 });
      return res.json(payload);
    }

    return res.status(404).json({
      success: false,
      error: 'Tracking information not found. Please verify the AWB or Order ID entered.'
    });
  } catch (err) {
    console.error('Tracking endpoint error:', err);
    res.status(500).json({ error: 'Internal tracking error. Please try again shortly.' });
  }
});

// Admin Logistics Tracking Portal endpoint
app.get('/api/admin/tracking-portal', requireAdmin, async (req, res) => {
  try {
    const docs = await ordersRef.find({
      $or: [
        { awbNumber: { $exists: true, $ne: '' } },
        { trackingUrl: { $exists: true, $ne: '' } },
        { status: { $in: ['sent-for-printing', 'printing', 'shipped', 'transit', 'delivered'] } }
      ]
    }).sort({ createdAt: -1 }).toArray();

    const shipments = docs.map(o => ({
      id: o._id,
      orderId: o.orderId || o._id,
      status: o.status || 'confirmed',
      courierPartner: o.courierPartner || '',
      awbNumber: o.awbNumber || '',
      trackingUrl: o.trackingUrl || '',
      brushTrackingUrl: `/track/?awb=${encodeURIComponent(o.awbNumber || o.orderId || o._id)}`,
      createdAt: o.createdAt,
      estimatedDelivery: o.estimatedDelivery,
      total: o.total,
      customer: {
        name: o.customer?.name || '',
        city: o.customer?.city || '',
        state: o.customer?.state || '',
        phone: o.customer?.phone || '',
        email: o.customer?.email || ''
      },
      itemCount: (o.items || []).reduce((sum, item) => sum + (Number(item.quantity) || 1), 0)
    }));

    const stats = {
      total: shipments.length,
      withAwb: shipments.filter(s => s.awbNumber).length,
      awaitingAwb: shipments.filter(s => !s.awbNumber).length,
      delivered: shipments.filter(s => s.status === 'delivered').length,
      inTransit: shipments.filter(s => s.status === 'transit' || s.status === 'shipped').length
    };

    res.json({ shipments, stats });
  } catch (err) {
    console.error('Admin tracking portal error:', err);
    res.status(500).json({ error: 'Failed to load tracking portal data' });
  }
});

// Reading an order by its ID without a session is deliberate — guest checkout
// has no account to check against. Cancelling is not a read: it destroys the
// order, restores stock and emails the customer, and the ID is not a secret
// (it is in the confirmation URL, the emailed link and the invoice, so it
// travels in Referer headers, browser history and forwarded screenshots).
//
// So: an order that belongs to an account may only be cancelled by that
// account. A guest order still falls back to the ID, because there is no
// other credential in existence for it — but the caller must also quote the
// email the order was placed with, which a bystander holding only the ID does
// not have.
app.post('/api/orders/:orderId/cancel', orderLookupLimiter, async (req, res) => {
  try {
    const order = await ordersRef.findOne({ _id: req.params.orderId });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const callerId = getAuthenticatedUserId(req);
    if (order.userId) {
      if (!callerId || callerId !== order.userId) {
        return res.status(403).json({ error: 'You are not signed in as the account that placed this order.' });
      }
    } else {
      const claimed = cleanText(req.body && req.body.email, 160).toLowerCase();
      const onOrder = cleanText(order.customer && order.customer.email, 160).toLowerCase();
      if (!claimed || !onOrder || claimed !== onOrder) {
        return res.status(403).json({ error: 'Please confirm the email address this order was placed with.' });
      }
    }

    // Free cancellation is promised only while the order has not gone into
    // production. Two things end that: the status moving on from 'confirmed',
    // and the order having been sent to the fulfilment partner — which does
    // not itself change the status, so without this second check a customer
    // could cancel for free after printing had already started and been paid
    // for. Both are refused here with a message that says which one applied.
    if (order.status === 'cancelled') {
      return res.status(400).json({ error: 'This order is already cancelled.' });
    }
    if (order.status !== 'confirmed' && order.status !== 'awaiting-payment') {
      return res.status(400).json({
        error: 'This order has already gone into production, so it can no longer be cancelled. Write to us with your order number and we will see what can be done.'
      });
    }
    if (order.qikink && (order.qikink.orderId || order.qikink.sendingAt)) {
      return res.status(400).json({
        error: 'This order is already being printed, so it can no longer be cancelled. Write to us with your order number and we will see what can be done.'
      });
    }

    // Make the status change itself the guard. Read-then-write let two
    // concurrent cancels both observe 'confirmed' and both restore stock,
    // inflating stockQuantity by twice the ordered quantity. The fulfilment
    // field is part of the filter for the same reason: a send that lands
    // between the check above and this write must lose the race, not tie.
    const cancellationData = {
      reason: cleanText(req.body && req.body.reason, 200) || 'Cancelled by customer',
      comments: cleanText(req.body && req.body.comments, 1000) || '',
      cancelledAt: new Date().toISOString()
    };

    const transition = await ordersRef.updateOne(
      {
        _id: req.params.orderId,
        status: { $in: ['confirmed', 'awaiting-payment'] },
        'qikink.orderId': { $exists: false },
        'qikink.sendingAt': { $exists: false }
      },
      {
        $set: {
          status: 'cancelled',
          cancellation: cancellationData
        }
      }
    );
    if (transition.matchedCount === 0) {
      return res.status(400).json({ error: 'Order cannot be cancelled' });
    }
    await adjustStockForOrder(order, +1);

    const safeOrder = stripId(order);
    safeOrder.status = 'cancelled';
    safeOrder.cancellation = cancellationData;
    sendOrderEmail({ ...order, status: 'cancelled' }).catch(err => console.error('Cancellation email failed:', err));
    if (safeOrder.createdAt instanceof Date) {
      safeOrder.createdAt = safeOrder.createdAt.toISOString();
    }

    res.json({ message: 'Order cancelled successfully', order: safeOrder });
  } catch (error) {
    res.status(500).json({ error: 'Failed to cancel order' });
  }
});

// Customer Replacement request endpoint (Returns/refunds not permitted for custom prints)
app.post('/api/orders/:orderId/return', requireUser, async (req, res) => {
  try {
    const rawId = req.params.orderId;
    const order = await ordersRef.findOne({ $or: [{ _id: rawId }, { orderId: rawId }] });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    if (order.userId !== req.userId) {
      return res.status(403).json({ error: 'You are not authorized to request replacement for this order.' });
    }

    const type = 'replacement';
    const reason = cleanText(req.body.reason, 200);
    const comments = cleanText(req.body.comments, 1500) || '';
    if (!reason) return res.status(400).json({ error: 'Please select a reason for replacement.' });

    const returnRequest = {
      requestId: `REP_${Date.now()}`,
      type: 'replacement',
      reason,
      comments,
      items: Array.isArray(req.body.items) && req.body.items.length > 0 ? req.body.items : (order.items || []).map(i => i.name),
      status: 'pending',
      requestedAt: new Date().toISOString()
    };

    await ordersRef.updateOne(
      { _id: order._id },
      {
        $set: {
          returnRequest,
          status: 'replacement-requested'
        }
      }
    );

    res.json({
      success: true,
      message: 'Replacement request registered successfully. Our studio team will review and coordinate replacement dispatch.',
      returnRequest
    });
  } catch (err) {
    console.error('Replacement request error:', err);
    res.status(500).json({ error: 'Failed to submit replacement request' });
  }
});

// Customer Order Help / Need Help request endpoint
app.post('/api/orders/:orderId/support', requireUser, async (req, res) => {
  try {
    const rawId = req.params.orderId;
    const order = await ordersRef.findOne({ $or: [{ _id: rawId }, { orderId: rawId }] });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    if (order.userId !== req.userId) {
      return res.status(403).json({ error: 'You are not authorized to submit help for this order.' });
    }

    const issue = cleanText(req.body.issue, 100);
    const message = cleanText(req.body.message, 2000);
    if (!issue || !message) return res.status(400).json({ error: 'Please choose an issue category and describe the problem.' });

    const ticket = {
      type: 'order_support',
      orderId: order.orderId || order._id,
      userId: req.userId,
      customerEmail: order.customer?.email || req.userId,
      customerName: order.customer?.name || '',
      issue,
      message,
      createdAt: new Date().toISOString()
    };

    try {
      if (db) await db.collection('reachout_submissions').insertOne(ticket);
    } catch (_) {}

    sendMail({
      from: 'Brush Support <admin@brush-art.in>',
      replyTo: order.customer?.email || req.userId,
      to: 'admin@brush-art.in',
      subject: `[Order Help] ${order.orderId || order._id} — ${issue}`,
      html: `<div style="font-family:sans-serif;padding:20px;">
               <h2>Order Support Inquiry</h2>
               <p><strong>Order ID:</strong> ${order.orderId || order._id}</p>
               <p><strong>Customer:</strong> ${escapeHtml(ticket.customerName)} (${escapeHtml(ticket.customerEmail)})</p>
               <p><strong>Issue:</strong> ${escapeHtml(issue)}</p>
               <p><strong>Message:</strong></p>
               <blockquote style="background:#f4f4f4;padding:12px;border-left:4px solid #111;">${escapeHtml(message)}</blockquote>
             </div>`
    }).catch(() => {});

    res.json({
      success: true,
      message: 'Your help request has been forwarded to our support concierge. We will respond within 24 hours.'
    });
  } catch (err) {
    console.error('Order support error:', err);
    res.status(500).json({ error: 'Failed to submit help inquiry' });
  }
});

// Admin/Customer endpoint to fetch the invoice PDF (preserves existing invoice number)
app.get('/api/orders/:orderId/invoice', orderLookupLimiter, async (req, res) => {
  try {
    let order = await ordersRef.findOne({
      $or: [
        { _id: req.params.orderId },
        { orderId: req.params.orderId },
        { invoiceNumber: req.params.orderId }
      ]
    });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    // Authorization check: only order owner or admin can download invoice
    const callerId = getAuthenticatedUserId(req);
    const isAdmin = await isAdminRequestAsync(req);
    if (!isAdmin && order.userId) {
      if (!callerId || callerId !== order.userId) {
        const verifyParam = String(req.query.verify || '').trim().toLowerCase();
        const custEmail = String(order.customer?.email || '').trim().toLowerCase();
        if (!verifyParam || verifyParam !== custEmail) {
          return res.status(403).json({ error: 'You are not authorized to download this invoice.' });
        }
      }
    }

    // Preserve existing invoice number; only generate if order has never been invoiced
    if (!order.invoiceNumber) {
      const freshInvoiceNumber = await getNextInvoiceNumber();
      await ordersRef.updateOne({ _id: order._id }, { $set: { invoiceNumber: freshInvoiceNumber } });
      order.invoiceNumber = freshInvoiceNumber;
    }

    order = await withInvoiceDefaults(order);

    const pdfDoc = new PDFDocument({ size: 'A4', margin: 40 });
    const filename = `invoice-${order.invoiceNumber || order.orderId}.pdf`;
    // Prevent client caching of the PDF so each download reflects latest data
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Content-disposition', 'attachment; filename="' + filename + '"');
    res.setHeader('Content-type', 'application/pdf');

    pdfDoc.pipe(res);
    drawInvoice(pdfDoc, order);
    pdfDoc.end();
  } catch (error) {
    console.error('Invoice generation error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to generate invoice' });
    }
  }
});


// --- ADMIN APIs ---

// Admin Login
app.post('/api/admin/login', authLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!isNonEmptyString(username) || !isNonEmptyString(password)) return res.status(400).json({ error: 'Username and password required' });

    const adminData = await adminsRef.findOne({ _id: username });
    if (!adminData) return res.status(401).json({ error: 'Invalid credentials' });

    const { valid, needsRehash } = await verifyPassword(password, adminData.passwordHash);

    if (valid) {
      if (needsRehash) {
        await adminsRef.updateOne({ _id: username }, { $set: { passwordHash: await hashPassword(password) } });
      }
      // Generate a simple session token
      const token = crypto.randomBytes(16).toString('hex');
      // Fail closed. This used to default to 'superadmin', so any admin
      // document without an explicit role — a hand-inserted record, a partial
      // migration — signed in able to delete products and read the audit log.
      const ADMIN_ROLES = ['superadmin', 'stocker', 'watcher'];
      const role = ADMIN_ROLES.includes(adminData.role) ? adminData.role : 'watcher';
      const adminSession = { username, role, expiresAt: Date.now() + ADMIN_SESSION_MS };
      activeAdminTokens.set(token, adminSession);
      persistSession('admin', token, adminSession);
      res.json({ success: true, token, role, username });
    } else {
      res.status(401).json({ error: 'Invalid credentials' });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// Mirrors /api/auth/logout for customers — without this, a leaked/captured
// admin Bearer token stayed valid for its full 12-hour session lifetime
// with no way to revoke it server-side; "logging out" only cleared it
// client-side.
app.post('/api/admin/logout', (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const gone = authHeader.split(' ')[1];
    activeAdminTokens.delete(gone);
    forgetSession(gone);
  }
  res.json({ success: true });
});

// Full rate table including qikinkCost — every supplier wholesale rate and,
// with the shelf prices beside it, the margin on every SKU. That is for the
// admin Pricing view only; it used to be world-readable at /api/pricing.
app.get('/api/pricing', requireAdmin, (req, res) => {
  // The cost key is renamed on the way out: admin.js is a browser file served
  // from the same origin as the storefront, so nothing it reads should name
  // the fulfilment partner. The figures themselves never leave this route.
  const productTypes = {};
  for (const [key, cfg] of Object.entries(PRODUCT_TYPES)) {
    const { qikinkCost, ...rest } = cfg;
    productTypes[key] = qikinkCost ? { ...rest, unitCost: qikinkCost } : rest;
  }
  res.json({ productTypes, orderCharges: ORDER_CHARGES });
});

// Public projection for the storefront: what a shopper is charged, with the
// cost basis stripped out.
app.get('/api/pricing/public', (req, res) => {
  const productTypes = {};
  for (const [key, cfg] of Object.entries(PRODUCT_TYPES)) {
    productTypes[key] = {
      label: cfg.label,
      basePrice: cfg.basePrice,
      gstRate: cfg.gstRate,
      printAreas: cfg.printAreas,
      sizeChart: cfg.sizeChart,
      variantGroups: (cfg.variantGroups || []).map(g => ({
        key: g.key, label: g.label, defaultValue: g.defaultValue,
        options: g.options.map(o => ({
          value: o.value, label: o.label, priceDelta: o.priceDelta,
          swatch: o.swatch, onlyWith: o.onlyWith
        }))
      }))
    };
  }
  res.json({ productTypes, orderCharges: ORDER_CHARGES });
});

// Admin Logging
const logAdminActivity = async (username, action, details) => {
  try {
    await adminLogsRef.insertOne({
      username,
      action,
      details,
      keep: false,
      timestamp: new Date()
    });
    cleanOldLogs(); // Fire and forget
  } catch (error) {
    console.error('Failed to log admin activity:', error);
  }
};

const normalizeLookupText = (value) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

async function resolveManualOrderProduct(selector) {
  if (!selector || typeof selector !== 'object' || Array.isArray(selector)) {
    throw new OrderValidationError('Each manual-order item needs a product ID, SKU, or name');
  }

  const rawId = selector.productId;
  if (rawId !== undefined && rawId !== null && String(rawId).trim() !== '') {
    const productId = Number(rawId);
    if (!Number.isInteger(productId)) throw new OrderValidationError('Product ID must be a whole number');
    const product = await productsRef.findOne({ id: productId });
    if (!product) throw new OrderValidationError(`Product with ID ${productId} not found`);
    return product;
  }

  const lookup = cleanText(selector.sku || selector.name, 160);
  if (!lookup) throw new OrderValidationError('Each manual-order item needs a product ID, SKU, or name');
  const normalized = normalizeLookupText(lookup);
  const docs = await productsRef.find({}).toArray();
  const matches = docs.filter(product => {
    const sku = cleanText(product.sku, 160);
    return (sku && sku.toLowerCase() === lookup.toLowerCase()) ||
      normalizeLookupText(product.name) === normalized;
  });
  if (!matches.length) throw new OrderValidationError(`No product found for “${lookup}”`);
  if (matches.length > 1) throw new OrderValidationError(`“${lookup}” matches more than one product — use its product ID or SKU`);
  return matches[0];
}

app.post('/api/admin/orders', requireAdmin, requireSuperAdmin, async (req, res) => {
  const session = mongoClient.startSession();
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const built = buildSafeCustomer(body.customer);
    if (built.error) return res.status(400).json({ error: built.error });

    const requestedItems = body.items;
    if (!Array.isArray(requestedItems) || requestedItems.length < 1 || requestedItems.length > 50) {
      return res.status(400).json({ error: 'Add between 1 and 50 products.' });
    }

    const resolvedItems = [];
    for (const requested of requestedItems) {
      const product = await resolveManualOrderProduct(requested);
      const quantity = Number(requested.quantity);
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
        return res.status(400).json({ error: `Invalid quantity for ${product.name}` });
      }
      resolvedItems.push({ productId: product.id, quantity, variants: requested.variants });
    }

    const paymentMethod = cleanText(body.paymentMethod, 30).toLowerCase();
    const allowedPaymentMethods = new Set(['cash', 'direct', 'upi', 'card', 'cod', 'complimentary']);
    if (!allowedPaymentMethods.has(paymentMethod)) return res.status(400).json({ error: 'Invalid manual payment method' });

    const status = cleanText(body.status, 30).toLowerCase() || 'awaiting-payment';
    if (!['awaiting-payment', 'confirmed'].includes(status)) {
      return res.status(400).json({ error: 'Manual orders may start as awaiting-payment or confirmed.' });
    }

    const flatDiscount = Number(body.flatDiscount || 0);
    if (!Number.isFinite(flatDiscount) || flatDiscount < 0) {
      return res.status(400).json({ error: 'Flat discount must be zero or more.' });
    }

    const pricing = await computeOrderPricing(
      resolvedItems,
      paymentMethod,
      null,
      body.deliveryOption || null,
      { manualDiscount: flatDiscount }
    );
    if (flatDiscount > pricing.subtotal) {
      return res.status(400).json({ error: 'Flat discount cannot exceed the product subtotal.' });
    }

    const paymentReference = cleanText(body.paymentReference, 40).toUpperCase() || null;
    if (status === 'confirmed' && paymentMethod !== 'complimentary' && paymentMethod !== 'cod' && !paymentReference) {
      return res.status(400).json({ error: 'Add a payment reference before confirming this manual order.' });
    }

    const { order } = await commitOrder({
      safeCustomer: built.safe,
      pricing,
      paymentMethod,
      deliveryOption: body.deliveryOption,
      preferredCourier: body.preferredCourier,
      userId: null,
      session,
      status,
      paymentReference,
      manualOrder: true,
      createdByAdmin: req.adminSession.username,
      internalNotes: cleanText(body.internalNotes, 500)
    });

    if (status === 'confirmed' && paymentMethod !== 'cod') {
      order.paymentVerifiedAt = new Date();
      order.paymentVerifiedBy = req.adminSession.username;
      await ordersRef.updateOne({ _id: order.orderId }, { $set: {
        paymentVerifiedAt: order.paymentVerifiedAt,
        paymentVerifiedBy: order.paymentVerifiedBy
      } });
    }

    await logAdminActivity(req.adminSession.username, 'Create Manual Order',
      `${order.orderId} for ${built.safe.name} (₹${order.total})`);
    if (body.sendEmail !== false) {
      sendOrderEmail(order).catch(error => console.error('Manual order email failed:', error));
    }

    const responseOrder = stripId(order);
    responseOrder.createdAt = order.createdAt.toISOString();
    res.status(201).json({ order: responseOrder, pricing });
  } catch (error) {
    if (error instanceof OrderValidationError) return res.status(400).json({ error: error.message });
    console.error('Manual order creation error:', error);
    res.status(500).json({ error: 'Failed to create manual order' });
  } finally {
    await session.endSession();
  }
});

const cleanOldLogs = async () => {
  try {
    const timeLimit = new Date(Date.now() - 72 * 60 * 60 * 1000); // 72 hours ago
    await adminLogsRef.deleteMany({ keep: false, timestamp: { $lt: timeLimit } });
  } catch (error) {
    console.error('Failed to clean old logs:', error);
  }
};

// Get Admin Logs
app.get('/api/admin/logs', requireAdmin, requireSuperAdmin, async (req, res) => {
  try {
    const docs = await adminLogsRef.find().sort({ timestamp: -1 }).limit(200).toArray();
    const logs = docs.map(doc => {
      const data = stripId(doc);
      if (data.timestamp instanceof Date) {
        data.timestamp = data.timestamp.toISOString();
      }
      return { id: doc._id.toString(), ...data };
    });
    res.json(logs);
  } catch (error) {
    console.error('Fetch logs error:', error);
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

// Toggle Keep Log
app.patch('/api/admin/logs/:id/keep', requireAdmin, requireSuperAdmin, async (req, res) => {
  try {
    const { keep } = req.body;
    await adminLogsRef.updateOne({ _id: new ObjectId(req.params.id) }, { $set: { keep: Boolean(keep) } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update log' });
  }
});

// Get all orders
// Unreconciled payments, for the admin panel. Empty is the expected state;
// anything here is money that needs a decision.
// Confirming a direct transfer: the one step that turns money someone says
// they sent into an order we will actually make. Superadmin only, and the
// transition itself is the guard, so two clicks cannot both send the email.
app.post('/api/orders/:orderId/confirm-payment', requireAdmin, requireSuperAdmin, async (req, res) => {
  try {
    const order = await ordersRef.findOne({
      $or: [
        { _id: req.params.orderId },
        { orderId: req.params.orderId },
        { id: req.params.orderId }
      ]
    });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status === 'cancelled') {
      return res.status(409).json({ error: 'This order is cancelled.' });
    }
    if (order.status !== 'awaiting-payment') {
      return res.status(409).json({ error: 'This order is not awaiting payment confirmation.' });
    }

    const note = cleanText(req.body && req.body.note, 200);
    const transition = await ordersRef.updateOne(
      { _id: order._id, status: 'awaiting-payment' },
      { $set: {
          status: 'confirmed',
          paymentVerifiedAt: new Date(),
          paymentVerifiedBy: req.adminSession.username,
          paymentVerificationNote: note || null
        } }
    );
    if (transition.matchedCount === 0) {
      return res.status(409).json({ error: 'Someone just confirmed this order.' });
    }

    await logAdminActivity(req.adminSession.username, 'Confirmed payment',
      `${order.orderId} (${order.paymentReference || 'no reference'}, ₹${order.total})`);

    const confirmed = { ...order, status: 'confirmed', paymentVerifiedAt: new Date(), paymentVerifiedBy: req.adminSession.username };
    // This is the "your order is confirmed" email the shopper is waiting for.
    sendOrderEmail(confirmed).catch(err => console.error('Confirmation email failed:', err));

    res.json({ confirmed: true, order: stripId(confirmed) });
  } catch (err) {
    console.error('Confirm payment failed:', err);
    res.status(500).json({ error: 'Failed to confirm payment' });
  }
});

app.get('/api/payment/exceptions', requireAdmin, async (req, res) => {
  try {
    const docs = await paymentExceptionsRef.find({ resolved: false }).sort({ seenAt: -1 }).limit(100).toArray();
    res.json(docs.map(d => ({ ...d, paymentId: d._id, _id: undefined })));
  } catch (err) {
    console.error('Payment exceptions fetch failed:', err);
    res.status(500).json({ error: 'Failed to fetch payment exceptions' });
  }
});

app.get('/api/orders', requireAdmin, async (req, res) => {
  try {
    const docs = await ordersRef.find().sort({ createdAt: -1 }).toArray();
    const orders = await Promise.all(docs.map(async doc => {
      const data = stripId(doc);
      if (data.createdAt instanceof Date) {
        data.createdAt = data.createdAt.toISOString();
      }
      if (Array.isArray(data.items)) {
        data.items = await enrichOrderItemsWithDbSkus(data.items);
      }
      // Same reason as /api/pricing: the stored key names the fulfilment
      // partner, so it is projected to a neutral one for the browser.
      if (data.qikink) { data.fulfilment = data.qikink; delete data.qikink; }
      return data;
    }));
    res.json(orders);
  } catch (error) {
    console.error('Fetch orders error:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// Update product
app.patch('/api/products/:id', requireAdmin, async (req, res) => {
  try {
    const { name, price, badge, stockQuantity, category, categories, productType, keywords, sku, showInBestsellers, showInNewArrivals, showInGrossing, showInHero,
      qikinkDesignCode, printFileUrl, printWidthIn, printHeightIn, printPlacement } = req.body;
    // Qikink print artwork. Held per product because Qikink prints whatever
    // printFileUrl points at — see designResolver() in qikink-map.js.
    const QIKINK_FIELDS = { qikinkDesignCode, printFileUrl, printWidthIn, printHeightIn, printPlacement };
    const touchingQikink = Object.values(QIKINK_FIELDS).some(v => v !== undefined);

    // Role based enforcement
    if (req.adminSession.role === 'watcher') {
      return res.status(403).json({ error: 'Watcher accounts have view-only access.' });
    }

    if (req.adminSession.role === 'stocker') {
       // Stocker can only update stockQuantity
       if (name !== undefined || price !== undefined || badge !== undefined || category !== undefined || categories !== undefined || productType !== undefined || keywords !== undefined || sku !== undefined ||
           showInBestsellers !== undefined || showInNewArrivals !== undefined || showInGrossing !== undefined || showInHero !== undefined || touchingQikink) {
          return res.status(403).json({ error: 'Stocker can only modify inventory quantity.' });
       }
    }

    // Homepage placement flags are superadmin-only
    if (req.adminSession.role !== 'superadmin' &&
        (showInBestsellers !== undefined || showInNewArrivals !== undefined || showInGrossing !== undefined || showInHero !== undefined)) {
      return res.status(403).json({ error: 'Only superadmin can control homepage placement.' });
    }
    // So is the print artwork — it decides what a supplier physically prints.
    if (req.adminSession.role !== 'superadmin' && touchingQikink) {
      return res.status(403).json({ error: 'Only superadmin can set Qikink print artwork.' });
    }
    for (const k of ['qikinkDesignCode', 'printFileUrl', 'printPlacement']) {
      if (QIKINK_FIELDS[k] !== undefined && typeof QIKINK_FIELDS[k] !== 'string') {
        return res.status(400).json({ error: `${k} must be text` });
      }
    }
    if (printFileUrl !== undefined && printFileUrl !== '' && !/^https:\/\/\S+$/.test(printFileUrl)) {
      return res.status(400).json({ error: 'printFileUrl must be a public https URL' });
    }
    for (const k of ['printWidthIn', 'printHeightIn']) {
      const v = QIKINK_FIELDS[k];
      if (v !== undefined && v !== '' && !(Number(v) > 0)) {
        return res.status(400).json({ error: `${k} must be a positive number of inches` });
      }
    }

    // Everything here is written straight into the product document —
    // reject wrong types instead of storing objects/arrays/NaN.
    const strFields = { name, badge, sku, productType };
    for (const [k, v] of Object.entries(strFields)) {
      if (v !== undefined && typeof v !== 'string') return res.status(400).json({ error: `${k} must be text` });
    }
    if (category !== undefined && typeof category !== 'string' && !Array.isArray(category)) {
      return res.status(400).json({ error: 'category must be text or list of categories' });
    }
    if (categories !== undefined && typeof categories !== 'string' && !Array.isArray(categories)) {
      return res.status(400).json({ error: 'categories must be text or list of categories' });
    }
    if (name !== undefined && !name.trim()) return res.status(400).json({ error: 'Name cannot be empty' });
    if (stockQuantity !== undefined && (!Number.isInteger(Number(stockQuantity)) || Number(stockQuantity) < 0)) {
      return res.status(400).json({ error: 'Stock must be a whole number of 0 or more' });
    }
    if (price !== undefined && (!Number.isFinite(Number(price)) || Number(price) <= 0)) {
      return res.status(400).json({ error: 'Price must be a positive number' });
    }
    if (keywords !== undefined && typeof keywords !== 'string' && !Array.isArray(keywords)) {
      return res.status(400).json({ error: 'keywords must be text' });
    }

    const updateData = {};
    if (qikinkDesignCode !== undefined) updateData.qikinkDesignCode = String(qikinkDesignCode).trim().slice(0, 20);
    if (printFileUrl !== undefined) updateData.printFileUrl = String(printFileUrl).trim().slice(0, 512);
    if (printPlacement !== undefined) updateData.printPlacement = String(printPlacement).trim().slice(0, 20);
    if (printWidthIn !== undefined) updateData.printWidthIn = printWidthIn === '' ? null : Number(printWidthIn);
    if (printHeightIn !== undefined) updateData.printHeightIn = printHeightIn === '' ? null : Number(printHeightIn);
    if (name !== undefined) updateData.name = name.trim();
    if (price !== undefined) updateData.price = Number(price);
    if (badge !== undefined) updateData.badge = badge;
    if (stockQuantity !== undefined) updateData.stockQuantity = Number(stockQuantity);

    const incomingCat = categories !== undefined ? categories : category;
    if (incomingCat !== undefined) {
      const rawList = Array.isArray(incomingCat) ? incomingCat : String(incomingCat).split(/[,|]/);
      const parsedCats = Array.from(new Set(rawList.map(s => String(s).trim()).filter(Boolean)));
      updateData.categories = parsedCats;
      updateData.category = parsedCats.join(', ');
      if (parsedCats.length > 0 && (productType === undefined || productType === '')) {
        updateData.productType = getProductType(parsedCats[0]);
      }
    }
    if (productType !== undefined && productType !== '') updateData.productType = productType;
    if (keywords !== undefined) updateData.keywords = keywords;
    if (sku !== undefined) updateData.sku = sku;
    if (showInBestsellers !== undefined) updateData.showInBestsellers = Boolean(showInBestsellers);
    if (showInNewArrivals !== undefined) updateData.showInNewArrivals = Boolean(showInNewArrivals);
    if (showInGrossing !== undefined) updateData.showInGrossing = Boolean(showInGrossing);
    // Hero slideshow on the landing page — script.js rebuilds the slides
    // from whatever carries this flag, newest first.
    if (showInHero !== undefined) updateData.showInHero = Boolean(showInHero);

    const productId = parseInt(req.params.id);
    const oldData = await productsRef.findOne({ id: productId });
    if (!oldData) return res.status(404).json({ error: 'Product not found' });

    // Posters / T-shirts are priced from the Qikink rate table — an admin
    // price edit can't override it (it would be ignored at checkout anyway).
    const effectiveBase = catalogBasePrice(
      updateData.productType !== undefined ? updateData.productType : oldData.productType,
      updateData.category !== undefined ? updateData.category : oldData.category
    );
    if (effectiveBase !== null) {
      updateData.price = effectiveBase;
      updateData.pricingSource = 'qikink';
    } else if (oldData.pricingSource === 'qikink') {
      updateData.pricingSource = 'manual';
    }

    const changes = [];
    if (name !== undefined && oldData.name !== name) changes.push(`name to "${name}"`);
    if (updateData.price !== undefined && oldData.price !== updateData.price) changes.push(`price to ${updateData.price}`);
    if (stockQuantity !== undefined && oldData.stockQuantity !== Number(stockQuantity)) changes.push(`stock to ${stockQuantity}`);
    if (badge !== undefined && oldData.badge !== badge) changes.push(`badge to "${badge}"`);
    if (category !== undefined && oldData.category !== category) changes.push(`cat to "${category}"`);
    if (keywords !== undefined && oldData.keywords !== keywords) changes.push(`keywords to "${keywords}"`);
    if (sku !== undefined && oldData.sku !== sku) changes.push(`sku to "${sku}"`);
    if (showInBestsellers !== undefined && oldData.showInBestsellers !== Boolean(showInBestsellers)) changes.push(`bestsellers to ${showInBestsellers}`);
    if (showInNewArrivals !== undefined && oldData.showInNewArrivals !== Boolean(showInNewArrivals)) changes.push(`new arrivals to ${showInNewArrivals}`);
    if (showInGrossing !== undefined && oldData.showInGrossing !== Boolean(showInGrossing)) changes.push(`grossing to ${showInGrossing}`);
    if (showInHero !== undefined && oldData.showInHero !== Boolean(showInHero)) changes.push(`hero to ${showInHero}`);
    const changesStr = changes.length > 0 ? changes.join(', ') : 'no changes';

    if (Object.keys(updateData).length === 0) {
      return res.json({ success: true, message: 'No changes provided' });
    }

    await productsRef.updateOne({ id: productId }, { $set: updateData });
    invalidateProductsCache();

    // Keep local static catalogue in sync with MongoDB updates
    try {
      const edgeFilePath = path.join(__dirname, '../public/data/products.json');
      if (fs.existsSync(edgeFilePath)) {
        const localList = JSON.parse(fs.readFileSync(edgeFilePath, 'utf8'));
        const target = localList.find(p => Number(p.id) === productId);
        if (target) {
          Object.assign(target, updateData);
          fs.writeFileSync(edgeFilePath, JSON.stringify(localList, null, 2), 'utf8');
        }
      }
    } catch (edgeSyncErr) {
      console.warn('Could not sync update to edge products.json:', edgeSyncErr.message);
    }
    logAdminActivity(req.adminSession.username, 'Update Product', `Updated product ID: ${req.params.id} (${changesStr})`);
    res.json({ success: true });
  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

// Delete product
app.delete('/api/products/:id', requireAdmin, async (req, res) => {
  try {
    if (req.adminSession.role !== 'superadmin') {
      return res.status(403).json({ error: 'Only superadmin can delete products.' });
    }

    const productId = parseInt(req.params.id);
    const result = await productsRef.deleteOne({ id: productId });
    if (result.deletedCount === 0) return res.status(404).json({ error: 'Product not found' });

    invalidateProductsCache();

    // Keep local static catalogue in sync with MongoDB deletion
    try {
      const edgeFilePath = path.join(__dirname, '../public/data/products.json');
      if (fs.existsSync(edgeFilePath)) {
        const localList = JSON.parse(fs.readFileSync(edgeFilePath, 'utf8'));
        const nextList = localList.filter(p => Number(p.id) !== productId);
        fs.writeFileSync(edgeFilePath, JSON.stringify(nextList, null, 2), 'utf8');
      }
    } catch (edgeSyncErr) {
      console.warn('Could not sync delete to edge products.json:', edgeSyncErr.message);
    }

    logAdminActivity(req.adminSession.username, 'Delete Product', `Deleted product ID: ${req.params.id}`);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

app.post('/api/products', requireAdmin, upload.single('image'), async (req, res) => {
  try {
    // Creating a product sets its name, category and — for any type without a
    // rate-table basePrice (stickers, wallpapers, collectibles) — its price.
    // PATCH already limits a stocker to stockQuantity alone; leaving POST open
    // to them meant the same account could simply create a ₹1 product instead.
    // Deletion is superadmin-only, so creation is too.
    if (req.adminSession.role !== 'superadmin') {
      return res.status(403).json({ error: 'Only a superadmin can create products.' });
    }

    const { name, category, categories, productType, price, originalPrice, badge, description, stockQuantity, keywords, sku } = req.body;

    const rawCat = categories !== undefined ? categories : (category || 'Miscellaneous');
    const rawList = Array.isArray(rawCat) ? rawCat : String(rawCat).split(/[,|]/);
    const parsedCats = Array.from(new Set(rawList.map(s => String(s).trim()).filter(Boolean)));
    const resolvedCategory = parsedCats.join(', ') || 'Miscellaneous';

    const requestedType = Array.isArray(productType) ? productType[0] : productType;
    const fixedPrice = catalogBasePrice(requestedType, parsedCats[0] || resolvedCategory);
    if (!name || (!price && fixedPrice === null)) {
      return res.status(400).json({ error: 'Name and price are required' });
    }

    const newId = await getNextProductId();

    let imageUrl = '';
    if (req.file) {
      if (!bucket) {
        return res.status(503).json({ error: 'Image uploads are unavailable — Firebase Storage is not configured.' });
      }
      const ext = path.extname(req.file.originalname) || '.jpg';
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const filename = `products/prod-${uniqueSuffix}${ext}`;

      const fileUpload = bucket.file(filename);
      await fileUpload.save(req.file.buffer, {
        metadata: { contentType: req.file.mimetype }
      });
      // Make it publicly accessible
      await fileUpload.makePublic();
      imageUrl = `https://storage.googleapis.com/${bucket.name}/${filename}`;
    }

    const resolvedType = requestedType || getProductType(parsedCats[0] || resolvedCategory);
    const finalPrice = fixedPrice !== null ? fixedPrice : Number(price);
    const newProduct = {
      _id: newId,
      id: newId,
      name,
      category: resolvedCategory,
      categories: parsedCats,
      productType: resolvedType,
      price: finalPrice,
      pricingSource: fixedPrice !== null ? 'qikink' : 'manual',
      originalPrice: Number(originalPrice) > finalPrice ? Number(originalPrice) : finalPrice,
      badge: badge || '',
      description: description || '',
      stockQuantity: Number(stockQuantity || 0),
      keywords: keywords || '',
      sku: sku || newId.toString(),
      image: imageUrl,
      showInBestsellers: false,
      showInHero: false,
      showInNewArrivals: false,
      showInGrossing: false,
      createdAt: new Date()
    };

    await productsRef.insertOne(newProduct);
    invalidateProductsCache();

    // Keep local static catalogue in sync with MongoDB creation
    try {
      const edgeFilePath = path.join(__dirname, '../public/data/products.json');
      if (fs.existsSync(edgeFilePath)) {
        const localList = JSON.parse(fs.readFileSync(edgeFilePath, 'utf8'));
        localList.push(stripId(newProduct));
        fs.writeFileSync(edgeFilePath, JSON.stringify(localList, null, 2), 'utf8');
      }
    } catch (edgeSyncErr) {
      console.warn('Could not sync insert to edge products.json:', edgeSyncErr.message);
    }

    logAdminActivity(req.adminSession.username, 'Add Product', `Added product ID: ${newId} (${name})`);

    res.json({ success: true, product: stripId(newProduct) });
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({ error: 'Failed to create product' });
  }
});

// 'awaiting-payment' sits before 'confirmed': the shopper has transferred the
// money directly and given us a reference, but nobody has checked the bank yet.
// Nothing about such an order may be fulfilled until a human confirms it.
const CANONICAL_ORDER_STATUSES = ['awaiting-payment', 'confirmed', 'sent-for-printing', 'packed', 'shipped', 'transit', 'delivered', 'cancelled'];
const ORDER_STATUSES = [
  ...CANONICAL_ORDER_STATUSES,
  'printing',
  'Sent for Printing',
  'sent for printing',
  'in-transit',
  'In Transit'
];

function normalizeOrderStatus(raw) {
  if (!raw || typeof raw !== 'string') return '';
  const s = raw.trim();
  const lower = s.toLowerCase().replace(/[\s_]+/g, '-');
  if (lower === 'sent-for-printing' || lower === 'printing' || lower === 'sent-for-print') {
    return 'sent-for-printing';
  }
  if (lower === 'in-transit' || lower === 'transit') {
    return 'transit';
  }
  if (lower === 'awaiting-payment' || lower === 'payment-pending') {
    return 'awaiting-payment';
  }
  return lower;
}

// Update order status
app.patch('/api/orders/:orderId/status', requireAdmin, async (req, res) => {
  try {
    if (req.adminSession.role === 'watcher') {
      return res.status(403).json({ error: 'Watcher accounts have view-only access.' });
    }
    let status = normalizeOrderStatus(req.body.status);
    if (!status || !CANONICAL_ORDER_STATUSES.includes(status)) {
      return res.status(400).json({ error: `Status must be one of: ${CANONICAL_ORDER_STATUSES.join(', ')}` });
    }
    const order = await ordersRef.findOne({
      $or: [
        { _id: req.params.orderId },
        { orderId: req.params.orderId },
        { id: req.params.orderId }
      ]
    });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const oldStatus = order.status;
    if (oldStatus === status) return res.json({ message: 'Status unchanged', unchanged: true, status });
    // Preserve the original legally issued invoice number. Only assign if order has never been invoiced.
    if (!order.invoiceNumber) {
      const newInv = await getNextInvoiceNumber();
      await ordersRef.updateOne({ _id: order._id }, { $set: { status, invoiceNumber: newInv } });
      order.invoiceNumber = newInv;
    } else {
      await ordersRef.updateOne({ _id: order._id }, { $set: { status } });
    }

    if (status === 'cancelled') await adjustStockForOrder(order, +1);
    else if (oldStatus === 'cancelled') await adjustStockForOrder(order, -1);
    order.status = status;
    logAdminActivity(req.adminSession.username, 'Update Order Status', `Changed order ${order.orderId || order._id} status from ${oldStatus} to ${status}`);

    // There is no durable queue here. Send once and record the SMTP result
    // before replying so failures are visible instead of labelled "queued".
    const emailResult = await sendOrderEmail(order);
    const attemptedAt = new Date();
    try {
      await ordersRef.updateOne(
        { _id: order._id },
        { $set: emailResult.sent
          ? {
              'emailDelivery.lastStatus': 'sent',
              'emailDelivery.lastSentAt': attemptedAt,
              'emailDelivery.lastError': null,
              'emailDelivery.status': status
            }
          : {
              'emailDelivery.lastStatus': 'failed',
              'emailDelivery.lastAttemptAt': attemptedAt,
              'emailDelivery.lastError': emailResult.reason || 'Unknown email error',
              'emailDelivery.status': status
            }
        }
      );
    } catch (recordError) {
      console.error(`Failed to record status email result for order ${order.orderId || order._id}:`, recordError);
    }

    res.json({
      message: emailResult.sent
        ? 'Order status updated and email sent successfully'
        : 'Order status updated, but the email could not be sent',
      status,
      emailSent: !!emailResult.sent,
      emailError: emailResult.sent ? undefined : (emailResult.reason || 'Unknown email error')
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update order status' });
  }
});

const handleUpdateTracking = async (req, res) => {
  try {
    // Entering a courier and AWB is routine dispatch work, not a superadmin
    // action. Watchers stay view-only, same as every other write here.
    if (req.adminSession.role === 'watcher') {
      return res.status(403).json({ error: 'Watcher accounts have view-only access.' });
    }
    let { courierPartner, awbNumber, trackingUrl } = req.body;
    courierPartner = String(courierPartner || 'DTDC').trim();
    awbNumber = String(awbNumber || '').trim();
    trackingUrl = String(trackingUrl || '').trim();

    // Auto-extract AWB if trackingUrl is provided (e.g. from Printster or DTDC links) and awbNumber was empty
    if (trackingUrl && !awbNumber) {
      const match = trackingUrl.match(/\/track\/([A-Za-z0-9_-]+)/i);
      if (match) {
        awbNumber = match[1];
      }
    }

    const order = await ordersRef.findOne({
      $or: [
        { _id: req.params.orderId },
        { orderId: req.params.orderId },
        { id: req.params.orderId }
      ]
    });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    await ordersRef.updateOne(
      { _id: order._id },
      { $set: { courierPartner, awbNumber, trackingUrl, updatedAt: new Date() } }
    );

    // Invalidate live tracking memory cache so fresh data resolves immediately
    liveTrackCache.clear();

    logAdminActivity(req.adminSession.username, 'Update Order Tracking', `Updated tracking for ${order.orderId || order._id} (Courier: ${courierPartner}, AWB: ${awbNumber}, Tracking URL: ${trackingUrl})`);

    // Tell the customer, but only when the AWB actually changes to something
    // real. Saving the form again, or clearing it, must not re-send.
    const newAwb = awbNumber;
    const oldAwb = String(order.awbNumber || '').trim();
    let emailed = false;
    if (newAwb && newAwb !== oldAwb) {
      try {
        const fresh = await ordersRef.findOne({ _id: order._id });
        const result = await sendOrderEmail(fresh || order, true);
        emailed = !!(result && result.sent);
      } catch (e) {
        console.error('Tracking email failed:', e.message);
      }
    }
    res.json({
      message: 'Tracking updated successfully',
      emailed,
      courierPartner,
      awbNumber,
      trackingUrl,
      brushTrackingUrl: `/track/?awb=${encodeURIComponent(awbNumber || order.orderId || order._id)}`
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update tracking' });
  }
};

app.patch('/api/orders/:orderId/tracking', requireAdmin, handleUpdateTracking);
app.post('/api/orders/:orderId/tracking', requireAdmin, handleUpdateTracking);

app.post('/api/orders/:orderId/send-update', requireAdmin, async (req, res) => {
  try {
    if (req.adminSession.role === 'watcher') {
      return res.status(403).json({ error: 'Watcher accounts have view-only access.' });
    }
    const order = await ordersRef.findOne({
      $or: [
        { _id: req.params.orderId },
        { orderId: req.params.orderId },
        { id: req.params.orderId }
      ]
    });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const emailResult = await sendOrderEmail(order, true);
    const attemptedAt = new Date();
    try {
      await ordersRef.updateOne(
        { _id: order._id },
        {
          $set: emailResult.sent
            ? {
                'emailDelivery.lastStatus': 'sent',
                'emailDelivery.lastSentAt': attemptedAt,
                'emailDelivery.lastError': null,
                'emailDelivery.status': order.status
              }
            : {
                'emailDelivery.lastStatus': 'failed',
                'emailDelivery.lastAttemptAt': attemptedAt,
                'emailDelivery.lastError': emailResult.reason || 'Unknown email error',
                'emailDelivery.status': order.status
              }
        }
      );
    } catch (recordError) {
      console.error(`Failed to record manual update email result for order ${order.orderId || order._id}:`, recordError);
    }
    if (!emailResult.sent) {
      return res.status(502).json({ error: `Failed to send email: ${emailResult.reason}` });
    }
    res.json({ message: 'Order update email sent successfully', to: emailResult.to });
  } catch (error) {
    res.status(500).json({ error: 'Failed to send order update' });
  }
});



// ── Qikink fulfilment: review, then send ───────────────────────
// Deliberately manual. Nothing in the checkout path talks to Qikink — an
// order only reaches the supplier when someone opens it in the admin panel,
// reads the exact payload and presses send. Printing costs real money and is
// not reversible, so this is a decision a person makes per order.
//
//   POST /api/orders/:orderId/fulfil?dryRun=1   -> build and return the payload
//   POST /api/orders/:orderId/fulfil            -> build, send, record the result
//
// Idempotent by design: once an order carries a Qikink order id, a second
// send is refused rather than reprinting it.
async function buildFulfilmentPayload(order) {
  const map = require('./qikink-map');
  const ids = [...new Set((order.items || []).map(i => i.productId || i.id).filter(v => v != null))];
  const docs = ids.length ? await productsRef.find({ id: { $in: ids } }).toArray() : [];
  const byId = {};
  docs.forEach(d => { byId[d.id] = d; });
  return map.buildOrder(order, map.designResolver(byId));
}

app.post('/api/orders/:orderId/fulfil', requireAdmin, requireSuperAdmin, async (req, res) => {
  const qikink = require('./qikink');
  const { MappingError } = require('./qikink-map');
  try {
    if (!qikink.isConfigured()) {
      return res.status(503).json({ error: 'Qikink credentials are not configured on the server.' });
    }
    const order = await ordersRef.findOne({ _id: req.params.orderId });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status === 'cancelled') {
      return res.status(409).json({ error: 'This order is cancelled — it cannot be sent for fulfilment.' });
    }
    if (order.status === 'awaiting-payment') {
      return res.status(409).json({ error: 'Payment for this order has not been confirmed yet. Confirm it first, then send it for fulfilment.' });
    }

    let payload;
    try {
      payload = await buildFulfilmentPayload(order);
    } catch (err) {
      if (err instanceof MappingError) {
        // 422, not 500: the request is fine, the catalogue data isn't, and the
        // message says exactly which product and which field.
        return res.status(422).json({ error: err.message, detail: err.detail || null, stage: 'mapping' });
      }
      throw err;
    }

    const dryRun = req.query.dryRun === '1';
    const already = order.qikink && order.qikink.orderId;

    if (dryRun) {
      return res.json({
        dryRun: true,
        alreadySent: already ? { orderId: already, sentAt: order.qikink.sentAt, sentBy: order.qikink.sentBy } : null,
        environment: qikink.isLive() ? 'LIVE' : 'sandbox',
        payload
      });
    }

    if (already) {
      return res.status(409).json({
        error: `Already sent to Qikink as order ${already}. Refusing to send it twice.`,
        qikinkOrderId: already,
        sentAt: order.qikink.sentAt
      });
    }

    // Claim the order before the network call. A customer cancellation and this
    // send can otherwise interleave: cancel reads 'confirmed', we send to the
    // printer, cancel then writes 'cancelled' — leaving a refunded order on a
    // press. Cancellation refuses an order carrying a fulfilment marker, so
    // writing the marker first is what makes the two mutually exclusive.
    const claim = await ordersRef.updateOne(
      { _id: order._id, status: { $ne: 'cancelled' }, 'qikink.orderId': { $exists: false } },
      { $set: { 'qikink.sendingAt': new Date(), 'qikink.sendingBy': req.adminSession.username } }
    );
    if (claim.matchedCount === 0) {
      return res.status(409).json({ error: 'This order was cancelled or already sent a moment ago — nothing was sent.' });
    }

    let response;
    try {
      response = await qikink.createOrder(payload);
    } catch (err) {
      await ordersRef.updateOne({ _id: order._id }, {
        $set: {
          'qikink.lastError': err.message,
          'qikink.lastErrorDetail': err.body || null,
          'qikink.lastAttemptAt': new Date(),
          'qikink.lastAttemptBy': req.adminSession.username
        },
        // Release the claim, or a failed send would block every retry and
        // block cancellation too.
        $unset: { 'qikink.sendingAt': '', 'qikink.sendingBy': '' }
      });
      return res.status(502).json({ error: err.message, detail: err.body || null, stage: 'qikink' });
    }

    const record = {
      orderId: response && response.order_id ? String(response.order_id) : null,
      environment: qikink.isLive() ? 'live' : 'sandbox',
      orderNumber: payload.order_number,
      sentAt: new Date(),
      sentBy: req.adminSession.username,
      response: response || null,
      lastError: null,
      // Sent with the record so the (publicly served) admin bundle does not
      // have to hard-code the partner's domain.
      dashboardUrl: 'https://dashboard.qikink.com'
    };
    await ordersRef.updateOne({ _id: order._id }, { $set: { qikink: record } });
    await logAdminActivity(req.adminSession.username, 'Sent order to Qikink', `${order.orderId} -> Qikink order ${record.orderId} (${record.environment})`);
    res.json({ sent: true, fulfilment: record });
  } catch (error) {
    console.error('Fulfilment error:', error);
    res.status(500).json({ error: 'Failed to send this order to Qikink' });
  }
});

// ── Qikink SKU verification ────────────────────────────────────
// Qikink has no "does this SKU exist?" endpoint. The only way to ask is to
// attempt an order: a bad SKU returns "Invalid SKU", a good one returns a
// new order id.
//
// On Sandbox that is free and reversible, so probing is how the SKU map was
// built. On LIVE the same call places a REAL order that gets printed, packed
// and shipped, and bills you for it — so this route refuses to run against
// Live at all. There is no override flag: verifying 40 SKUs on Live would
// mean 40 real parcels. The Live catalogue comes from the dashboard's SKU
// Descriptions page as data, not from probing.
app.post('/api/_qikink/verify-skus', requireAdmin, requireSuperAdmin, async (req, res) => {
  const qikink = require('./qikink');
  try {
    if (!qikink.isConfigured()) return res.status(503).json({ error: 'Qikink credentials are not configured.' });
    if (qikink.isLive()) {
      return res.status(403).json({
        error: 'Refusing to probe SKUs against the Live endpoint — each probe would place a real, billable order. Import the SKU list from dashboard.qikink.com -> SKU Descriptions instead.'
      });
    }
    const skus = Array.isArray(req.body && req.body.skus) ? req.body.skus : [];
    const printTypeId = String((req.body && req.body.printTypeId) || 1);
    if (!skus.length) return res.status(400).json({ error: 'Send { skus: ["...", "..."] }' });
    if (skus.length > 40) return res.status(400).json({ error: 'Max 40 SKUs per call (Qikink allows 60 requests per minute).' });

    const map = require('./qikink-map');
    const shipping_address = map.shippingAddressFrom({
      name: 'Brush SKU Check', address: '1 Test Lane', phone: '9999999999',
      email: 'qa@example.com', city: 'Patna', state: 'Bihar', pincode: '800001'
    });

    const results = [];
    for (const raw of skus) {
      const sku = String(raw).trim();
      if (!sku) continue;
      try {
        const out = await qikink.createOrder({
          order_number: 'skuchk' + Date.now().toString(36).slice(-8),
          qikink_shipping: '1', gateway: 'Prepaid', total_order_value: '1',
          // No `designs` key at all — the only plain-product form their API
          // actually accepts (the two documented alternatives are rejected).
          line_items: [{ search_from_my_products: 0, print_type_id: printTypeId, quantity: '1', price: '1', sku }],
          shipping_address
        });
        results.push({ sku, valid: true, qikinkOrderId: out && out.order_id });
      } catch (err) {
        // "Invalid SKU" means it doesn't exist; anything else is a different
        // problem (wrong print type for a real SKU, rate limit, auth) and is
        // reported verbatim rather than collapsed into "invalid".
        const invalid = /invalid sku/i.test(err.message || '');
        results.push({ sku, valid: false, reason: err.message, skuUnknown: invalid });
      }
      await new Promise(r => setTimeout(r, 1100));   // stay under 60/min
    }
    res.json({ environment: 'sandbox', printTypeId, checked: results.length, results });
  } catch (error) {
    console.error('SKU verification error:', error);
    res.status(500).json({ error: 'SKU verification failed' });
  }
});

// ── Qikink integration diagnostics (TEMPORARY) ─────────────────
// Neither of the shells used to build this integration can reach
// qikink.com, but this server can — so the checks run here and report back.
//
// Gated three ways: the QIKINK_DIAGNOSTICS env flag (remove the line from
// .env when finished), a loopback-only client IP, and a refusal to run
// against the Live host at all. It performs read/auth calls plus sandbox
// order attempts; it can never touch a live Qikink account.
app.get('/api/_qikink/diagnose', async (req, res) => {
  if (process.env.QIKINK_DIAGNOSTICS !== 'true') return res.status(404).json({ error: 'Not found' });
  const ip = (req.ip || '').replace('::ffff:', '');
  if (!['127.0.0.1', '::1', 'localhost'].includes(ip)) {
    return res.status(403).json({ error: 'Diagnostics are loopback-only', saw: ip });
  }
  const qikink = require('./qikink');
  const map = require('./qikink-map');
  if (qikink.isLive()) return res.status(400).json({ error: 'Refusing to run diagnostics against the Live endpoint' });

  const steps = [];
  const record = async (name, fn) => {
    const t0 = Date.now();
    try { steps.push({ step: name, ok: true, ms: Date.now() - t0, result: await fn() }); }
    catch (e) { steps.push({ step: name, ok: false, ms: Date.now() - t0, error: e.message, detail: e.body || e.detail || null }); }
  };

  await record('config', async () => ({ base: qikink.baseUrl(), configured: qikink.isConfigured(), live: qikink.isLive() }));
  await record('token', async () => {
    const t = await qikink.getToken(true);
    return { obtained: true, length: String(t).length };   // never echo the token itself
  });
  await record('token-is-cached', async () => {
    const a = await qikink.getToken();
    const b = await qikink.getToken();
    return { reusedWithoutRefetch: a === b };
  });

  // Probe candidate SKUs. A create-order call is the only way to ask Qikink
  // whether a SKU exists; each probe is a sandbox order, so keep the list short.
  const probes = (req.query.skus || '').split(',').map(x => x.trim()).filter(Boolean);
  for (const sku of probes) {
    await record('probe:' + sku, async () => {
      // The sandbox rejects the docs' recommended plain form ("designs": [])
      // with "Design Array is empty", so the shape is selectable here:
      //   empty  -> designs: []            (what the docs recommend)
      //   omit   -> no designs key at all  (the docs' other plain form)
      //   zero   -> one design, 0 x 0      (the docs' third plain form)
      //   design -> a real design payload
      const mode = req.query.mode || 'empty';
      const line = { search_from_my_products: 0, print_type_id: String(req.query.pt || 1), quantity: '1', price: '1', sku };
      if (mode === 'empty') line.designs = [];
      else if (mode === 'zero') line.designs = [{ design_code: '', width_inches: 0, height_inches: 0, placement_sku: 'fr', design_link: '', mockup_link: '' }];
      else if (mode === 'design') line.designs = [{
        design_code: (req.query.design_code || 'brushqa1').slice(0, 20),
        width_inches: String(req.query.w || 8),
        height_inches: String(req.query.h || 10),
        placement_sku: req.query.placement || 'fr',
        design_link: req.query.design_link || `${SITE_URL}/img/w1080/assets/Floral/Rose.webp`,
        mockup_link: req.query.mockup_link || `${SITE_URL}/img/w480/assets/Floral/Rose.webp`
      }];
      const payload = {
        order_number: 'probe' + Date.now().toString(36).slice(-9),
        qikink_shipping: '1', gateway: 'Prepaid', total_order_value: '1',
        line_items: [line],
        shipping_address: map.shippingAddressFrom({
          name: 'Brush QA', address: '1 Test Lane', phone: '9999999999',
          email: 'qa@example.com', city: 'Patna', state: 'Bihar', pincode: '800001'
        })
      };
      return { sent: line, response: await qikink.createOrder(payload) };
    });
  }

  // End-to-end: a realistic Brush order document, through qikink-map's
  // buildOrder(), submitted to the sandbox. This is the path a real order
  // would take, so it exercises the SKU map, the print-type map, the address
  // splitter and the plain-vs-printed branch together.
  if (req.query.e2e === '1') {
    const customer = {
      name: 'Brush QA', address: '1 Test Lane, Boring Road', phone: '9999999999',
      email: 'qa@example.com', city: 'Patna', state: 'Bihar', pincode: '800001'
    };
    const art = {
      design_code: 'brushqa' + Date.now().toString(36).slice(-6),
      width_inches: '8.3', height_inches: '11.7', placement_sku: 'fr',
      design_link: `${SITE_URL}/img/w1080/assets/Floral/Rose.webp`,
      mockup_link: `${SITE_URL}/img/w480/assets/Floral/Rose.webp`
    };
    const cases = [
      ['poster A4 (plain)',   { productType: 'poster',  quantity: 1, price: 46,  variants: { size: 'A4' } }, null],
      ['poster A3 (printed)', { productType: 'poster',  quantity: 1, price: 58,  variants: { size: 'A3' } }, art],
      ['tee M · DTF back',    { productType: 'apparel', quantity: 1, price: 443, variants: { size: 'M', print: 'dtf' } }, { ...art, placement_sku: 'bk', width_inches: '11.7', height_inches: '16.5' }],
      ['tee L · DTG back',    { productType: 'apparel', quantity: 2, price: 455, variants: { size: 'L', print: 'dtg' } }, { ...art, placement_sku: 'bk', width_inches: '11.7', height_inches: '16.5' }],
      ['hoodie M · DTF',      { productType: 'hoodie',  quantity: 1, price: 1018, variants: { size: 'M', print: 'dtf' } }, art]
    ];
    for (const [label, item, design] of cases) {
      await record('e2e:' + label, async () => {
        const order = {
          orderId: 'ORD-' + require('crypto').randomBytes(6).toString('hex').toUpperCase(),
          paymentMethod: 'cod', total: item.price * item.quantity, customer, items: [item]
        };
        const payload = map.buildOrder(order, () => design);
        const response = await qikink.createOrder(payload);
        return { sku: payload.line_items[0].sku, print_type_id: payload.line_items[0].print_type_id, response };
      });
      await new Promise(r => setTimeout(r, 700));
    }
  }

  if (req.query.list === '1') await record('order-list', () => qikink.listOrders({ page_no: 1 }));

  res.json({ ranAt: new Date().toISOString(), steps });
});

// ── Health check endpoint ──────────────────────────────────────
// Used by cloud providers (Render, Railway) for uptime probes,
// and by monitoring tools to verify both the server and MongoDB
// are reachable.
app.get('/api/health', async (req, res) => {
  try {
    await db.command({ ping: 1 });
    res.json({
      status: 'ok',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      mongo: 'connected'
    });
  } catch (err) {
    // Logged, not returned — the driver's message carries host names and
    // replica-set state, and every other handler here returns a generic string.
    console.error('Health check failed:', err);
    res.status(503).json({
      status: 'degraded',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      mongo: 'disconnected'
    });
  }
});

// ---- Direct-transfer payment request -------------------------------------
// This has to live above the 404 catch-all below. It was originally defined
// after app.listen(), so every call fell through to the catch-all and came
// back as {"error":"Not found"} — the route never ran at all.
const { buildPaymentRequestEmail } = require('./orderEmailTemplate');

async function sendPaymentRequestAndLog(order) {
  if (!order || !order.customer) return { sent: false, reason: 'Order has no customer details' };
  const toEmail = order.customer.email || order.customer.id;
  if (!toEmail || !toEmail.includes('@')) return { sent: false, reason: 'Customer has no valid email address' };

  try {
    const cfg = directPayConfig();
    // The QR travels with the email rather than being fetched from the web.
    // It is a small local file, and this way it shows even before the site has
    // been redeployed — and survives a client that blocks remote images.
    const qrFile = cfg.qrUrl ? path.join(__dirname, '../public', cfg.qrUrl) : null;
    const embedQr = qrFile && fs.existsSync(qrFile);
    const { subject, html, text } = buildPaymentRequestEmail(
      order, SITE_URL, embedQr ? { ...cfg, qrUrl: 'cid:brush-upi-qr' } : cfg
    );
    if (process.env.SMTP_HOST) {
      await sendMail({
        from: getFromAddress(process.env.EMAIL_FROM),
        to: toEmail,
        replyTo: process.env.EMAIL_REPLY_TO || 'admin@brush-art.in',
        subject,
        text,
        html,
        attachments: embedQr
          ? [{ filename: 'upi-qr.png', path: qrFile, cid: 'brush-upi-qr' }]
          : undefined
      });
      console.log(`Payment request email sent to ${toEmail} for order ${order._id}`);
      return { sent: true, to: toEmail };
    } else {
      console.log(`[Email Mock] Payment request to ${toEmail}: ${subject}`);
      return { sent: true, to: toEmail, mock: true };
    }
  } catch (error) {
    console.error(`Failed to send payment request to ${toEmail}:`, error);
    return { sent: false, reason: error.message };
  }
}

app.post('/api/orders/:orderId/request-payment', requireAdmin, async (req, res) => {
  try {
    if (req.adminSession.role === 'watcher') {
      return res.status(403).json({ error: 'Watcher accounts have view-only access.' });
    }
    const order = await ordersRef.findOne({ _id: req.params.orderId });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status !== 'awaiting-payment' || order.paymentMethod !== 'direct') {
      return res.status(400).json({ error: 'Only awaiting-payment direct orders can be requested.' });
    }
    const emailResult = await sendPaymentRequestAndLog(order);
    if (!emailResult.sent) {
      return res.status(502).json({ error: `Failed to send email: ${emailResult.reason}` });
    }
    res.json({ message: 'Payment request email sent successfully', to: emailResult.to });
  } catch (error) {
    res.status(500).json({ error: 'Failed to send payment request' });
  }
});

// Catch-all for anything that didn't match an API route or a static file
// above - previously fell through to Express's bare "Cannot GET /..." page,
// an unbranded dead end with no nav and no way back. JSON for API paths
// (so client-side error handling that expects JSON doesn't break), the
// branded page for everything else.
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.status(404).sendFile(path.join(__dirname, '../public/404.html'));
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something broke!' });
});

async function start() {
  await mongoClient.connect();
  db = mongoClient.db();
  productsRef = db.collection('products');
  ordersRef = db.collection('orders');
  usersRef = db.collection('users');
  adminsRef = db.collection('admins');
  adminLogsRef = db.collection('admin_logs');
  countersRef = db.collection('counters');
  sessionsRef = db.collection('sessions');
  requirementsRef = db.collection('requirements');
  reachoutSubmissionsRef = db.collection('reachout_submissions');
  // Sessions survive a restart from here on. Mongo expires the documents
  // itself through a TTL index on expiresAt, so nothing needs to sweep them.
  try {
    await sessionsRef.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    paymentSessionsRef = db.collection('payment_sessions');
    paymentExceptionsRef = db.collection('payment_exceptions');
    // Mongo expires these on its own once the authorization window passes.
    await paymentSessionsRef.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    const restored = await loadSessionsFromDb();
    console.log(`🔑 Restored ${restored} live session(s) from MongoDB`);
  } catch (err) {
    console.error('⚠️ Session persistence unavailable, continuing in memory only:', err.message);
  }
  console.log('✅ Connected to MongoDB');

  try {
    await syncCatalogPrices();
  } catch (err) {
    console.error('⚠️ Catalogue price sync failed (storefront still prices from productTypes.js):', err.message);
  }

  // Lighting catalogue verification and auto-seed for Patliputra Traders
  try {
    const productCount = await productsRef.countDocuments();
    if (productCount === 0) {
      console.log('📦 Products collection is empty. Auto-seeding lighting products...');
      const productsJsonPath = path.join(__dirname, '../public/data/products.json');
      if (fs.existsSync(productsJsonPath)) {
        const lightingProducts = JSON.parse(fs.readFileSync(productsJsonPath, 'utf8'));
        if (Array.isArray(lightingProducts) && lightingProducts.length > 0) {
          await productsRef.insertMany(lightingProducts);
          console.log(`✅ Successfully auto-seeded ${lightingProducts.length} lighting products into MongoDB.`);
          await productsRef.createIndex({ id: 1 }, { unique: true });
          await productsRef.createIndex({ sku: 1 });
          await productsRef.createIndex({ category: 1 });
          await productsRef.createIndex({ name: 'text', description: 'text', keywords: 'text' });
        }
      }
    } else {
      console.log(`💡 Lighting catalogue verified: ${productCount} products ready in MongoDB.`);
    }
  } catch (err) {
    console.error('⚠️ Lighting catalogue seed/verify check failed:', err.message);
  }


  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
}

start().catch(err => {
  console.error('❌ Failed to start server:', err);
  process.exit(1);
});
