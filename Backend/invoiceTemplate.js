// Indian GST Tax Invoice Template for Kraft Studios / Brush
// Formatted strictly in compliance with Section 31 of CGST Act, 2017 & Rule 46 of CGST Rules, 2017.

const path = require('path');
const fs = require('fs');
const { formatVariantLine, normalizeProductType, PRODUCT_TYPES } = require('./productTypes');

const LOGO_PATH = path.join(__dirname, '../public/img/site/patliputra-logo.png');
const SIGNATURE_IMAGE_PATH = path.join(__dirname, 'assets/signature.png');
const SIGNATURE_FONT_PATH = path.join(__dirname, '../public/Fonts/amsterdam_signature/Amsterdam Signature.ttf');

const COMPANY = {
  legalName: 'Patliputra Traders',
  tradeName: 'Patliputra Traders',
  brand: 'Patliputra Traders',
  designation: 'Proprietor – Patliputra Traders',
  brandLine: 'Patliputra Traders — Luxury Architectural & Decorative Lighting',
  registeredAddress: 'Machhua Toli, Exhibition Road, Patna, Bihar – 800004.',
  addressLines: [
    'Machhua Toli, Near Exhibition Road',
    'Patna Showroom & Distribution Hub',
    'Patna, Bihar – 800004'
  ],
  state: 'Bihar',
  stateCode: '10',
  gstin: '10FVAPM7714R1Z8',
  msmeReg: 'UDYAM-BR-26-0255687',
  gstEffectiveDate: '2026-10-19T00:00:00+05:30', // 19 October 2026 IST
  email: 'patliputratraders01@gmail.com',
  phone: '+91 9234755686',
  bankName: 'SBI',
  bankAccountHolder: 'Patliputra Traders',
  bankAccountNumber: '34306253090',
  bankAccountType: 'Current Account',
  bankIfsc: 'SBIN0000152',
  bankBranch: 'PATNA MAIN BRANCH'
};

const SIGNATORY_NAME = 'Kumar Mangalam';
const SIGNATORY_TITLE = 'Proprietor';

// Statutory HSN / SAC mappings for product lines
// 4911 91 00: Printed pictures, designs and photographs (art & decorative posters)
const HSN_MAP = {
  poster: '49119100',
  poster_2_pack: '49119100',
  poster_3_pack: '49119100',
  poster_pack_5: '49119100',
  poster_pack_10: '49119100',
  poster_pack_15: '49119100',
  poster_pack_20: '49119100',
  poster_pack_25: '49119100',
  posters: '49119100',
  apparel: '610910',
  hoodie: '611020',
  tapestry: '630492',
  metal: '830629',
  plate: '691200',
  wallpaper: '481490',
  digital: '998439',
  sticker: '391990',
  stickers: '391990',
  generic: '49119100'
};

const STATE_GST_CODES = {
  'JAMMU AND KASHMIR': '01',
  'JAMMU & KASHMIR': '01',
  'HIMACHAL PRADESH': '02',
  'PUNJAB': '03',
  'CHANDIGARH': '04',
  'UTTARAKHAND': '05',
  'HARYANA': '06',
  'DELHI': '07',
  'NEW DELHI': '07',
  'RAJASTHAN': '08',
  'UTTAR PRADESH': '09',
  'UP': '09',
  'BIHAR': '10',
  'SIKKIM': '11',
  'ARUNACHAL PRADESH': '12',
  'NAGALAND': '13',
  'MANIPUR': '14',
  'MIZORAM': '15',
  'TRIPURA': '16',
  'MEGHALAYA': '17',
  'ASSAM': '18',
  'WEST BENGAL': '19',
  'WB': '19',
  'JHARKHAND': '20',
  'ODISHA': '21',
  'ORISSA': '21',
  'CHHATTISGARH': '22',
  'MADHYA PRADESH': '23',
  'MP': '23',
  'GUJARAT': '24',
  'DAMAN AND DIU': '26',
  'DADRA AND NAGAR HAVELI': '26',
  'MAHARASHTRA': '27',
  'ANDHRA PRADESH': '37',
  'KARNATAKA': '29',
  'GOA': '30',
  'LAKSHADWEEP': '31',
  'KERALA': '32',
  'TAMIL NADU': '33',
  'PUDUCHERRY': '34',
  'PONDICHERRY': '34',
  'ANDAMAN AND NICOBAR ISLANDS': '35',
  'TELANGANA': '36',
  'LADAKH': '38'
};

function resolveStateCode(rawState) {
  if (!rawState) return { stateName: 'Bihar', stateCode: '10' };
  const clean = String(rawState).trim().replace(/[-–_,\d]/g, '').trim().toUpperCase();
  for (const [name, code] of Object.entries(STATE_GST_CODES)) {
    if (clean === name || clean.startsWith(name) || name.startsWith(clean)) {
      return { stateName: rawState.trim(), stateCode: code };
    }
  }
  return { stateName: rawState.trim(), stateCode: '99' }; // 99 for other / unmapped
}

function cleanPdfText(str) {
  if (!str) return '';
  return String(str)
    .replace(/[″”"]/g, '"')
    .replace(/[′’']/g, "'")
    .replace(/[×✕]/g, 'x')
    .replace(/[–—]/g, '-')
    .replace(/₹/g, 'Rs. ')
    .trim();
}

function money(n) {
  return 'Rs. ' + Number(n || 0).toFixed(2);
}

function parseIstDate(dateInput) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput || Date.now());
  const invalid = isNaN(d.getTime());
  const validDate = invalid ? new Date() : d;

  const dateStr = validDate.toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });

  const formattedStr = validDate.toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  return { d: validDate, dateStr, formattedStr };
}

function isPreGstRegistration(dateInput) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput || Date.now());
  const regDate = new Date('2026-10-18T18:30:00.000Z'); // 19 Oct 2026 00:00:00 IST
  return d < regDate;
}

function numberToWords(num) {
  const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function convert(n) {
    if (n < 20) return a[n];
    if (n < 100) return b[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + a[n % 10] : '');
    if (n < 1000) return a[Math.floor(n / 100)] + ' Hundred' + (n % 100 !== 0 ? ' and ' + convert(n % 100) : '');
    if (n < 100000) return convert(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 !== 0 ? ' ' + convert(n % 1000) : '');
    if (n < 10000000) return convert(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 !== 0 ? ' ' + convert(n % 100000) : '');
    return convert(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 !== 0 ? ' ' + convert(n % 10000000) : '');
  }

  const rounded = Math.round(Number(num) || 0);
  if (rounded === 0) return 'Rupees Zero Only';
  return 'Rupees ' + convert(rounded) + ' Only';
}

function paymentModeLabel(order) {
  if (order.paymentMethod === 'cod') return 'Cash on Delivery';
  if (order.paymentMethod === 'direct') {
    return order.status === 'awaiting-payment'
      ? 'UPI / Bank Transfer (Pending)'
      : 'UPI / Direct Bank Transfer';
  }
  return 'Online (UPI / Cards / Netbanking)';
}

function getProductHsn(item) {
  if (item.hsn) return String(item.hsn);
  const typeKey = normalizeProductType(item.productType, item.category);
  return HSN_MAP[typeKey] || HSN_MAP[String(item.productType).toLowerCase()] || '49119100';
}

function getProductGstRate(item) {
  const typeKey = normalizeProductType(item.productType, item.category);
  const cfg = PRODUCT_TYPES[typeKey] || PRODUCT_TYPES.generic;
  return (cfg && cfg.gstRate != null) ? cfg.gstRate : 0.18;
}

// ── Main Invoice Drawing Function ──────────────────────────────────────────
function drawInvoice(pdfDoc, order) {
  // Disable automatic bottom margin page-breaks so footers and full page flow precisely
  if (pdfDoc.page && pdfDoc.page.margins) {
    pdfDoc.page.margins.bottom = 0;
  }

  const PAGE_W = pdfDoc.page.width || 595.28;
  const PAGE_H = pdfDoc.page.height || 841.89;
  const MARGIN_LEFT = 36;
  const MARGIN_RIGHT = 36;
  const CONTENT_W = PAGE_W - MARGIN_LEFT - MARGIN_RIGHT; // 523.28
  const MAX_CONTENT_Y = PAGE_H - 45;

  const invoiceNumber = order.invoiceNumber || order.orderId;
  const { d: createdAtDate, dateStr: istDateStr, formattedStr: istDateFull } = parseIstDate(order.createdAt);
  const isPreReg = isPreGstRegistration(createdAtDate);

  const customerStateInfo = resolveStateCode(order.customer && order.customer.state);
  const isIntrastate = customerStateInfo.stateCode === '10'; // Bihar to Bihar
  const placeOfSupplyText = `${customerStateInfo.stateName} (State Code: ${customerStateInfo.stateCode})`;

  // Order Discounts
  const subtotal = Number(order.subtotal || 0);
  const launchDiscount = Number(order.launchDiscount || 0);
  const bundleDiscount = Number(order.bundleDiscount || 0);
  const couponDiscount = Number(order.couponDiscount || 0);
  const flatDiscount = (order.launchDiscount == null && order.couponDiscount == null && order.discount) ? Number(order.discount) : 0;
  const totalDiscount = Math.max(0, launchDiscount + bundleDiscount + couponDiscount + flatDiscount);
  const discountShare = subtotal > 0 ? (totalDiscount / subtotal) : 0;

  const netGoodsGross = Math.max(0, Math.round((subtotal - totalDiscount) * 100) / 100);

  // Goods Taxable & GST (18% inclusive shelf pricing)
  const orderTaxableGoods = isPreReg ? netGoodsGross : Math.round((netGoodsGross / 1.18) * 100) / 100;

  // Ancillary supplies under Section 15(2)(c) of CGST Act (shipping & handling form part of value of supply)
  const shipping = Number(order.shipping || 0);
  const deliverySurcharge = Number(order.deliverySurcharge || 0);
  const processingFee = Number(order.processingFee || 0);
  const codFee = Number(order.codFee || 0);

  const taxableShipping = isPreReg ? shipping : Math.round((shipping / 1.18) * 100) / 100;
  const taxableHandling = isPreReg ? processingFee : Math.round((processingFee / 1.18) * 100) / 100;
  const taxableSurcharge = isPreReg ? deliverySurcharge : Math.round((deliverySurcharge / 1.18) * 100) / 100;
  const taxableCod = isPreReg ? codFee : Math.round((codFee / 1.18) * 100) / 100;

  const totalTaxable = Math.round((orderTaxableGoods + taxableShipping + taxableHandling + taxableSurcharge + taxableCod) * 100) / 100;

  // Under Section 15(2)(c), total GST is assessed at 18% on the composite taxable supply
  const totalGst = isPreReg ? 0 : Math.round((totalTaxable * 0.18) * 100) / 100;
  const gstShipping = isPreReg ? 0 : Math.round((taxableShipping * 0.18) * 100) / 100;
  const gstHandling = isPreReg ? 0 : Math.round((taxableHandling * 0.18) * 100) / 100;
  const gstSurcharge = isPreReg ? 0 : Math.round((taxableSurcharge * 0.18) * 100) / 100;
  const gstCod = isPreReg ? 0 : Math.round((taxableCod * 0.18) * 100) / 100;
  const orderGstGoods = isPreReg ? 0 : Math.round((totalGst - gstShipping - gstHandling - gstSurcharge - gstCod) * 100) / 100;

  const compTotalBeforeRound = Math.round((totalTaxable + totalGst) * 100) / 100;
  const finalPayable = Number(order.total != null ? order.total : Math.round(compTotalBeforeRound));
  const roundOff = Math.round((finalPayable - compTotalBeforeRound) * 100) / 100;

  // Exact residual allocation across line items so sum(line) === order-level down to the exact paisa
  const rawItems = order.items || [];
  let allocatedDiscount = 0;
  let allocatedTaxable = 0;
  let allocatedGst = 0;

  const itemLines = rawItems.map((item, idx) => {
    const qty = Number(item.quantity) || 1;
    const unitPrice = Number(item.price) || 0;
    const lineTotal = item.subtotal != null ? Number(item.subtotal) : (unitPrice * qty);

    let lineDiscount = 0;
    if (idx === rawItems.length - 1) {
      lineDiscount = Math.round((totalDiscount - allocatedDiscount) * 100) / 100;
    } else {
      lineDiscount = Math.round((lineTotal * discountShare) * 100) / 100;
      allocatedDiscount += lineDiscount;
    }

    const netItemValue = Math.max(0, Math.round((lineTotal - lineDiscount) * 100) / 100);
    const hsn = getProductHsn(item);
    const gstRate = isPreReg ? 0 : getProductGstRate(item);

    let taxableVal = 0;
    let taxAmt = 0;
    if (idx === rawItems.length - 1) {
      taxableVal = Math.round((orderTaxableGoods - allocatedTaxable) * 100) / 100;
      taxAmt = isPreReg ? 0 : Math.round((orderGstGoods - allocatedGst) * 100) / 100;
    } else {
      taxableVal = (gstRate > 0)
        ? Math.round((netItemValue / (1 + gstRate)) * 100) / 100
        : netItemValue;
      taxAmt = isPreReg ? 0 : Math.round((taxableVal * gstRate) * 100) / 100;
      allocatedTaxable += taxableVal;
      allocatedGst += taxAmt;
    }

    const finalLineTotal = isPreReg ? netItemValue : Math.round((taxableVal + taxAmt) * 100) / 100;

    return {
      name: cleanPdfText(item.name || 'Poster'),
      sku: cleanPdfText(item.sku || (item.productId ? String(item.productId) : '')),
      variants: cleanPdfText(formatVariantLine(item)),
      customPosters: item.customPosters,
      hsn,
      qty,
      unitPrice,
      lineTotal,
      lineDiscount,
      taxableVal,
      gstRate,
      taxAmt,
      netItemValue: finalLineTotal
    };
  });

  function drawFooter() {
    const footerY = PAGE_H - 26;
    pdfDoc.font('Helvetica').fontSize(6.5).fillColor('#a0aec0')
      .text('This is a computer-generated tax invoice issued in accordance with Section 31 of the Central Goods and Services Tax Act, 2017 & Indian Contract Act.', MARGIN_LEFT, footerY, { width: CONTENT_W, align: 'center', lineBreak: false });
    pdfDoc.font('Helvetica').fontSize(6.5).fillColor('#718096')
      .text(`Patliputra Traders · GSTIN: ${COMPANY.gstin} · Email: ${COMPANY.email} · Phone: ${COMPANY.phone}`, MARGIN_LEFT, footerY + 8, { width: CONTENT_W, align: 'center', lineBreak: false });
  }

  // ---- Page header renderer ----
  function renderHeader(isFirstPage) {
    pdfDoc.rect(0, 0, PAGE_W, 74).fill('#000000');

    if (fs.existsSync(LOGO_PATH)) {
      try {
        pdfDoc.image(LOGO_PATH, MARGIN_LEFT, 20, { width: 100 });
      } catch (_) {
        pdfDoc.fontSize(22).font('Helvetica-Bold').fillColor('#dfa84a').text('Patliputra Traders', MARGIN_LEFT, 22);
      }
    } else {
      pdfDoc.fontSize(22).font('Helvetica-Bold').fillColor('#dfa84a').text('Patliputra Traders', MARGIN_LEFT, 22);
    }

    pdfDoc.fontSize(7.5).font('Helvetica').fillColor('#c9c2b0').text(COMPANY.brandLine, MARGIN_LEFT, 56);

    const headerTitle = isPreReg ? 'BILL OF SUPPLY / INVOICE' : 'TAX INVOICE';
    const headerSub = isPreReg ? '(Pre-GST Registration Transaction)' : 'Original for Recipient';

    pdfDoc.fontSize(15).font('Helvetica-Bold').fillColor('#faf3e3')
      .text(headerTitle, PAGE_W - MARGIN_RIGHT - 260, 20, { width: 260, align: 'right' });
    pdfDoc.fontSize(8).font('Helvetica').fillColor('#e2e8f0')
      .text(headerSub, PAGE_W - MARGIN_RIGHT - 260, 40, { width: 260, align: 'right' });
    pdfDoc.fontSize(7.5).font('Helvetica').fillColor('#a0aec0')
      .text('Issued under Section 31 of CGST Act, 2017', PAGE_W - MARGIN_RIGHT - 260, 54, { width: 260, align: 'right' });
  }

  renderHeader(true);

  let curY = 84;

  // ---- Pre-registration review banner ----
  if (isPreReg) {
    pdfDoc.rect(MARGIN_LEFT, curY, CONTENT_W, 24).fillAndStroke('#fffaf0', '#fbd38d');
    pdfDoc.fillColor('#975a16').font('Helvetica-Bold').fontSize(8)
      .text('PRE-REGISTRATION TRANSACTION — Subject to Manual GST Review', MARGIN_LEFT + 8, curY + 4);
    pdfDoc.font('Helvetica').fontSize(7).fillColor('#744210')
      .text(`Order placed on ${istDateFull} prior to GST registration effective date (19 October 2026). Preserved as pre-registration supply. No GST charged.`, MARGIN_LEFT + 8, curY + 13, { width: CONTENT_W - 16 });
    curY += 28;
  }

  // ---- Two Column Meta: Supplier & Invoice/Order Meta ----
  const metaBoxY = curY;
  const colW = (CONTENT_W - 10) / 2;
  const metaBoxH = 94;

  // Supplier Card (Left)
  pdfDoc.rect(MARGIN_LEFT, metaBoxY, colW, metaBoxH).strokeColor('#e2e8f0').stroke();
  pdfDoc.rect(MARGIN_LEFT, metaBoxY, colW, 16).fill('#f7fafc');
  pdfDoc.font('Helvetica-Bold').fontSize(8).fillColor('#2d3748').text('SUPPLIER DETAILS (From):', MARGIN_LEFT + 8, metaBoxY + 4);

  let supY = metaBoxY + 20;
  pdfDoc.font('Helvetica-Bold').fontSize(9).fillColor('#1a202c').text(COMPANY.legalName, MARGIN_LEFT + 8, supY);
  supY += 11;
  pdfDoc.font('Helvetica').fontSize(7.5).fillColor('#4a5568')
    .text(`${COMPANY.designation} · Brand: ${COMPANY.brand}`, MARGIN_LEFT + 8, supY);
  supY += 10;
  pdfDoc.font('Helvetica-Bold').fontSize(7.5).fillColor('#2b6cb0')
    .text(`GSTIN: ${COMPANY.gstin}`, MARGIN_LEFT + 8, supY);
  supY += 10;
  pdfDoc.font('Helvetica').fontSize(7).fillColor('#4a5568')
    .text(COMPANY.registeredAddress, MARGIN_LEFT + 8, supY, { width: colW - 16, height: 22 });
  supY += 22;
  pdfDoc.font('Helvetica').fontSize(7).fillColor('#4a5568')
    .text(`State: ${COMPANY.state} (State Code: ${COMPANY.stateCode}) · Phone: ${COMPANY.phone}`, MARGIN_LEFT + 8, supY);
  supY += 9;
  pdfDoc.text(`Email: ${COMPANY.email}`, MARGIN_LEFT + 8, supY);

  // Invoice & Order Meta Card (Right)
  const metaRightX = MARGIN_LEFT + colW + 10;
  pdfDoc.rect(metaRightX, metaBoxY, colW, metaBoxH).strokeColor('#e2e8f0').stroke();
  pdfDoc.rect(metaRightX, metaBoxY, colW, 16).fill('#f7fafc');
  pdfDoc.font('Helvetica-Bold').fontSize(8).fillColor('#2d3748').text('INVOICE & ORDER DETAILS:', metaRightX + 8, metaBoxY + 4);

  const drawMetaRow = (label, val, rowY, isBoldVal = false) => {
    pdfDoc.font('Helvetica-Bold').fontSize(7.5).fillColor('#4a5568').text(label, metaRightX + 8, rowY, { width: 85 });
    pdfDoc.font(isBoldVal ? 'Helvetica-Bold' : 'Helvetica').fontSize(7.5).fillColor('#1a202c').text(val, metaRightX + 92, rowY, { width: colW - 98 });
  };

  drawMetaRow('Invoice No.:', String(invoiceNumber), metaBoxY + 20, true);
  drawMetaRow('Invoice Date:', `${istDateStr} (${istDateFull})`, metaBoxY + 30);
  drawMetaRow('Order ID:', String(order.orderId), metaBoxY + 40);
  drawMetaRow('Place of Supply:', placeOfSupplyText, metaBoxY + 50);
  drawMetaRow('Supply Nature:', isPreReg ? 'Pre-Registration' : (isIntrastate ? 'Intrastate (CGST + SGST)' : 'Interstate (IGST)'), metaBoxY + 60);
  drawMetaRow('Payment Mode:', paymentModeLabel(order), metaBoxY + 70);
  drawMetaRow('Amount Payable:', money(finalPayable), metaBoxY + 80, true);

  curY = metaBoxY + metaBoxH + 6;

  // ---- Customer Details (Bill To / Ship To) ----
  const billBoxH = 42;
  pdfDoc.rect(MARGIN_LEFT, curY, CONTENT_W, billBoxH).strokeColor('#e2e8f0').stroke();
  pdfDoc.rect(MARGIN_LEFT, curY, CONTENT_W, 14).fill('#f7fafc');
  pdfDoc.font('Helvetica-Bold').fontSize(8).fillColor('#2d3748').text('BILL TO & SHIP TO (Recipient):', MARGIN_LEFT + 8, curY + 3);

  const custName = cleanPdfText((order.customer && order.customer.name) || 'Customer');
  const custAddr = cleanPdfText((order.customer && order.customer.address) || '');
  const custLoc = cleanPdfText(`${(order.customer && order.customer.city) || ''}, ${(order.customer && order.customer.state) || ''} - ${(order.customer && order.customer.pincode) || ''}`);
  const custGstin = (order.customer && order.customer.gstin) ? `GSTIN: ${cleanPdfText(order.customer.gstin)}` : 'GSTIN / Status: URP (Unregistered Person)';
  const custContact = `Phone: ${cleanPdfText((order.customer && order.customer.phone) || '—')} | Email: ${cleanPdfText((order.customer && order.customer.email) || '—')}`;

  pdfDoc.font('Helvetica-Bold').fontSize(8).fillColor('#1a202c').text(custName, MARGIN_LEFT + 8, curY + 17);
  pdfDoc.font('Helvetica').fontSize(7).fillColor('#4a5568')
    .text(`${custAddr}, ${custLoc} · ${customerStateInfo.stateName} (State Code: ${customerStateInfo.stateCode})`, MARGIN_LEFT + 8, curY + 26, { width: CONTENT_W - 16, ellipsis: true });
  pdfDoc.text(`${custGstin} · ${custContact}`, MARGIN_LEFT + 8, curY + 34, { width: CONTENT_W - 16, ellipsis: true });

  curY += billBoxH + 6;

  // ---- Table Columns Geometry ----
  // CONTENT_W = 523.28
  const COLS = [
    { key: 'idx', label: '#', w: 18, align: 'center' },
    { key: 'desc', label: 'Item Description & SKU', w: 166, align: 'left' },
    { key: 'hsn', label: 'HSN / SAC', w: 52, align: 'center' },
    { key: 'qty', label: 'Qty', w: 22, align: 'center' },
    { key: 'rate', label: 'Rate (Rs)', w: 44, align: 'right' },
    { key: 'disc', label: 'Disc (Rs)', w: 42, align: 'right' },
    { key: 'taxable', label: 'Taxable (Rs)', w: 49, align: 'right' },
    { key: 'gstrate', label: 'GST %', w: 34, align: 'right' },
    { key: 'taxamt', label: 'GST (Rs)', w: 42, align: 'right' },
    { key: 'total', label: 'Total (Rs)', w: 54, align: 'right' }
  ];

  function drawTableHeader(yPos) {
    pdfDoc.rect(MARGIN_LEFT, yPos, CONTENT_W, 16).fillAndStroke('#2d3748', '#1a202c');
    pdfDoc.font('Helvetica-Bold').fontSize(7.5).fillColor('#ffffff');

    let x = MARGIN_LEFT;
    COLS.forEach(col => {
      pdfDoc.text(col.label, x + 2, yPos + 4, { width: col.w - 4, align: col.align });
      x += col.w;
    });
    return yPos + 16;
  }

  curY = drawTableHeader(curY);

  // ---- Draw Item Rows ----
  itemLines.forEach((item, index) => {
    const hasCustom = Array.isArray(item.customPosters) && item.customPosters.length > 0;
    const baseRowH = item.variants ? 25 : 19;
    const customH = hasCustom ? (14 + item.customPosters.length * 11) : 0;
    const totalRowH = baseRowH + customH;

    // Check page overflow
    if (curY + totalRowH > MAX_CONTENT_Y) {
      drawFooter();
      pdfDoc.addPage();
      if (pdfDoc.page && pdfDoc.page.margins) pdfDoc.page.margins.bottom = 0;
      renderHeader(false);
      curY = 84;
      curY = drawTableHeader(curY);
    }

    // Zebra striping
    if (index % 2 === 1) {
      pdfDoc.rect(MARGIN_LEFT, curY, CONTENT_W, totalRowH).fill('#fbfcfd');
    }

    let x = MARGIN_LEFT;

    // S.No
    pdfDoc.font('Helvetica').fontSize(7.5).fillColor('#4a5568')
      .text(String(index + 1), x, curY + 3, { width: COLS[0].w, align: 'center' });
    x += COLS[0].w;

    // Description & SKU
    pdfDoc.font('Helvetica-Bold').fontSize(7.5).fillColor('#1a202c')
      .text(item.name, x + 2, curY + 3, { width: COLS[1].w - 4, height: 9, ellipsis: true });
    let subDetailY = curY + 12;
    if (item.variants) {
      pdfDoc.font('Helvetica').fontSize(6.5).fillColor('#718096')
        .text(item.variants, x + 2, subDetailY, { width: COLS[1].w - 4, height: 8, ellipsis: true });
      subDetailY += 8;
    }
    if (item.sku) {
      pdfDoc.font('Helvetica-Bold').fontSize(6).fillColor('#2b6cb0')
        .text(`SKU: ${item.sku}`, x + 2, subDetailY, { width: COLS[1].w - 4, height: 7, ellipsis: true });
    }
    x += COLS[1].w;

    // HSN
    pdfDoc.font('Helvetica').fontSize(7).fillColor('#4a5568')
      .text(item.hsn, x, curY + 3, { width: COLS[2].w, align: 'center' });
    x += COLS[2].w;

    // Qty
    pdfDoc.font('Helvetica-Bold').fontSize(7.5).fillColor('#1a202c')
      .text(String(item.qty), x, curY + 3, { width: COLS[3].w, align: 'center' });
    x += COLS[3].w;

    // Rate
    pdfDoc.font('Helvetica').fontSize(7).fillColor('#4a5568')
      .text(item.unitPrice.toFixed(2), x, curY + 3, { width: COLS[4].w - 4, align: 'right' });
    x += COLS[4].w;

    // Discount
    pdfDoc.font('Helvetica').fontSize(7).fillColor(item.lineDiscount > 0 ? '#c53030' : '#a0aec0')
      .text(item.lineDiscount > 0 ? `-${item.lineDiscount.toFixed(2)}` : '0.00', x, curY + 3, { width: COLS[5].w - 4, align: 'right' });
    x += COLS[5].w;

    // Taxable Value
    pdfDoc.font('Helvetica-Bold').fontSize(7.5).fillColor('#2d3748')
      .text(item.taxableVal.toFixed(2), x, curY + 3, { width: COLS[6].w - 4, align: 'right' });
    x += COLS[6].w;

    // GST %
    pdfDoc.font('Helvetica').fontSize(7).fillColor('#4a5568')
      .text(isPreReg ? '0%' : `${Math.round(item.gstRate * 100)}%`, x, curY + 3, { width: COLS[7].w - 4, align: 'right' });
    x += COLS[7].w;

    // GST Amount
    pdfDoc.font('Helvetica').fontSize(7).fillColor('#4a5568')
      .text(isPreReg ? '0.00' : item.taxAmt.toFixed(2), x, curY + 3, { width: COLS[8].w - 4, align: 'right' });
    x += COLS[8].w;

    // Total
    pdfDoc.font('Helvetica-Bold').fontSize(7.5).fillColor('#1a202c')
      .text(item.netItemValue.toFixed(2), x, curY + 3, { width: COLS[9].w - 4, align: 'right' });

    // Pack breakdown if custom posters
    if (hasCustom) {
      let py = curY + baseRowH;
      pdfDoc.font('Helvetica-Bold').fontSize(6.5).fillColor('#4a5568')
        .text(`Pack Breakdown (${item.customPosters.length} Posters Included):`, MARGIN_LEFT + COLS[0].w + 4, py);
      py += 9;
      item.customPosters.forEach((p, pIdx) => {
        const pTitle = cleanPdfText(p.name || p.title || `Poster ${pIdx + 1}`);
        const pSize = cleanPdfText(p.size || 'A5');
        const pSku = cleanPdfText(p.sku || (p.id ? String(p.id) : ''));
        pdfDoc.font('Helvetica').fontSize(6).fillColor('#718096')
          .text(`${pIdx + 1}. ${pTitle} (Size: ${pSize}) ${pSku ? '· SKU: ' + pSku : ''}`, MARGIN_LEFT + COLS[0].w + 10, py, { width: COLS[1].w + COLS[2].w, ellipsis: true });
        py += 10;
      });
    }

    curY += totalRowH;
    pdfDoc.moveTo(MARGIN_LEFT, curY).lineTo(MARGIN_LEFT + CONTENT_W, curY).strokeColor('#edf2f7').stroke();
  });

  // ---- Summary & Signatory Section ----
  const summaryBoxH = 142;
  if (curY + summaryBoxH > MAX_CONTENT_Y) {
    drawFooter();
    pdfDoc.addPage();
    if (pdfDoc.page && pdfDoc.page.margins) pdfDoc.page.margins.bottom = 0;
    renderHeader(false);
    curY = 84;
  }

  curY += 6;
  const summaryTopY = curY;

  // Left Side: Amount in Words & Payment Settlement Details
  const leftW = 285;
  pdfDoc.rect(MARGIN_LEFT, summaryTopY, leftW, summaryBoxH).strokeColor('#e2e8f0').stroke();

  // Amount in Words
  pdfDoc.rect(MARGIN_LEFT, summaryTopY, leftW, 14).fill('#f7fafc');
  pdfDoc.font('Helvetica-Bold').fontSize(7.5).fillColor('#2d3748').text('TOTAL AMOUNT IN WORDS:', MARGIN_LEFT + 8, summaryTopY + 3);
  pdfDoc.font('Helvetica-Bold').fontSize(7.5).fillColor('#1a202c')
    .text(numberToWords(finalPayable), MARGIN_LEFT + 8, summaryTopY + 18, { width: leftW - 16, height: 20 });

  // Payment Confirmation & Settlement Box (Without exposing personal savings bank details on prepaid orders)
  const isPaid = order.paymentMethod !== 'cod' &&
                 order.status !== 'awaiting-payment' &&
                 order.status !== 'cancelled';

  const payBoxY = summaryTopY + 40;
  pdfDoc.rect(MARGIN_LEFT, payBoxY, leftW, 13).fill('#edf2f7');
  pdfDoc.font('Helvetica-Bold').fontSize(7).fillColor('#2d3748')
    .text(isPaid ? 'PAYMENT CONFIRMATION & SETTLEMENT:' : (order.paymentMethod === 'cod' ? 'CASH ON DELIVERY TERMS:' : 'PAYMENT INSTRUCTIONS:'), MARGIN_LEFT + 8, payBoxY + 3);

  pdfDoc.font('Helvetica').fontSize(7).fillColor('#4a5568');
  if (isPaid) {
    pdfDoc.text('Payment Status: PAID IN FULL (Electronic Remittance)', MARGIN_LEFT + 8, payBoxY + 16);
    pdfDoc.text(`Payment Mode: ${paymentModeLabel(order)}`, MARGIN_LEFT + 8, payBoxY + 25);
    pdfDoc.text('Gateway Settlement: Transaction authorized & settled online', MARGIN_LEFT + 8, payBoxY + 34);
    pdfDoc.text('Note: This is a paid tax invoice. No further remittance is required.', MARGIN_LEFT + 8, payBoxY + 43);
  } else if (order.paymentMethod === 'cod') {
    pdfDoc.text('Payment Status: Unpaid / Cash on Delivery (COD)', MARGIN_LEFT + 8, payBoxY + 16);
    pdfDoc.text(`Amount Collectible: ${money(finalPayable)} upon delivery`, MARGIN_LEFT + 8, payBoxY + 25);
    pdfDoc.text('Please tender exact cash or pay the delivery agent via UPI QR on delivery.', MARGIN_LEFT + 8, payBoxY + 34);
  } else {
    // Direct Transfer / Awaiting Payment (Masked account number for privacy)
    pdfDoc.text(`Bank Name: ${COMPANY.bankName} · Branch: ${COMPANY.bankBranch}`, MARGIN_LEFT + 8, payBoxY + 16);
    pdfDoc.text(`Account Holder: ${COMPANY.bankAccountHolder}`, MARGIN_LEFT + 8, payBoxY + 25);
    pdfDoc.text(`Account Number: ******${String(COMPANY.bankAccountNumber).slice(-4)} (${COMPANY.bankAccountType})`, MARGIN_LEFT + 8, payBoxY + 34);
    pdfDoc.text(`IFSC: ${COMPANY.bankIfsc}`, MARGIN_LEFT + 8, payBoxY + 43);
  }

  // Authorised Signatory Block (Right side of left card)
  const sigY = payBoxY + 66;
  if (fs.existsSync(SIGNATURE_IMAGE_PATH)) {
    try {
      pdfDoc.image(SIGNATURE_IMAGE_PATH, MARGIN_LEFT + 155, sigY - 2, { width: 85, height: 22, fit: [85, 22] });
    } catch (_) {}
  } else if (fs.existsSync(SIGNATURE_FONT_PATH)) {
    try {
      pdfDoc.font(SIGNATURE_FONT_PATH).fontSize(18).fillColor('#1a3d8f')
        .text(SIGNATORY_NAME, MARGIN_LEFT + 145, sigY - 6, { width: 110 });
    } catch (_) {}
  }
  pdfDoc.moveTo(MARGIN_LEFT + 145, sigY + 20).lineTo(MARGIN_LEFT + 275, sigY + 20).strokeColor('#cbd5e0').stroke();
  pdfDoc.font('Helvetica-Bold').fontSize(7).fillColor('#2d3748')
    .text(SIGNATORY_NAME, MARGIN_LEFT + 145, sigY + 22, { width: 130 });
  pdfDoc.font('Helvetica').fontSize(6).fillColor('#718096')
    .text(`${COMPANY.designation} · ${COMPANY.brand}`, MARGIN_LEFT + 145, sigY + 30, { width: 130 });

  // Right Side: Tax Summary & Final Payable
  const rightX = MARGIN_LEFT + leftW + 6;
  const rightW = CONTENT_W - leftW - 6;
  pdfDoc.rect(rightX, summaryTopY, rightW, summaryBoxH).strokeColor('#e2e8f0').stroke();

  pdfDoc.rect(rightX, summaryTopY, rightW, 14).fill('#f7fafc');
  pdfDoc.font('Helvetica-Bold').fontSize(7.5).fillColor('#2d3748').text('TAX INVOICE SUMMARY:', rightX + 8, summaryTopY + 3);

  let sumRowY = summaryTopY + 17;
  const drawSummaryLine = (lbl, val, isBold = false, isAccent = false) => {
    pdfDoc.font(isBold ? 'Helvetica-Bold' : 'Helvetica').fontSize(7)
      .fillColor(isAccent ? '#c53030' : '#4a5568')
      .text(lbl, rightX + 8, sumRowY, { width: rightW - 75 });
    pdfDoc.font(isBold ? 'Helvetica-Bold' : 'Helvetica').fontSize(7)
      .fillColor(isAccent ? '#c53030' : '#1a202c')
      .text(val, rightX + rightW - 68, sumRowY, { width: 60, align: 'right' });
    sumRowY += 10.5;
  };

  drawSummaryLine('Product Subtotal (Gross):', money(subtotal));

  if (launchDiscount > 0) drawSummaryLine('Less: Launch Offer:', `-${money(launchDiscount)}`, false, true);
  if (bundleDiscount > 0) drawSummaryLine('Less: Buy5Get1 / Combo:', `-${money(bundleDiscount)}`, false, true);
  if (couponDiscount > 0) drawSummaryLine('Less: Coupon Discount:', `-${money(couponDiscount)}`, false, true);
  if (flatDiscount > 0) drawSummaryLine('Less: Flat Discount:', `-${money(flatDiscount)}`, false, true);

  drawSummaryLine('Taxable Value of Goods:', money(orderTaxableGoods));

  // Section 15(2)(c) Ancillary services (Delivery & Handling)
  if (shipping > 0) {
    drawSummaryLine('Shipping & Delivery (Taxable):', money(taxableShipping));
  } else {
    drawSummaryLine('Shipping & Delivery:', 'FREE');
  }

  if (processingFee > 0) {
    drawSummaryLine('Handling / Packaging (Taxable):', money(taxableHandling));
  }

  if (deliverySurcharge > 0) drawSummaryLine('Express Delivery (Taxable):', money(taxableSurcharge));
  if (codFee > 0) drawSummaryLine('Cash on Delivery Fee (Taxable):', money(taxableCod));

  drawSummaryLine('Total Net Taxable Value:', money(totalTaxable), true);

  if (isPreReg) {
    drawSummaryLine('Total GST (Pre-Registration):', 'Rs. 0.00', true);
  } else if (isIntrastate) {
    const halfTax = Math.round(totalGst / 2 * 100) / 100;
    drawSummaryLine('Add: CGST (9%):', money(halfTax));
    drawSummaryLine('Add: SGST (9%):', money(halfTax));
    drawSummaryLine('Total GST Amount:', money(totalGst), true);
  } else {
    drawSummaryLine('Add: IGST (18%):', money(totalGst));
    drawSummaryLine('Total GST Amount:', money(totalGst), true);
  }

  if (roundOff !== 0) {
    const sign = roundOff > 0 ? '+' : '-';
    drawSummaryLine('Round Off Adjustment:', `${sign}Rs. ${Math.abs(roundOff).toFixed(2)}`);
  }

  // Final Total Bar
  const totalBarH = 22;
  pdfDoc.rect(rightX, summaryTopY + summaryBoxH - totalBarH, rightW, totalBarH).fill('#2d3748');
  pdfDoc.font('Helvetica-Bold').fontSize(8.5).fillColor('#ffffff')
    .text('TOTAL INVOICE VALUE:', rightX + 8, summaryTopY + summaryBoxH - totalBarH + 6);
  pdfDoc.font('Helvetica-Bold').fontSize(10.5).fillColor('#ffffff')
    .text(money(finalPayable), rightX + rightW - 90, summaryTopY + summaryBoxH - totalBarH + 5, { width: 82, align: 'right' });

  // ---- PAID Watermark (for paid orders) ----
  if (isPaid) {
    pdfDoc.save()
      .translate(PAGE_W / 2 - 80, PAGE_H / 2)
      .rotate(-25)
      .fontSize(90)
      .fillColor('#cbd5e0')
      .fillOpacity(0.18)
      .text('PAID', 0, 0, { width: 220, align: 'center' })
      .restore();
    pdfDoc.fillOpacity(1);
  }

  // Draw footer on last page
  drawFooter();
}

module.exports = {
  COMPANY,
  drawInvoice,
  resolveStateCode,
  parseIstDate,
  isPreGstRegistration,
  numberToWords,
  paymentModeLabel
};
