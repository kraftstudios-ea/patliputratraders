// Builds the HTML/text order-status email sent to customers, styled after
// standard e-commerce order-update emails (progress tracker, delivery box,
// itemized list) and populated from the real order document.

const { formatVariantLine, normalizeProductType } = require('./productTypes');

const DIGITAL_DOWNLOAD_MAP = {
  'neo-pop-icons': { name: 'Neo Pop 3D Icon Pack', file: 'neo-pop-3d-icons-v1.zip' },
  'retro-cartoons': { name: 'Retro Toon Character Vectors', file: 'retro-toon-characters-v1.zip' },
  'botanical-line-art': { name: 'Botanical & Floral Hand-Drawn Vectors', file: 'botanical-floral-vectors-v1.zip' },
  'cyberpunk-ui-kit': { name: 'Cyberpunk HUD & Tech Vectors', file: 'cyberpunk-hud-tech-vectors-v1.zip' },
  'lofi-lifestyle-scenes': { name: 'Lo-Fi Cozy Lifestyle Digital Illustrations', file: 'lofi-lifestyle-scenes-v1.zip' },
  'anime-stickers-vectors': { name: 'Chibi & Anime Redrawn Vector Characters', file: 'chibi-anime-characters-v1.zip' }
};

function getDownloadUrl(item, siteUrl) {
  if (item.downloadUrl) return item.downloadUrl;
  const slug = String(item.slug || (item.sku ? item.sku.replace(/^DIG-/, '').toLowerCase() : '') || '').toLowerCase();
  const info = DIGITAL_DOWNLOAD_MAP[slug];
  const filename = info ? info.file : (slug ? `${slug}-assets.zip` : 'digital-assets.zip');
  return `${siteUrl.replace(/\/$/, '')}/downloads/${filename}`;
}

const STATUS_STEPS = ['confirmed', 'sent-for-printing', 'packed', 'shipped', 'transit', 'delivered'];

const STATUS_META = {
  // The shopper has transferred the money and told us the reference; we have
  // not yet matched it against the bank. Deliberately worded so nobody reads
  // it as "your order is on its way" — nothing is made until it clears.
  'awaiting-payment': {
    label: 'Payment Pending',
    heading: 'Order Placed — Payment Pending',
    message: 'Thanks — we have your order. We are checking your transfer against our bank, and will email you again the moment it clears. Your lighting fixtures are reserved for you.'
  },
  confirmed: {
    label: 'Order Placed',
    heading: 'Order Placed',
    message: 'Your lighting fixture order has been successfully placed with Patliputra Traders.'
  },
  'payment-confirmed': {
    label: 'Payment Confirmed',
    heading: 'Payment Received — Order Confirmed',
    message: 'We have matched your transfer — thank you. Your order is confirmed and scheduled for showroom inspection and dispatch.'
  },
  'sent-for-printing': {
    label: 'In Preparation',
    heading: 'Showroom Preparation',
    message: 'Your lighting fixtures are undergoing electrical inspection, component testing, and protective packaging.'
  },
  printing: {
    label: 'In Preparation',
    heading: 'Showroom Preparation',
    message: 'Your lighting fixtures are undergoing electrical inspection, component testing, and protective packaging.'
  },
  packed: {
    label: 'Order Packed',
    heading: 'Order Packed',
    message: 'Your fixtures have been securely boxed in multi-layer shockproof crating with fragile luminaire labels.'
  },
  shipped: {
    label: 'Order Shipped',
    heading: 'Order Shipped',
    message: 'Your order is on its way!'
  },
  transit: {
    label: 'In Transit',
    heading: 'Order in Transit',
    message: 'Your order is currently in transit to your address.'
  },
  delivered: {
    label: 'Order Delivered',
    heading: 'Order Delivered',
    message: 'Your order has been delivered. We hope you love it!'
  },
  cancelled: {
    label: 'Order Cancelled',
    heading: 'Order Cancelled',
    message: 'Your order has been cancelled.'
  }
};

const BRAND_ACCENT = '#ff9f29';
const BRAND_BLACK = '#000000';
const BRAND_CREAM = '#faf3e3';
const BORDER = '#ececec';
const TEXT_MUTED = '#767676';
const TEXT_PRIMARY = '#1a1a1a';

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(value, opts) {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', opts);
}

function money(n) {
  return `Rs. ${Number(n || 0).toFixed(2)}`;
}

function absoluteUrl(siteUrl, relativePath) {
  if (!relativePath) return '';
  // Absolute URLs and inline (cid:) attachments pass straight through — only
  // site-relative paths get joined and rewritten below.
  if (/^(https?:\/\/|cid:|data:)/i.test(relativePath)) return relativePath;

  let path = String(relativePath).replace(/^\//, '');
  // For product images, use the 480px WebP thumbnail instead of the full print-ready PNG/JPG
  if (/^(assets\/|posters\/|uploads\/)/.test(path) && !path.startsWith('img/') && !path.startsWith('assets/misc/')) {
    path = `img/w480/${path.replace(/\.(png|jpe?g)$/i, '.webp')}`;
  }

  // Ensure public host is used so Gmail/Apple Mail image proxies can load email assets
  const publicBase = (siteUrl && !siteUrl.includes('localhost') && !siteUrl.includes('127.0.0.1'))
    ? siteUrl.replace(/\/$/, '')
    : 'https://www.brush-art.in';

  const joined = `${publicBase}/${path}`;
  return encodeURI(joined);
}

function renderStepper(status, accent) {
  // Cancelled or unknown: no stepper. Awaiting payment is shown as the full
  // journey with nothing lit yet — the order exists, but it has not started.
  const norm = status === 'printing' ? 'sent-for-printing' : status;
  if (norm !== 'awaiting-payment' && !STATUS_STEPS.includes(norm)) return '';
  const currentIndex = norm === 'awaiting-payment' ? -1 : STATUS_STEPS.indexOf(norm);
  const stepLabels = ['Placed', 'Printing', 'Packed', 'Shipped', 'Transit', 'Delivered'];

  const cells = [];
  stepLabels.forEach((label, i) => {
    const done = i <= currentIndex;
    const dotColor = done ? accent : '#d9d9d9';
    cells.push(`
      <td width="1" style="padding:0;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr><td
          style="width:14px;height:14px;border-radius:50%;background:${dotColor};font-size:0;line-height:0;">&nbsp;</td></tr></table>
      </td>`);
    if (i < stepLabels.length - 1) {
      const lineColor = i < currentIndex ? accent : '#d9d9d9';
      cells.push(`<td style="padding:0 4px;"><div style="height:2px;background:${lineColor};font-size:0;line-height:0;">&nbsp;</div></td>`);
    }
  });

  const labelCells = stepLabels.map((label, i) => {
    const done = i <= currentIndex;
    return `<td align="${i === 0 ? 'left' : i === stepLabels.length - 1 ? 'right' : 'center'}" style="font-size:11px;font-weight:${done ? '700' : '400'};color:${done ? TEXT_PRIMARY : TEXT_MUTED};padding-top:6px;">${label}</td>`;
  }).join('');

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0 4px;">
      <tr>${cells.join('')}</tr>
    </table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>${labelCells}</tr>
    </table>`;
}

function renderItemsRows(items, siteUrl) {
  return (items || []).map(item => {
    const rawImage = item.image || (item.product && item.product.image) || '';
    const imgUrl = absoluteUrl(siteUrl, rawImage);
    const isDigital = normalizeProductType(item.productType, item.category) === 'digital';
    const downloadUrl = isDigital ? getDownloadUrl(item, siteUrl) : null;
    const thumbnailHtml = imgUrl
      ? `<img src="${escapeHtml(imgUrl)}" width="56" height="56" alt="${escapeHtml(item.name)}" style="display:block;width:56px;height:56px;object-fit:cover;border-radius:6px;border:1px solid ${BORDER};">`
      : `<div style="width:56px;height:56px;border-radius:6px;border:1px solid ${BORDER};background:#f0eee6;line-height:56px;text-align:center;font-size:20px;">🖼️</div>`;

    return `
    <tr>
      <td style="padding:14px 0;border-bottom:1px solid ${BORDER};" width="64">
        ${thumbnailHtml}
      </td>
      <td style="padding:14px 0 14px 14px;border-bottom:1px solid ${BORDER};font-family:Arial,Helvetica,sans-serif;">
        <div style="font-size:14px;font-weight:600;color:${TEXT_PRIMARY};">${escapeHtml(item.name)}</div>
        <div style="font-size:12px;color:${TEXT_MUTED};margin-top:2px;">${escapeHtml(formatVariantLine(item) || (isDigital ? 'Digital Asset · Instant Download' : ''))} &middot; Qty: ${escapeHtml(item.quantity)}</div>
        ${item.sku ? `<div style="font-size:11px;color:#a0aec0;margin-top:2px;">SKU: ${escapeHtml(item.sku)}</div>` : ''}
        ${Array.isArray(item.customPosters) && item.customPosters.length > 0 ? `
          <div style="margin-top:8px;padding:8px 10px;background:#f8fafc;border-radius:6px;border:1px solid #e2e8f0;">
            <div style="font-size:11px;font-weight:700;color:#475569;margin-bottom:4px;">Pack Contents (${item.customPosters.length} Posters):</div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              ${item.customPosters.map((p, idx) => `
                <tr>
                  <td style="font-size:11px;color:#334155;padding:2px 0;">${idx+1}. <strong>${escapeHtml(p.name || p.title || 'Poster')}</strong></td>
                  <td style="font-size:11px;font-weight:600;color:#64748b;text-align:right;padding:2px 0;">Size: ${escapeHtml(p.size || 'A5')}</td>
                </tr>
              `).join('')}
            </table>
          </div>
        ` : ''}
        ${isDigital ? `<div style="margin-top:8px;"><a href="${escapeHtml(downloadUrl)}" style="display:inline-block;background:${BRAND_ACCENT};color:#ffffff;text-decoration:none;font-size:12px;font-weight:700;padding:6px 14px;border-radius:4px;">Download Asset &darr;</a></div>` : ''}
      </td>
      <td align="right" style="padding:14px 0;border-bottom:1px solid ${BORDER};font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;color:${TEXT_PRIMARY};white-space:nowrap;vertical-align:top;">
        ${money(item.subtotal)}
      </td>
    </tr>`;
  }).join('');
}

function buildOrderStatusEmail(order, siteUrl) {
  const status = order.status || 'confirmed';
  // A direct transfer that has just been verified gets the confirmation
  // wording; the stepper still treats it as a normal confirmed order.
  const metaKey = (status === 'confirmed' && order.paymentReference && order.paymentVerifiedAt)
    ? 'payment-confirmed'
    : status;
  const meta = STATUS_META[metaKey] || STATUS_META.confirmed;
  const orderId = order.orderId || order._id;
  const accent = status === 'cancelled' ? '#c62828' : BRAND_ACCENT;
  const logoUrl = absoluteUrl(siteUrl, 'img/site/patliputra-logo.png');
  const cleanSiteUrl = siteUrl.replace(/\/$/, '');
  const emailVerify = (order.customer && order.customer.email) ? `&verify=${encodeURIComponent(order.customer.email)}` : '';
  let trackUrl = `${cleanSiteUrl}/order-confirmation/?orderId=${encodeURIComponent(orderId)}${emailVerify}`;
  if (order.awbNumber) {
    trackUrl = `${cleanSiteUrl}/track/?awb=${encodeURIComponent(order.awbNumber)}${emailVerify}`;
  } else if (order.trackingUrl) {
    trackUrl = order.trackingUrl;
  }

  const placedDate = formatDate(order.createdAt, { month: 'short', day: '2-digit', year: 'numeric' });
  const deliveryDate = formatDate(order.estimatedDelivery, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

  const hasPhysical = (order.items || []).some(i => normalizeProductType(i.productType, i.category) !== 'digital');
  const hasDigital = (order.items || []).some(i => normalizeProductType(i.productType, i.category) === 'digital');
  const digitalOnly = hasDigital && !hasPhysical;

  const stepperHtml = digitalOnly ? '' : renderStepper(status, accent);
  const itemsHtml = renderItemsRows(order.items, siteUrl);

  const digitalDownloadBanner = hasDigital ? `
    <tr><td style="padding:20px 32px 0;">
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px 20px;">
        <div style="font-size:14px;font-weight:700;color:#166534;margin-bottom:4px;">
          ⚡ Instant Digital Delivery Ready
        </div>
        <p style="margin:0 0 10px;font-size:13px;color:#15803d;line-height:1.5;">
          Your digital assets are ready for download right here in your inbox! Click the download button next to each item below or use the button below to get all your files instantly.
        </p>
        <div>
          ${(order.items || []).filter(i => normalizeProductType(i.productType, i.category) === 'digital').map(i => `
            <a href="${escapeHtml(getDownloadUrl(i, siteUrl))}" style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;font-size:12px;font-weight:700;padding:8px 16px;border-radius:6px;margin:3px 6px 3px 0;">
              Download ${escapeHtml(i.name)} &darr;
            </a>
          `).join('')}
        </div>
      </div>
    </td></tr>` : '';

  const html = `<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${BRAND_CREAM};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND_CREAM};padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;">

        <tr><td style="background:${BRAND_BLACK};padding:20px 32px;">
          <img src="${escapeHtml(logoUrl)}" alt="Patliputra Traders" height="24" style="display:block;">
        </td></tr>

        <tr><td style="padding:28px 32px 0;">
          <span style="display:inline-block;background:${accent};color:#ffffff;font-size:12px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;padding:6px 14px;border-radius:20px;">${escapeHtml(meta.label)}</span>
        </td></tr>

        <tr><td style="padding:16px 32px 0;">
          <p style="margin:0 0 6px;font-size:16px;color:${TEXT_PRIMARY};">Hi <strong>${escapeHtml(order.customer.name)}</strong>,</p>
          <p style="margin:0;font-size:14px;color:${TEXT_MUTED};">${digitalOnly ? 'Thank you for your purchase! Your digital assets have been delivered to your email inbox below.' : escapeHtml(meta.message)}</p>
        </td></tr>

        <tr><td style="padding:14px 32px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:12px;color:${TEXT_MUTED};">
            <tr>
              <td>Order placed on <strong style="color:${TEXT_PRIMARY};">${placedDate}</strong></td>
              <td align="right">Order ID <strong style="color:${TEXT_PRIMARY};">${escapeHtml(orderId)}</strong></td>
            </tr>
          </table>
        </td></tr>

        ${stepperHtml ? `<tr><td style="padding:0 32px;">${stepperHtml}</td></tr>` : ''}
        ${digitalDownloadBanner}

        <tr><td style="padding:24px 32px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${BORDER};border-radius:8px;">
            <tr>
              <td style="padding:16px;" width="50%">
                <div style="font-size:11px;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.5px;">${digitalOnly ? 'Fulfillment' : (status === 'cancelled' ? 'Order Total' : 'Estimated Delivery')}</div>
                <div style="font-size:14px;font-weight:700;color:${status === 'cancelled' ? TEXT_PRIMARY : accent};margin-top:2px;">${digitalOnly ? 'Instant Email Delivery' : (status === 'cancelled' ? money(order.total) : (deliveryDate || 'TBD'))}</div>
                ${(!digitalOnly && status !== 'cancelled' && order.deliveryPromise) ? `<div style="font-size:11px;color:${TEXT_MUTED};margin-top:4px;">Timeline: ${escapeHtml(order.deliveryPromise)}</div>` : ''}
              </td>
              <td style="padding:16px;border-left:1px solid ${BORDER};" width="50%">
                <div style="font-size:11px;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.5px;">Amount Paid</div>
                <div style="font-size:14px;font-weight:700;color:${TEXT_PRIMARY};margin-top:2px;">${money(order.total)}</div>
              </td>
            </tr>
            ${(!digitalOnly && status !== 'cancelled') ? `
            <tr><td colspan="2" style="padding:0 16px 12px;">
              <div style="background:#fcfbf7;border:1px solid #ebdcc5;border-radius:6px;padding:10px 14px;text-align:left;font-size:11px;color:#555;line-height:1.5;">
                <strong style="color:#222;">Delivery Timeline:</strong> Orders within Patna &amp; Bihar will be delivered in 2–4 working days. Orders in Metros/NCR within 4–7 working days, and Rest of India within 6–10 working days. Every fixture is insured with a 100% transit guarantee.
              </div>
            </td></tr>` : ''}
            ${order.awbNumber ? `
            <tr><td colspan="2" style="padding:0 16px 12px;">
              <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:10px 14px;text-align:left;">
                <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Live Parcel Tracking</div>
                <div style="font-size:13px;color:#0f172a;margin-top:2px;">
                  Courier: <strong>${escapeHtml(order.courierPartner || 'Courier Express')}</strong> &nbsp;·&nbsp; AWB: <strong style="font-family:monospace;letter-spacing:0.5px;">${escapeHtml(order.awbNumber)}</strong>
                </div>
              </div>
            </td></tr>` : ''}
            <tr><td colspan="2" align="center" style="padding:0 16px 16px;">
              <a href="${escapeHtml(trackUrl)}" style="display:inline-block;background:${accent};color:#ffffff;text-decoration:none;font-size:13px;font-weight:700;padding:10px 24px;border-radius:6px;margin-top:4px;">${digitalOnly ? 'View Order Details' : (order.awbNumber ? 'Track Live Shipment &rarr;' : 'Track Your Order')}</a>
            </td></tr>
          </table>
        </td></tr>

        <tr><td style="padding:24px 32px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td width="60%" style="vertical-align:top;font-size:13px;color:${TEXT_PRIMARY};line-height:1.5;">
                <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:${TEXT_MUTED};margin-bottom:4px;">${digitalOnly ? 'Customer Details' : 'Delivery Address'}</div>
                ${escapeHtml(order.customer.name)}<br>
                ${escapeHtml(order.customer.address)}<br>
                ${escapeHtml(order.customer.city)}, ${escapeHtml(order.customer.state)} ${escapeHtml(order.customer.pincode)}
              </td>
              <td width="40%" style="vertical-align:top;font-size:13px;color:${TEXT_PRIMARY};">
                <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:${TEXT_MUTED};margin-bottom:4px;">Email updates &amp; downloads sent to</div>
                ${escapeHtml(order.customer.email)}
              </td>
            </tr>
          </table>
        </td></tr>

        <tr><td style="padding:24px 32px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${BORDER};">
            ${itemsHtml}
          </table>
        </td></tr>

        <tr><td style="padding:16px 32px 28px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;color:${TEXT_MUTED};">
            <tr><td>Subtotal (Inc. Tax)</td><td align="right">${money(order.subtotal)}</td></tr>
            <tr><td style="padding-top:4px;">Shipping</td><td align="right" style="padding-top:4px;">${order.shipping ? money(order.shipping) : 'FREE'}</td></tr>
            ${order.codFee ? `<tr><td style="padding-top:4px;">COD fee</td><td align="right" style="padding-top:4px;">${money(order.codFee)}</td></tr>` : ''}
            ${order.processingFee ? `<tr><td style="padding-top:4px;">Processing Fee</td><td align="right" style="padding-top:4px;">${money(order.processingFee)}</td></tr>` : ''}
            ${order.launchDiscount > 0 ? `<tr><td style="padding-top:4px;">Launch offer</td><td align="right" style="padding-top:4px;">-${money(order.launchDiscount)}</td></tr>` : ''}
            ${order.bundleDiscount > 0 ? `<tr><td style="padding-top:4px;">${escapeHtml(order.bundleLabel || 'Combo offer')} (${order.bundleFreeCount || 1} free)</td><td align="right" style="padding-top:4px;">-${money(order.bundleDiscount)}</td></tr>` : ''}
            ${order.couponDiscount > 0 ? `<tr><td style="padding-top:4px;">Coupon</td><td align="right" style="padding-top:4px;">-${money(order.couponDiscount)}</td></tr>` : ''}
            ${(!order.launchDiscount && !order.bundleDiscount && !order.couponDiscount && order.discount > 0) ? `<tr><td style="padding-top:4px;">Discount</td><td align="right" style="padding-top:4px;">-${money(order.discount)}</td></tr>` : ''}
            ${(order.tax != null || order.gst) ? `<tr><td style="padding-top:6px;color:#888;font-size:12px;">Includes 18% GST</td><td align="right" style="padding-top:6px;color:#888;font-size:12px;">${money(order.tax != null ? order.tax : order.gst)}</td></tr>` : ''}
            <tr><td style="padding-top:10px;border-top:1px solid ${BORDER};font-weight:700;color:${TEXT_PRIMARY};font-size:14px;">Total</td><td align="right" style="padding-top:10px;border-top:1px solid ${BORDER};font-weight:700;color:${TEXT_PRIMARY};font-size:14px;">${money(order.total)}</td></tr>
            <tr><td colspan="2" style="padding-top:8px;font-size:11px;color:#999;text-align:left;">* Product prices are inclusive of 18% GST. GST is already included in the item subtotal and not charged extra.</td></tr>
          </table>
        </td></tr>

        <tr><td style="background:${BRAND_CREAM};padding:24px 32px;text-align:center;">
          <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:${TEXT_PRIMARY};">Thank you for shopping with Patliputra Traders!</p>
          <p style="margin:0;font-size:12px;color:${TEXT_MUTED};">Got questions about your order? Reply to this email or WhatsApp us at +91 9234755686 and we'll help you out.</p>
        </td></tr>

      </table>
      <p style="max-width:600px;margin:16px auto 0;font-size:11px;color:${TEXT_MUTED};font-family:Arial,Helvetica,sans-serif;text-align:center;">
        This email refers to order ${escapeHtml(orderId)} placed on Patliputra Traders.
      </p>
    </td></tr>
  </table>
</body>
</html>`;

  const text = `Hi ${order.customer.name},

${digitalOnly ? 'Thank you for your purchase! Your digital assets have been delivered to your email inbox below.' : meta.message}

Order ID: ${orderId}
Order placed on: ${placedDate}
${digitalOnly ? 'Fulfillment: Instant Email Delivery\n' : (status !== 'cancelled' ? `Estimated delivery: ${deliveryDate || 'TBD'}${order.deliveryPromise ? ` (${order.deliveryPromise})` : ''}\nDelivery Timeline: Orders within Delhi NCR: 5–8 working days · Other States of India: 6–11 working days (Delivery time may vary depending upon shipping address; 2:00 PM IST cutoff applies).\n` : '')}Amount Paid: ${money(order.total)}

${digitalOnly ? 'Customer Details:' : 'Delivery Address:'}
${order.customer.name}
${order.customer.address}
${order.customer.city}, ${order.customer.state} ${order.customer.pincode}
Downloads sent to: ${order.customer.email}

Items:
${(order.items || []).map(i => {
  const isDig = normalizeProductType(i.productType, i.category) === 'digital';
  const dl = isDig ? `\n  Download link: ${getDownloadUrl(i, siteUrl)}` : '';
  const packBreakup = (Array.isArray(i.customPosters) && i.customPosters.length > 0)
    ? '\n  Pack Posters:\n' + i.customPosters.map((p, idx) => `    ${idx + 1}. ${p.name || p.title || 'Poster'} (Size: ${p.size || 'A5'})`).join('\n')
    : '';
  return `- ${i.name} ${i.sku ? '(SKU: '+i.sku+') ' : ''}(Qty ${i.quantity}) - ${money(i.subtotal)}${dl}${packBreakup}`;
}).join('\n')}

Track your order: ${trackUrl}

Thank you for shopping with Brush, a Kraft Studios brand!`;

  return {
    subject: `${meta.heading} - Order ${orderId}`,
    html,
    text
  };
}

function buildPaymentRequestEmail(order, siteUrl, bankConfig) {
  const orderId = order.orderId || order._id;
  const logoUrl = absoluteUrl(siteUrl, 'img/site/patliputra-logo.png');
  // Only shown when a QR has actually been supplied. Hard-coding the path
  // meant every one of these emails carried a broken image until the file
  // existed, which looks worse than simply not showing a QR.
  const qrUrl = bankConfig && bankConfig.qrUrl ? absoluteUrl(siteUrl, bankConfig.qrUrl) : null;

  const html = `<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${BRAND_CREAM};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND_CREAM};padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;">

        <tr><td style="background:${BRAND_BLACK};padding:20px 32px;">
          <img src="${escapeHtml(logoUrl)}" alt="Patliputra Traders" height="24" style="display:block;">
        </td></tr>

        <tr><td style="padding:28px 32px 0;">
          <p style="margin:0 0 6px;font-size:16px;color:${TEXT_PRIMARY};">Hi <strong>${escapeHtml(order.customer.name)}</strong>,</p>
          <p style="margin:0;font-size:14px;color:${TEXT_MUTED};line-height:1.5;">To complete your recent order (<strong>${orderId}</strong>), please send the payment using the details below. Once paid, reply to this email with a screenshot or your transaction reference.</p>
        </td></tr>

        <tr><td style="padding:24px 32px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:rgba(255,159,41,0.06);border:1px solid ${BRAND_ACCENT};border-radius:8px;">
            <tr>
              <td align="center" style="padding:20px;">
                <div style="font-size:12px;color:${TEXT_MUTED};text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Amount Due</div>
                <div style="font-size:24px;font-weight:700;color:${TEXT_PRIMARY};">${money(order.total)}</div>
              </td>
            </tr>
            ${(qrUrl || (bankConfig && bankConfig.upiVpa)) ? `
            <tr>
              <td align="center" style="padding:0 20px 20px;">
                <p style="margin:0 0 12px;font-size:12px;font-weight:700;color:${TEXT_MUTED};text-transform:uppercase;">${qrUrl ? 'Scan to pay via UPI' : 'Pay via UPI'}</p>
                ${qrUrl ? `<img src="${escapeHtml(qrUrl)}" alt="UPI QR Code" style="display:block;width:180px;height:auto;border-radius:6px;border:1px solid ${BORDER};background:#fff;padding:8px;margin:0 auto;">` : ''}
                ${bankConfig && bankConfig.upiVpa ? `<div style="font-size:13px;font-weight:600;color:${TEXT_PRIMARY};margin-top:10px;">UPI ID: ${escapeHtml(bankConfig.upiVpa)}</div>` : ''}
              </td>
            </tr>` : ''}
          </table>
        </td></tr>

        ${bankConfig && bankConfig.bank ? `
        <tr><td style="padding:24px 32px 0;">
          <div style="font-size:12px;font-weight:700;text-transform:uppercase;color:${TEXT_MUTED};margin-bottom:10px;">Or Pay via NEFT/Bank Transfer</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;color:${TEXT_PRIMARY};border-collapse:collapse;">
            ${bankConfig.bank.accountName ? `<tr><td style="padding:6px 0;border-bottom:1px solid ${BORDER};" width="40%">Account Name</td><td style="padding:6px 0;border-bottom:1px solid ${BORDER};font-weight:600;">${escapeHtml(bankConfig.bank.accountName)}</td></tr>` : ''}
            ${bankConfig.bank.accountNumber ? `<tr><td style="padding:6px 0;border-bottom:1px solid ${BORDER};" width="40%">Account Number</td><td style="padding:6px 0;border-bottom:1px solid ${BORDER};font-weight:600;">${escapeHtml(bankConfig.bank.accountNumber)}</td></tr>` : ''}
            ${bankConfig.bank.ifsc ? `<tr><td style="padding:6px 0;border-bottom:1px solid ${BORDER};" width="40%">IFSC</td><td style="padding:6px 0;border-bottom:1px solid ${BORDER};font-weight:600;">${escapeHtml(bankConfig.bank.ifsc)}</td></tr>` : ''}
            ${bankConfig.bank.bankName ? `<tr><td style="padding:6px 0;border-bottom:1px solid ${BORDER};" width="40%">Bank</td><td style="padding:6px 0;border-bottom:1px solid ${BORDER};font-weight:600;">${escapeHtml(bankConfig.bank.bankName)}</td></tr>` : ''}
          </table>
        </td></tr>` : ''}

        <tr><td align="center" style="padding:32px;background:${BRAND_CREAM};margin-top:24px;">
          <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:${TEXT_PRIMARY};">Thank you for shopping with Patliputra Traders!</p>
          <p style="margin:0;font-size:12px;color:${TEXT_MUTED};">Please reply to this email once payment is completed.</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = `Hi ${order.customer.name},

To complete your recent order (${orderId}), please send the payment using the details below. Once paid, reply to this email with a screenshot or your transaction reference.

Amount Due: ${money(order.total)}

${bankConfig && bankConfig.upiVpa ? `UPI ID: ${bankConfig.upiVpa}\n` : ''}${bankConfig && bankConfig.bank ? `
Bank Transfer Details:
Account Name: ${bankConfig.bank.accountName || ''}
Account Number: ${bankConfig.bank.accountNumber || ''}
IFSC: ${bankConfig.bank.ifsc || ''}
Bank: ${bankConfig.bank.bankName || ''}` : ''}

Please reply to this email once payment is completed.

Thank you for shopping with Patliputra Traders!`;

  return {
    subject: `Complete Your Payment - Order ${orderId}`,
    html,
    text
  };
}

module.exports = { buildOrderStatusEmail, buildPaymentRequestEmail };
