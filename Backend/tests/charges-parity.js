// Checks that the browser's copy of the charges engine (public/cart.js) agrees
// with the authoritative one (Backend/productTypes.js) on every case below, and
// that a few invariants hold. The two files are hand-mirrored, so this is what
// catches a change made to one and not the other.
//
//   node Backend/tests/charges-parity.js .
//
// Exits non-zero on any divergence.
const nodePath = require('path');
const root = nodePath.resolve(__dirname, '../..');
const path = root;
const srv = require(nodePath.join(root, 'Backend/productTypes.js'));

// Load cart.js in a fake browser and pull orderCharges out through getCharges.
const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync(nodePath.join(root, 'public/cart.js'), 'utf8');
let store = '[]';
const sandbox = {
  window: {}, document: { addEventListener(){}, currentScript:null },
  localStorage: { getItem: () => store, setItem: (k,v)=>{store=v;}, removeItem(){} },
  fetch: () => Promise.reject(new Error('no network')),
  console
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(src + '\n;globalThis.__Cart = Cart;', sandbox);
const Cart = sandbox.__Cart;

// Directly compare the fixed-rate unit prices using a stale DB price. This
// catches a mirror drift before it can cascade into order-level charges.
const unitCases = [
  ['poster', { size: 'A4', gsm: '300', finish: 'matte' }],
  ['poster', { size: 'A3', gsm: '300', finish: 'matte' }],
  ['poster', { size: 'A5', gsm: '225', finish: 'glossy' }],
  ['poster_2_pack', { size: 'A4', gsm: '300', finish: 'matte' }],
  ['poster_3_pack', { size: 'A4', gsm: '300', finish: 'matte' }],
  ['apparel', { style: 'uc21', print: 'dtf', size: 'M' }],
  ['hoodie', { print: 'puff', size: 'M' }]
];
let unitFails = 0;
for (const [productType, variants] of unitCases) {
  const server = srv.priceWithVariants(999, productType, variants);
  const client = Cart.priceFor({ price: 999, productType }, variants);
  if (server.price !== client.price || JSON.stringify(server.resolvedVariants) !== JSON.stringify(client.variants)) {
    unitFails++;
    console.log(`  DIFF unit ${productType} ${JSON.stringify(variants)}: ${server.price}/${JSON.stringify(server.resolvedVariants)} vs ${client.price}/${JSON.stringify(client.variants)}`);
  }
}
console.log(unitFails ? `  >>> ${unitFails} unit-price divergence(s)` : '  >>> unit prices agree');

const cases = [
  { n: '1 poster',            lines: [{price:20,quantity:1,productType:'poster', variants:{size:'A4',gsm:'300',finish:'matte'}}], pay:'prepaid', o:{} },
  { n: '5 posters',           lines: [{price:20,quantity:5,productType:'poster', variants:{size:'A4',gsm:'300',finish:'matte'}}], pay:'prepaid', o:{} },
  { n: '6 posters (buy5get1)', lines: [{price:20,quantity:6,productType:'poster', variants:{size:'A4',gsm:'300',finish:'matte'}}], pay:'prepaid', o:{} },
  { n: '10 posters',          lines: [{price:20,quantity:10,productType:'poster', variants:{size:'A4',gsm:'300',finish:'matte'}}], pay:'prepaid', o:{} },
  { n: '13 posters (buy10get3)', lines: [{price:20,quantity:13,productType:'poster', variants:{size:'A4',gsm:'300',finish:'matte'}}], pay:'prepaid', o:{} },
  { n: '20 posters',          lines: [{price:20,quantity:20,productType:'poster', variants:{size:'A4',gsm:'300',finish:'matte'}}], pay:'prepaid', o:{} },
  { n: '24 posters (buy20get4)', lines: [{price:20,quantity:24,productType:'poster', variants:{size:'A4',gsm:'300',finish:'matte'}}], pay:'prepaid', o:{} },
  { n: '36 posters (buy30get6)', lines: [{price:20,quantity:36,productType:'poster', variants:{size:'A4',gsm:'300',finish:'matte'}}], pay:'prepaid', o:{} },
  { n: 'mixed 6 posters lowest free', lines: [{price:99,quantity:5,productType:'poster', variants:{size:'A3',gsm:'300',finish:'matte'}}, {price:20,quantity:1,productType:'poster', variants:{size:'A5',gsm:'225',finish:'glossy'}}], pay:'prepaid', o:{} },
  { n: '10 + coupon',     lines: [{price:20,quantity:10,productType:'poster', variants:{size:'A4',gsm:'300',finish:'matte'}}], pay:'prepaid', o:{couponDiscount:20} },
  { n: '10 express',          lines: [{price:20,quantity:10,productType:'poster', variants:{size:'A4',gsm:'300',finish:'matte'}}], pay:'prepaid', o:{deliveryOption:'express'} },
  { n: '10 priority',         lines: [{price:20,quantity:10,productType:'poster', variants:{size:'A4',gsm:'300',finish:'matte'}}], pay:'prepaid', o:{deliveryOption:'priority'} },
  { n: '1 tee cod',           lines: [{price:549,quantity:1,productType:'apparel', variants:{style:'uc21',print:'dtf',size:'M'}}], pay:'cod', o:{} },
  { n: '1 framed A4 prep',    lines: [{price:29,quantity:1,productType:'poster', variants:{size:'A4',gsm:'300',finish:'matte',frame:'black_a4'}}], pay:'prepaid', o:{} },
  { n: '1 framed A3 prep',    lines: [{price:29,quantity:1,productType:'poster', variants:{size:'A3',gsm:'300',finish:'matte',frame:'black_a3'}}], pay:'prepaid', o:{} },
  { n: '1 hoodie cod',        lines: [{price:1199,quantity:1,productType:'hoodie', variants:{print:'dtf',size:'M'}}], pay:'cod', o:{} },
  { n: 'tee + poster mixed',  lines: [{price:549,quantity:1,productType:'apparel', variants:{style:'uc21',print:'dtf',size:'M'}},{price:20,quantity:2,productType:'poster', variants:{size:'A4',gsm:'300',finish:'matte'}}], pay:'prepaid', o:{} },
  { n: 'coupon > cart',       lines: [{price:20,quantity:1,productType:'poster', variants:{size:'A4',gsm:'300',finish:'matte'}}], pay:'prepaid', o:{couponDiscount:999} },
  { n: 'empty cart',          lines: [], pay:'prepaid', o:{} },
  { n: 'just under 399',      lines: [{price:398,quantity:1,productType:'plate'}], pay:'prepaid', o:{} },
  { n: 'exactly 399',         lines: [{price:399,quantity:1,productType:'plate'}], pay:'prepaid', o:{} },
  { n: 'exactly 499',         lines: [{price:499,quantity:1,productType:'plate'}], pay:'prepaid', o:{} },
  { n: 'exactly 599',         lines: [{price:599,quantity:1,productType:'plate'}], pay:'prepaid', o:{} },
  { n: 'legacy number arg',   lines: [{price:20,quantity:10,productType:'poster', variants:{size:'A4',gsm:'300',finish:'matte'}}], pay:'prepaid', o:46, legacy:true },
  { n: '1 digital asset',     lines: [{price:79,quantity:1,productType:'digital', category:'Digital Assets'}], pay:'prepaid', o:{} },
  { n: 'digital + physical',  lines: [{price:79,quantity:1,productType:'digital', category:'Digital Assets'},{price:20,quantity:1,productType:'poster', variants:{size:'A4',gsm:'300',finish:'matte'}}], pay:'prepaid', o:{} }
];

const F = ['subtotal','launchDiscount','couponDiscount','discount','taxableValue','tax',
           'shipping','deliverySurcharge','processingFee','codFee','total','deliveryOption'];
let fails = 0;
for (const c of cases) {
  // client: seed the cart, then ask through the public API
  const priced = c.lines.map(l => ({
    ...l,
    price: srv.priceWithVariants(l.price, l.productType, l.variants).price
  }));
  store = JSON.stringify(priced.map((l, i) => ({ ...l, id: i + 1, cartId: 'c' + i })));
  const a = srv.orderCharges(priced, c.pay, c.o);
  const b = Cart.getCharges(c.pay, c.o);
  const diff = F.filter(k => String(a[k]) !== String(b[k]));
  if (diff.length) { fails++; console.log('  DIFF ' + c.n.padEnd(20) + diff.map(k=>`${k}: ${a[k]} vs ${b[k]}`).join(', ')); }
  else console.log('  ok   ' + c.n.padEnd(20) +
    `sub=${a.subtotal} launch=${a.launchDiscount} coup=${a.couponDiscount} tax=${a.tax} ship=${a.shipping} dlv=${a.deliverySurcharge} fee=${a.processingFee} cod=${a.codFee} TOTAL=${a.total}`);
}
console.log(fails ? `\n  >>> ${fails} divergence(s)` : '\n  >>> server and client agree on every case');

// invariants
console.log('\n=== 5. invariants ===');
const inv = [];
for (const c of cases) {
  const r = srv.orderCharges(
    c.lines.map(l => ({ ...l, price: srv.priceWithVariants(l.price, l.productType, l.variants).price })),
    c.pay, c.o);
  if (r.total < 0) inv.push(c.n + ': negative total');
  if (r.taxableValue < 0) inv.push(c.n + ': negative taxable value');
  if (r.discount > r.subtotal + 0.001) inv.push(c.n + ': discount exceeds subtotal');
  // Shelf prices are tax-INCLUSIVE: the tax is already inside taxableValue,
  // so adding it again here would double-count it. The total is the taxable
  // value plus the charges that carry no tax.
  const sum = r.taxableValue + r.shipping + r.deliverySurcharge + r.processingFee + r.codFee;
  if (Math.abs(Math.round(sum) - r.total) > 1) inv.push(`${c.n}: parts ${sum.toFixed(2)} != total ${r.total}`);
  // And the tax must never exceed the value it was extracted from.
  if (r.tax > r.taxableValue + 0.001) inv.push(`${c.n}: tax ${r.tax} exceeds taxable value ${r.taxableValue}`);
  if (r.tax > 0 && r.taxableValue === 0) inv.push(c.n + ': tax charged on a zero taxable value');
}
console.log(inv.length ? inv.map(x=>'  FAIL '+x).join('\n') : '  ok   no negative totals, no over-discount, parts sum to total, no tax on zero base');

console.log('\n=== 6. prepaid-only rule ===');
const pp = [
  [[{price:20,quantity:1,productType:'poster', variants:{size:'A4',gsm:'300',finish:'matte'}}], true,  'poster'],
  [[{price:20,quantity:1,productType:'Posters'}], true, 'Posters (label form)'],
  [[{price:443,quantity:1,productType:'apparel', variants:{style:'uc21',print:'dtf',size:'M'}}], false,'apparel'],
  [[{price:79,quantity:1,productType:'digital'}], true, 'digital'],
  [[{price:443,quantity:1,productType:'apparel', variants:{style:'uc21',print:'dtf',size:'M'}},{price:20,quantity:1,productType:'poster', variants:{size:'A4',gsm:'300',finish:'matte'}}], true,'mixed'],
  [[], false, 'empty']
];
let pf=0;
for (const [lines, want, label] of pp) {
  const s2 = srv.cartRequiresPrepaid(lines), c2 = (()=>{store=JSON.stringify(lines.map((l,i)=>({...l,id:i+1,cartId:'c'+i})));return Cart.requiresPrepaid();})();
  const ok = s2===want && c2===want;
  if(!ok) pf++;
  console.log(`  ${ok?'ok  ':'FAIL'} ${label.padEnd(22)} server=${s2} client=${c2} expected=${want}`);
}
console.log(pf ? `  >>> ${pf} failure(s)` : '  >>> prepaid rule agrees on both sides');

console.log('\n=== 7. delivery promise & estimated delivery parity ===');
let dFails = 0;
const deliveryCases = [
  ['110001', [{ productType: 'poster' }], null, { minDays: 5, maxDays: 8, ncr: true }],
  ['560001', [{ productType: 'poster' }], null, { minDays: 6, maxDays: 11, ncr: false }],
  ['110001', [{ productType: 'apparel' }], null, { minDays: 7, maxDays: 10, ncr: true }],
  ['560001', [{ productType: 'apparel' }], null, { minDays: 10, maxDays: 14, ncr: false }],
  ['110001', [{ productType: 'poster' }], { surcharge: 50 }, { minDays: 4, maxDays: 7, ncr: true }],
  ['560001', [{ productType: 'poster' }], { surcharge: 50 }, { minDays: 5, maxDays: 10, ncr: false }]
];

for (const [pin, items, tier, expected] of deliveryCases) {
  const s = srv.deliveryPromiseFor(pin, items, tier);
  const c = Cart.deliveryPromiseFor(pin, items, tier);
  const ok = s.minDays === expected.minDays && s.maxDays === expected.maxDays && s.ncr === expected.ncr &&
             c.minDays === expected.minDays && c.maxDays === expected.maxDays && c.ncr === expected.ncr;
  if (!ok) {
    dFails++;
    console.log(`  FAIL deliveryPromiseFor ${pin} items=${items[0].productType}: server=${JSON.stringify(s)} client=${JSON.stringify(c)} expected=${JSON.stringify(expected)}`);
  } else {
    console.log(`  ok   deliveryPromiseFor ${pin} ${items[0].productType.padEnd(8)} -> ${s.minDays}–${s.maxDays} days (ncr=${s.ncr})`);
  }
}

// Check cutoff and holiday logic:
// Wednesday 2026-11-04 11:00 AM IST (before 2 PM cutoff)
const wedMorning = new Date('2026-11-04T05:30:00.000Z'); // 11:00 IST
const sWedMorning = srv.calculateEstimatedDelivery(wedMorning, 5);
const cWedMorning = Cart.calculateEstimatedDelivery(wedMorning, 5);
if (sWedMorning.toISOString() !== cWedMorning.toISOString()) {
  dFails++;
  console.log(`  FAIL wedMorning divergence: server=${sWedMorning.toISOString()} client=${cWedMorning.toISOString()}`);
} else {
  console.log(`  ok   cutoff before 2PM agrees: ${sWedMorning.toISOString()}`);
}

// Wednesday 2026-11-04 3:00 PM IST (after 2 PM cutoff)
const wedAfternoon = new Date('2026-11-04T09:30:00.000Z'); // 15:00 IST
const sWedAfternoon = srv.calculateEstimatedDelivery(wedAfternoon, 5);
const cWedAfternoon = Cart.calculateEstimatedDelivery(wedAfternoon, 5);
if (sWedAfternoon.toISOString() !== cWedAfternoon.toISOString()) {
  dFails++;
  console.log(`  FAIL wedAfternoon divergence: server=${sWedAfternoon.toISOString()} client=${cWedAfternoon.toISOString()}`);
} else {
  console.log(`  ok   cutoff after 2PM agrees (+1 working day shift): ${sWedAfternoon.toISOString()}`);
}

// Holiday check: 2026-11-08 is Diwali (Sunday), 2026-11-09 is Govardhan Puja (Monday holiday), 2026-11-10 is Bhai Dooj (Tuesday holiday)
// A delivery calculated across this span must skip both Monday and Tuesday holidays.
const preDiwali = new Date('2026-11-06T05:30:00.000Z'); // Friday 11:00 AM IST
const sHolidayCheck = srv.calculateEstimatedDelivery(preDiwali, 2);
const cHolidayCheck = Cart.calculateEstimatedDelivery(preDiwali, 2);
if (sHolidayCheck.toISOString() !== cHolidayCheck.toISOString()) {
  dFails++;
  console.log(`  FAIL holiday divergence: server=${sHolidayCheck.toISOString()} client=${cHolidayCheck.toISOString()}`);
} else {
  console.log(`  ok   holiday and weekend skipping agrees: ${sHolidayCheck.toISOString()}`);
}

console.log(dFails ? `  >>> ${dFails} delivery divergence(s)` : '  >>> delivery calculations agree on both sides');

if (fails || unitFails || inv.length || pf || dFails) process.exit(1);
