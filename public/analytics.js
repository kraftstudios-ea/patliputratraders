// Google Analytics 4 with Consent Mode v2 & Vercel Analytics/Speed Insights
(function () {
  const CONSENT_KEY = 'brush_analytics_consent';
  const measurementId = 'G-29FT01J8HX';

  // 1. Vercel Web Analytics & Speed Insights (cookieless by default)
  window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
  if (!document.querySelector('script[src*="/_vercel/insights/script.js"]')) {
    const vScript = document.createElement('script');
    vScript.defer = true;
    vScript.src = '/_vercel/insights/script.js';
    document.head.appendChild(vScript);
  }
  if (!document.querySelector('script[src*="/_vercel/speed-insights/script.js"]')) {
    const siScript = document.createElement('script');
    siScript.defer = true;
    siScript.src = '/_vercel/speed-insights/script.js';
    document.head.appendChild(siScript);
  }

  // 2. Google Consent Mode v2 Setup
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };

  let storedConsent = null;
  try { storedConsent = localStorage.getItem(CONSENT_KEY); } catch (_) {}

  // Set default consent state before GA4 library loads
  const isGranted = storedConsent === 'accept';
  window.gtag('consent', 'default', {
    ad_storage: isGranted ? 'granted' : 'denied',
    ad_user_data: isGranted ? 'granted' : 'denied',
    ad_personalization: isGranted ? 'granted' : 'denied',
    analytics_storage: isGranted ? 'granted' : 'denied',
    wait_for_update: 500
  });

  // Load GA4 library asynchronously
  if (!window.__brushGoogleAnalyticsLoaded) {
    window.__brushGoogleAnalyticsLoaded = true;
    window.gtag('js', new Date());
    window.gtag('config', measurementId, {
      anonymize_ip: true,
      cookie_flags: 'SameSite=None;Secure'
    });
    const gaScript = document.createElement('script');
    gaScript.async = true;
    gaScript.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
    document.head.appendChild(gaScript);
  }

  function saveConsent(value) {
    try { localStorage.setItem(CONSENT_KEY, value); } catch (_) {}
    if (value === 'accept') {
      window.gtag('consent', 'update', {
        ad_storage: 'granted',
        ad_user_data: 'granted',
        ad_personalization: 'granted',
        analytics_storage: 'granted'
      });
    } else {
      window.gtag('consent', 'update', {
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
        analytics_storage: 'denied'
      });
    }
  }

  function showBanner() {
    if (document.getElementById('analytics-consent')) return;
    const banner = document.createElement('aside');
    banner.id = 'analytics-consent';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Analytics consent');
    banner.innerHTML = `
      <div>
        <strong>Help us improve Brush</strong>
        <p>We use analytics to understand site usage and improve your experience. You can accept or decline optional cookies.</p>
      </div>
      <div class="analytics-consent-actions">
        <button type="button" data-consent="decline">Decline</button>
        <button type="button" data-consent="accept">Accept</button>
      </div>`;
    const style = document.createElement('style');
    style.textContent = `
      #analytics-consent { position: fixed; z-index: 10000; inset: auto 1rem calc(1rem + env(safe-area-inset-bottom)); bottom: calc(1rem + env(safe-area-inset-bottom)); max-width: 42rem; margin: auto; display: flex; gap: 1rem; align-items: center; justify-content: space-between; padding: 1rem 1.2rem; color: #fff; background: #171717; border: 1px solid rgba(255,255,255,.2); border-radius: 12px; box-shadow: 0 8px 30px rgba(0,0,0,.3); font: 14px/1.4 system-ui, sans-serif; }
      #analytics-consent p { margin: .25rem 0 0; opacity: .8; font-size: 13px; }
      .analytics-consent-actions { display: flex; gap: .5rem; flex-shrink: 0; }
      .analytics-consent-actions button { border: 1px solid rgba(255,255,255,.4); border-radius: 7px; padding: .55rem .8rem; color: inherit; background: transparent; cursor: pointer; font-weight: 500; }
      .analytics-consent-actions button[data-consent="accept"] { color: #171717; background: #fff; border-color: #fff; font-weight: 600; }
      @media (max-width: 600px) { #analytics-consent { display: block; } .analytics-consent-actions { margin-top: .8rem; } }
    `;
    document.head.appendChild(style);
    document.body.appendChild(banner);
    banner.addEventListener('click', (event) => {
      const button = event.target.closest('[data-consent]');
      if (!button) return;
      const value = button.dataset.consent;
      saveConsent(value);
      banner.remove();
    });
  }

  if (!storedConsent) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', showBanner);
    else showBanner();
  }
})();

// 3. Product Popularity & 2-Day Analytics Shuffle Engine
window.BrushAnalytics = (function () {
  const CLICKS_STORAGE_KEY = 'brush_analytics_clicks';
  const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

  function getClicks() {
    try {
      return JSON.parse(localStorage.getItem(CLICKS_STORAGE_KEY) || '{}') || {};
    } catch (_) {
      return {};
    }
  }

  function trackClick(productId, meta = {}) {
    if (!productId) return;
    const cleanId = String(productId).replace(/^global_|^minis_/, '');
    try {
      const clicks = getClicks();
      clicks[cleanId] = (Number(clicks[cleanId]) || 0) + 1;
      localStorage.setItem(CLICKS_STORAGE_KEY, JSON.stringify(clicks));
    } catch (_) {}

    if (typeof window.gtag === 'function') {
      try {
        window.gtag('event', 'select_item', {
          item_list_id: meta.listId || 'product_catalog',
          item_list_name: meta.listName || 'Product Catalog',
          items: [{
            item_id: cleanId,
            item_name: meta.name || ('Product ' + cleanId),
            item_category: meta.category || 'Posters'
          }]
        });
      } catch (_) {}
    }
  }

  function get2DayEpoch(time) {
    return Math.floor((time || Date.now()) / TWO_DAYS_MS);
  }

  function get2DayHash(id, epoch) {
    const numId = Number(String(id).replace(/\D/g, '')) || 1;
    const ep = Number(epoch) || 0;
    let h = (numId * 2654435761) ^ (ep * 2246822519);
    h = Math.imul(h ^ (h >>> 16), 2246822519);
    h = Math.imul(h ^ (h >>> 13), 3266489917);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  function computePopularityScore(p, clicksMap, epoch) {
    if (!p) return 0;
    const rawId = String(p.id || '').replace(/^global_|^minis_/, '');
    const clicks = clicksMap || getClicks();
    const ep = epoch !== undefined ? epoch : get2DayEpoch();

    const orders = Number(p.orderFrequency) || 0;
    const localClicks = Number(clicks[rawId]) || 0;
    const reviews = Array.isArray(p.reviews) ? p.reviews : [];
    const reviewCount = reviews.length;
    const validRatings = reviews.map(r => Number(r.rating)).filter(x => x >= 1 && x <= 5);
    const ratingAvg = validRatings.length ? validRatings.reduce((a, b) => a + b, 0) / validRatings.length : 0;

    // Interaction base proxy + real shopper click count
    const baseClicks = (orders * 12) + (reviewCount * 15) + (p.showInBestsellers ? 45 : 15);
    const totalClicks = baseClicks + localClicks;

    // Click Rate (CTR estimate) and Buy Rate (Conversion rate)
    const clickRate = totalClicks / Math.max(60, totalClicks * 3.5 + 80);
    const buyRate = orders / Math.max(1, totalClicks);

    const buyScore = Math.min(50, (buyRate * 200) + (orders * 3.5));
    const clickScore = Math.min(35, clickRate * 120);
    const ratingScore = Math.min(20, ratingAvg * reviewCount * 1.5);
    const badgeScore = (/best/i.test(p.badge || '') ? 20 : 0) + (p.showInGrossing ? 15 : 0);
    const bsScore = p.showInBestsellers ? 30 : 0;

    const baseScore = buyScore + clickScore + ratingScore + badgeScore + bsScore;
    // Deterministic 2-day shuffle variance (rotates posters smoothly every 48 hours)
    const shuffleVariance = (get2DayHash(rawId, ep) - 0.5) * 24;

    return baseScore + shuffleVariance;
  }

  return {
    getClicks,
    trackClick,
    get2DayEpoch,
    get2DayHash,
    computePopularityScore
  };
})();

