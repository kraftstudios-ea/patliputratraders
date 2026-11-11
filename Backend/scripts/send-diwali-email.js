const fs = require('fs');
const path = require('path');

// Load Backend/.env if not already loaded
try {
  const envPath = path.resolve(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const idx = trimmed.indexOf('=');
        const k = trimmed.slice(0, idx).trim();
        let v = trimmed.slice(idx + 1).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        if (!process.env[k]) process.env[k] = v;
      }
    });
  }
} catch (e) {
  console.warn('Could not load .env:', e.message);
}

const RESEND_API_KEY = process.env.RESEND_API_KEY || (process.env.SMTP_PASS && process.env.SMTP_PASS.startsWith('re_') ? process.env.SMTP_PASS : null);

function generateDiwaliEmail({
  name = 'Friend',
  couponCode = 'DIWALIWITHBRUSH',
  discountPercent = '5%',
  minCartValue = '299',
  shopUrl = 'https://www.brush-art.in/shop/'
} = {}) {
  const displayName = name && name.trim() ? name.trim() : 'Friend';

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <title>Happy Diwali from Mangalam &amp; Brush</title>
  <!--[if mso]>
  <style>
    * { font-family: 'Georgia', serif !important; }
  </style>
  <![endif]-->
  <style>
    .cta-btn:hover {
      background: linear-gradient(135deg, #F59E0B 0%, #D97706 100%) !important;
      box-shadow: 0 6px 20px rgba(245, 158, 11, 0.5) !important;
    }
    @media only screen and (max-width: 620px) {
      .email-container {
        width: 100% !important;
        margin: auto !important;
      }
      .mobile-pad {
        padding-left: 20px !important;
        padding-right: 20px !important;
      }
      .coupon-card {
        padding: 20px 16px !important;
      }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; width: 100% !important; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; background-color: #0A0807; color: #E5E5E5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">

  <!-- Preheader preview text (hidden in body, shown in inbox preview) -->
  <div style="display: none; font-size: 1px; color: #0A0807; line-height: 1px; max-height: 0px; max-width: 0px; opacity: 0; overflow: hidden;">
    Wishing you &amp; your family an auspicious, joyful, and radiant Diwali. An exclusive festive gift inside from Mangalam &amp; Brush.
    &zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;
  </div>

  <!-- Main Background Table -->
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #0A0807; background-image: radial-gradient(circle at 50% 0%, #2A170A 0%, #0A0807 70%);">
    <tr>
      <td align="center" style="padding: 28px 12px 50px 12px;">

        <!-- Email Container (600px max) -->
        <table role="presentation" class="email-container" border="0" cellpadding="0" cellspacing="0" width="600" style="max-width: 600px; width: 100%; background-color: #120E0A; border: 1px solid #382414; border-radius: 16px; overflow: hidden; box-shadow: 0 12px 48px rgba(0, 0, 0, 0.8), 0 0 30px rgba(217, 119, 6, 0.15);">

          <!-- Top Golden Festive Border Accent -->
          <tr>
            <td height="4" style="background: linear-gradient(90deg, #78350F 0%, #F59E0B 50%, #78350F 100%); line-height: 4px; font-size: 4px;">&nbsp;</td>
          </tr>

          <!-- Brand Header with Official Brush Logo (brush. with yellow dot) -->
          <tr>
            <td align="center" style="padding: 34px 24px 14px 24px;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="https://www.brush-art.in" target="_blank" style="text-decoration: none; display: inline-block;">
                      <!-- Canonical Brush Brand Logo (Brush. with dot) embedded via CID -->
                      <img src="cid:brush-logo" alt="Brush." width="140" height="36" style="display: block; border: 0; outline: none; text-decoration: none; width: 140px; height: auto;">
                    </a>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-top: 8px;">
                    <span style="font-size: 10px; text-transform: uppercase; letter-spacing: 3px; color: #A18265; font-family: -apple-system, sans-serif;">Curated Wall Art &amp; Collector Prints</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Auspicious Animated Diya GIF (Universal Gmail & Apple Mail Rendering) -->
          <tr>
            <td align="center" style="padding: 6px 24px 16px 24px;">
              <div style="display: inline-block; text-align: center; margin: 0 auto; max-width: 210px; border-radius: 14px; overflow: hidden; box-shadow: 0 0 32px rgba(245, 158, 11, 0.25);">
                <!-- Animated Diya image loaded via CID attachment -->
                <img src="cid:diwali-diya" alt="Auspicious Diwali Diya" width="210" height="184" style="display: block; margin: 0 auto; border: 0; outline: none; width: 210px; height: auto; border-radius: 12px;">
              </div>
            </td>
          </tr>

          <!-- Festive Sanskrit Blessing Banner -->
          <tr>
            <td align="center" style="padding: 0 32px 14px 32px;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center" style="background: rgba(245, 158, 11, 0.06); border: 1px solid rgba(245, 158, 11, 0.22); border-radius: 8px; padding: 12px 16px;">
                    <div style="font-family: 'Cinzel', 'Noto Serif Devanagari', 'Georgia', serif; font-size: 15px; color: #F59E0B; font-weight: 600; letter-spacing: 1px; line-height: 1.6;">
                      ॐ असतो मा सद्गमय । तमसो मा ज्योतिर्गमय ।
                    </div>
                    <div style="font-size: 11px; color: #D4A373; margin-top: 4px; font-style: italic; letter-spacing: 0.5px;">
                      &ldquo;Lead us from darkness unto light, from ignorance unto wisdom.&rdquo;
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Festive Title -->
          <tr>
            <td align="center" style="padding: 10px 32px 4px 32px;">
              <h1 style="margin: 0; font-family: 'Cinzel', 'Playfair Display', Georgia, serif; font-size: 28px; line-height: 1.3; font-weight: 700; color: #FDE68A; letter-spacing: 0.5px; text-shadow: 0 2px 12px rgba(245,158,11,0.3);">
                Happy &amp; Auspicious Diwali! ✨
              </h1>
              <p style="margin: 8px 0 0 0; font-size: 13px; color: #A88265; letter-spacing: 1px; text-transform: uppercase;">
                A Personal Festive Wish from Mangalam
              </p>
            </td>
          </tr>

          <!-- Personal Letter Body -->
          <tr>
            <td class="mobile-pad" style="padding: 24px 36px 12px 36px; font-size: 15px; line-height: 1.8; color: #E7D8C9;">

              <p style="margin: 0 0 16px 0;">
                Dear <strong style="color: #FDE68A;">${displayName}</strong>,
              </p>

              <p style="margin: 0 0 16px 0; color: #D6C2B0;">
                As the warm glow of diyas illuminates our doorsteps and homes, I wanted to take a heartfelt moment to personally reach out and wish you a luminous, joyful, and peaceful Deepawali from everyone here at <strong>Brush</strong>.
              </p>

              <p style="margin: 0 0 16px 0; color: #D6C2B0;">
                Diwali has always been more than just a festival of lights — it is a profound celebration of warmth, hope, and new beginnings. It is a reminder that no matter how vast the darkness, a single humble flame has the power to banish it completely.
              </p>

              <p style="margin: 0 0 16px 0; color: #D6C2B0;">
                Just like a stroke of creativity and visual art brings emotion, depth, and character to our personal spaces, the light of Diwali fills our homes and lives with harmony, inspiration, and togetherness.
              </p>

              <p style="margin: 0 0 20px 0; color: #D6C2B0;">
                Whether you have been following our artistic journey, exploring our curated prints, or simply sharing in our passion for great design and visual culture, thank you for being a wonderful part of the Brush community. Having you with us is the greatest privilege for me and our studio.
              </p>

              <!-- Auspicious Blessing Box -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background: linear-gradient(135deg, rgba(120,53,15,0.25) 0%, rgba(67,20,7,0.35) 100%); border-left: 3px solid #F59E0B; border-radius: 4px; margin: 16px 0 22px 0;">
                <tr>
                  <td style="padding: 14px 18px;">
                    <p style="margin: 0; font-size: 14px; font-style: italic; color: #FCD34D; line-height: 1.7;">
                      &ldquo;May Lord Ganesha remove every obstacle from your path, and may Goddess Lakshmi bless your household with boundless health, flourishing prosperity, peace, and timeless creativity.&rdquo;
                    </p>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Festive Gift & Interactive Coupon Section -->
          <tr>
            <td class="mobile-pad" style="padding: 0 32px 28px 32px;">
              <table role="presentation" class="coupon-card" border="0" cellpadding="0" cellspacing="0" width="100%" style="background: radial-gradient(circle at 50% 0%, #2A170A 0%, #17100A 100%); border: 1.5px dashed #D97706; border-radius: 12px; padding: 26px 24px; text-align: center; box-shadow: inset 0 0 24px rgba(245, 158, 11, 0.08);">
                
                <tr>
                  <td align="center">
                    <!-- Festive Gift Badge -->
                    <span style="display: inline-block; background: linear-gradient(135deg, #B45309 0%, #78350F 100%); color: #FEF3C7; font-size: 11px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; padding: 5px 14px; border-radius: 20px; border: 1px solid #F59E0B; margin-bottom: 12px;">
                      🪔 Exclusive Festive Gift 🪔
                    </span>
                    
                    <h3 style="margin: 0 0 8px 0; font-family: 'Cinzel', Georgia, serif; font-size: 21px; color: #FFFBEB; font-weight: 700;">
                      Celebrate Diwali With Brush
                    </h3>
                    
                    <p style="margin: 0 0 16px 0; font-size: 14px; color: #FDE68A; line-height: 1.5;">
                      Enjoy an <strong style="color: #FFF; font-size: 16px;">extra ${discountPercent} discount</strong> on all cart values strictly above <strong>₹${minCartValue}</strong>.
                    </p>

                    <!-- Coupon Code Highlight Pill -->
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin: 0 auto 16px auto;">
                      <tr>
                        <td align="center" style="background: #0A0704; border: 1.5px solid #F59E0B; border-radius: 8px; padding: 12px 28px; box-shadow: 0 4px 16px rgba(245, 158, 11, 0.2);">
                          <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #A88265; display: block; margin-bottom: 3px;">Use Promo Code at Checkout</span>
                          <span style="font-family: 'Courier New', Courier, monospace; font-size: 22px; font-weight: 800; letter-spacing: 3px; color: #FEF08A; text-shadow: 0 0 8px rgba(245,158,11,0.5);">
                            ${couponCode}
                          </span>
                        </td>
                      </tr>
                    </table>

                    <p style="margin: 0 0 20px 0; font-size: 12px; color: #9A7B62;">
                      ✓ Applicable on single prints, collector 2-packs &amp; custom canvas &nbsp;·&nbsp; Min cart value ₹${minCartValue}
                    </p>

                    <!-- Interactive CTA Button -->
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin: 0 auto;">
                      <tr>
                        <td align="center" style="border-radius: 8px; background: linear-gradient(135deg, #F59E0B 0%, #B45309 100%);">
                          <a href="${shopUrl}" class="cta-btn" target="_blank" style="display: inline-block; padding: 14px 34px; font-size: 14px; font-weight: 700; color: #0A0807; text-decoration: none; border-radius: 8px; letter-spacing: 0.5px; text-transform: uppercase; box-shadow: 0 4px 16px rgba(245, 158, 11, 0.35); font-family: -apple-system, sans-serif;">
                            Claim Gift &amp; Explore Collection &rarr;
                          </a>
                        </td>
                      </tr>
                    </table>

                  </td>
                </tr>

              </table>
            </td>
          </tr>

          <!-- Curated Category Quick Links -->
          <tr>
            <td align="center" style="padding: 0 32px 28px 32px;">
              <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; color: #8F725A; margin-bottom: 12px;">
                Popular Collections To Elevate Your Walls
              </div>
              <table role="presentation" border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="line-height: 2;">
                    <a href="https://www.brush-art.in/shop/?category=F1" target="_blank" style="display: inline-block; margin: 3px 4px; padding: 6px 14px; background: #1C1510; border: 1px solid #3D291A; border-radius: 20px; font-size: 12px; color: #D6C2B0; text-decoration: none;">🏎️ F1 &amp; Motorsport</a>
                    <a href="https://www.brush-art.in/shop/?category=Anime" target="_blank" style="display: inline-block; margin: 3px 4px; padding: 6px 14px; background: #1C1510; border: 1px solid #3D291A; border-radius: 20px; font-size: 12px; color: #D6C2B0; text-decoration: none;">🎌 Anime &amp; Manga</a>
                    <a href="https://www.brush-art.in/shop/?category=Vintage" target="_blank" style="display: inline-block; margin: 3px 4px; padding: 6px 14px; background: #1C1510; border: 1px solid #3D291A; border-radius: 20px; font-size: 12px; color: #D6C2B0; text-decoration: none;">🎞️ Vintage Classics</a>
                    <a href="https://www.brush-art.in/shop/?category=Minimalist" target="_blank" style="display: inline-block; margin: 3px 4px; padding: 6px 14px; background: #1C1510; border: 1px solid #3D291A; border-radius: 20px; font-size: 12px; color: #D6C2B0; text-decoration: none;">🌿 Minimal &amp; Botanical</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Founder Sign-off -->
          <tr>
            <td class="mobile-pad" style="padding: 0 36px 32px 36px;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-top: 1px solid #2B1D12; padding-top: 20px;">
                <tr>
                  <td>
                    <p style="margin: 0 0 4px 0; font-size: 14px; color: #D6C2B0;">
                      Wishing you and your family a luminous, peaceful, and prosperous Deepawali!
                    </p>
                    <p style="margin: 0 0 12px 0; font-size: 14px; color: #8F725A; font-style: italic;">
                      With warmest festive regards and heartfelt gratitude,
                    </p>
                    <div style="font-family: 'Cinzel', Georgia, serif; font-size: 18px; font-weight: 700; color: #F59E0B; letter-spacing: 1px;">
                      Mangalam
                    </div>
                    <div style="font-size: 12px; color: #A88265; margin-top: 2px;">
                      Founder &amp; Creative Lead &nbsp;·&nbsp; <strong>Brush</strong>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Bottom Footer -->
          <tr>
            <td align="center" style="background-color: #0B0806; border-top: 1px solid #24160C; padding: 24px 32px; font-size: 11px; color: #786250; line-height: 1.6;">
              <p style="margin: 0 0 8px 0;">
                You are receiving this festive wish as a cherished member of the <a href="https://www.brush-art.in" target="_blank" style="color: #F59E0B; text-decoration: none;">Brush</a> community.
              </p>
              <p style="margin: 0 0 8px 0;">
                Brush Studio &nbsp;·&nbsp; Museum-grade Art Prints &amp; Fine Visuals &nbsp;·&nbsp; <a href="mailto:admin@brush-art.in" style="color: #A88265; text-decoration: none;">admin@brush-art.in</a>
              </p>
              <p style="margin: 0; color: #574639;">
                &copy; ${new Date().getFullYear()} Brush (brush-art.in). All rights reserved.
              </p>
            </td>
          </tr>

          <!-- Bottom Golden Accent -->
          <tr>
            <td height="3" style="background: linear-gradient(90deg, #78350F 0%, #F59E0B 50%, #78350F 100%); line-height: 3px; font-size: 3px;">&nbsp;</td>
          </tr>

        </table>
        <!-- End Email Container -->

      </td>
    </tr>
  </table>

</body>
</html>`;
}

function generatePlainTextDiwali({
  name = 'Friend',
  couponCode = 'DIWALIWITHBRUSH',
  discountPercent = '5%',
  minCartValue = '299'
} = {}) {
  const displayName = name && name.trim() ? name.trim() : 'Friend';
  return `Happy & Auspicious Diwali! ✨
A Personal Festive Wish from Mangalam | Brush

Dear ${displayName},

ॐ असतो मा सद्गमय । तमसो मा ज्योतिर्गमय ।
"Lead us from darkness unto light, from ignorance unto wisdom."

As the warm glow of diyas illuminates our doorsteps and homes, I wanted to take a heartfelt moment to personally reach out and wish you a luminous, joyful, and peaceful Deepawali from everyone here at Brush.

Diwali has always been more than just a festival of lights — it is a profound celebration of warmth, hope, and new beginnings. It is a reminder that no matter how vast the darkness, a single humble flame has the power to banish it completely.

Just like a stroke of creativity and visual art brings emotion, depth, and character to our personal spaces, the light of Diwali fills our homes and lives with harmony, inspiration, and togetherness.

Whether you have been following our artistic journey, exploring our curated prints, or simply sharing in our passion for great design and visual culture, thank you for being a wonderful part of the Brush community. Having you with us is the greatest privilege for me and our studio.

May Lord Ganesha remove every obstacle from your path, and may Goddess Lakshmi bless your household with boundless health, flourishing prosperity, peace, and timeless creativity.

---
EXCLUSIVE DIWALI GIFT FOR YOU:
Enjoy an extra ${discountPercent} discount on all orders strictly above ₹${minCartValue}.
Promo Code: ${couponCode}
Shop Collection: https://www.brush-art.in/shop/
---

Wishing you and your loved ones a luminous, safe, and joyful Deepawali!

With warmest festive regards and heartfelt gratitude,

Mangalam
Founder & Creative Lead, Brush
admin@brush-art.in | https://www.brush-art.in
`;
}

async function sendDiwaliEmail({
  to,
  name,
  couponCode = 'DIWALIWITHBRUSH',
  discountPercent = '5%',
  minCartValue = '299',
  isDemo = false
}) {
  if (!to) throw new Error('Recipient email is required');

  const html = generateDiwaliEmail({ name, couponCode, discountPercent, minCartValue });
  const text = generatePlainTextDiwali({ name, couponCode, discountPercent, minCartValue });
  const subject = `✨ Happy Diwali from Mangalam & Brush | Festive Gift Inside 🪔`;

  // Explicit sender display as "Brush" <admin@brush-art.in>
  const senderFrom = '"Brush" <admin@brush-art.in>';
  const replyTo = 'admin@brush-art.in';

  // Attachments with CID for 100% reliable rendering in Gmail & Apple Mail
  const diyaGifPath = path.resolve(__dirname, '../../public/assets/misc/diwali-diya-animated.gif');
  const logoPngPath = path.resolve(__dirname, '../../public/assets/misc/brush-logo-email.png');

  const attachments = [
    {
      filename: 'diwali-diya.gif',
      content: fs.readFileSync(diyaGifPath).toString('base64'),
      content_id: 'diwali-diya',
      contentId: 'diwali-diya'
    },
    {
      filename: 'brush-logo.png',
      content: fs.readFileSync(logoPngPath).toString('base64'),
      content_id: 'brush-logo',
      contentId: 'brush-logo'
    }
  ];

  if (RESEND_API_KEY && RESEND_API_KEY.startsWith('re_')) {
    const payload = {
      from: senderFrom,
      to: [to],
      subject,
      html,
      text,
      reply_to: replyTo,
      attachments
    };

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
      return { success: true, messageId: data.id, provider: 'Resend HTTPS API' };
    }

    // Domain fallback if brush-art.in verification differs
    if (data && data.name === 'validation_error' && String(data.message).includes('not verified')) {
      console.warn('Fallback to ordersmaster@mangalam.cc...');
      const fallbackPayload = {
        ...payload,
        from: '"Brush" <ordersmaster@mangalam.cc>'
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
        return { success: true, messageId: data.id, provider: 'Resend Fallback Domain' };
      }
    }

    throw new Error('Resend error: ' + JSON.stringify(data));
  } else {
    throw new Error('RESEND_API_KEY not configured or invalid');
  }
}

const ADDITIONAL_EMAILS = [
  'pringlesama21@gmail.com',
  'chiragkapil2468@gmail.com',
  'animeshchandra888@gmail.com',
  'ankyadav15@gmail.com',
  'kritikaag2001@gmail.com',
  'rajpiyush2000@gmail.com',
  'navaneet.railko@gmail.com',
  'kumariaastha131@gmail.com',
  'anilxaviers.patna@gmail.com',
  'smitasinha.patna@gmail.com',
  'kumarraghvendra.patna@gmail.com',
  'nikitadas2205@gmail.com',
  'piyusha191@gmail.com',
  'shrutigupta41205@gmail.com',
  'ratnalipiswain@gmail.com',
  'chinmaysinghns@gmail.com',
  'shrutiag5074@gmail.com',
  'kashyapsimran678@gmail.com',
  'tilaksharma790364@gmail.com',
  'kumarmangalam.patna@gmail.com'
];

async function getAllBccRecipients() {
  const { MongoClient } = require('mongodb');
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error('MONGODB_URI missing in environment');
  
  const client = new MongoClient(mongoUri);
  await client.connect();
  const db = client.db();
  
  const orders = await db.collection('orders').find({}, { projection: { 'customer.email': 1, email: 1 } }).toArray();
  const users = await db.collection('users').find({}, { projection: { email: 1 } }).toArray();
  const reachouts = await db.collection('reachout_submissions').find({}, { projection: { email: 1 } }).toArray();
  
  const bccSet = new Set();
  
  // 1. Add all additional emails provided by user
  ADDITIONAL_EMAILS.forEach(e => bccSet.add(e.trim().toLowerCase()));
  
  // Helper to validate real email
  const isRealEmail = e => {
    if (!e || typeof e !== 'string' || !e.includes('@')) return false;
    const lower = e.trim().toLowerCase();
    if (lower.includes('example.') || lower.includes('.test') || lower.includes('test@') || lower.includes('dummy')) return false;
    return true;
  };

  // 2. Add from orders
  orders.forEach(o => {
    const e = (o.customer && o.customer.email) || o.email;
    if (isRealEmail(e)) bccSet.add(e.trim().toLowerCase());
  });

  // 3. Add from users
  users.forEach(u => {
    const e = u.email || (u._id && String(u._id).includes('@') ? u._id : null);
    if (isRealEmail(e)) bccSet.add(e.trim().toLowerCase());
  });

  // 4. Add from reachouts
  reachouts.forEach(r => {
    const e = r.email;
    if (isRealEmail(e)) bccSet.add(e.trim().toLowerCase());
  });

  await client.close();
  return Array.from(bccSet).sort();
}

async function sendBccDiwaliBroadcast({
  couponCode = 'DIWALIWITHBRUSH',
  discountPercent = '5%',
  minCartValue = '299'
} = {}) {
  const bccRecipients = await getAllBccRecipients();
  console.log(`Prepared BCC broadcast to ${bccRecipients.length} recipients:`);
  bccRecipients.forEach((e, idx) => console.log(`  ${idx + 1}. ${e}`));

  const html = generateDiwaliEmail({ name: 'Friend', couponCode, discountPercent, minCartValue });
  const text = generatePlainTextDiwali({ name: 'Friend', couponCode, discountPercent, minCartValue });
  const subject = `✨ Happy Diwali from Mangalam & Brush | Festive Gift Inside 🪔`;

  const senderFrom = '"Brush" <admin@brush-art.in>';
  const replyTo = 'admin@brush-art.in';

  const diyaGifPath = path.resolve(__dirname, '../../public/assets/misc/diwali-diya-animated.gif');
  const logoPngPath = path.resolve(__dirname, '../../public/assets/misc/brush-logo-email.png');

  const attachments = [
    {
      filename: 'diwali-diya.gif',
      content: fs.readFileSync(diyaGifPath).toString('base64'),
      content_id: 'diwali-diya',
      contentId: 'diwali-diya'
    },
    {
      filename: 'brush-logo.png',
      content: fs.readFileSync(logoPngPath).toString('base64'),
      content_id: 'brush-logo',
      contentId: 'brush-logo'
    }
  ];

  if (!RESEND_API_KEY || !RESEND_API_KEY.startsWith('re_')) {
    throw new Error('Valid RESEND_API_KEY is required to send');
  }

  const payload = {
    from: senderFrom,
    to: ['"Brush Community" <admin@brush-art.in>'],
    bcc: bccRecipients,
    subject,
    html,
    text,
    reply_to: replyTo,
    attachments
  };

  console.log('Dispatching BCC email via Resend HTTPS API...');
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
    console.log(`✓ Broadcast successful! Resend Message ID: ${data.id}`);
    return { success: true, messageId: data.id, recipientCount: bccRecipients.length, recipients: bccRecipients };
  }

  throw new Error('Resend broadcast error: ' + JSON.stringify(data));
}

module.exports = {
  generateDiwaliEmail,
  generatePlainTextDiwali,
  sendDiwaliEmail,
  getAllBccRecipients,
  sendBccDiwaliBroadcast
};

if (require.main === module) {
  const mode = process.argv[2];
  if (mode === '--broadcast') {
    console.log('Initiating BCC Broadcast to all recipients...');
    sendBccDiwaliBroadcast()
      .then(res => {
        console.log('Result:', JSON.stringify(res, null, 2));
        process.exit(0);
      })
      .catch(err => {
        console.error('Broadcast failed:', err);
        process.exit(1);
      });
  } else {
    const target = mode || 'kumarmangalam.patna@gmail.com';
    console.log(`Sending demo test Diwali email to ${target}...`);
    sendDiwaliEmail({
      to: target,
      name: 'Mangalam',
      isDemo: true
    })
      .then(res => console.log('Email sent successfully:', res))
      .catch(err => {
        console.error('Failed to send email:', err);
        process.exit(1);
      });
  }
}
