// True only for a local dev host — exact loopback names, or a genuine RFC1918 address.
const isLocalHost = (hostname) => (
  hostname === 'localhost' ||
  hostname === '127.0.0.1' ||
  hostname === '[::1]' ||
  hostname.endsWith('.localhost') ||
  /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
  /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
  /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(hostname)
);

window.MAINTENANCE_MODE = false;

const getApiBase = () => {
  const hostname = window.location.hostname;
  if (isLocalHost(hostname)) {
    const port = window.location.port;
    const backendPort = (port === '9000' || port === '3000' || port === '8080' || port === '5500' || !port) ? '9050' : port;
    return `${window.location.protocol}//${hostname}:${backendPort}/api`;
  }
  return `${window.location.origin}/api`;
};

window.API_BASE = getApiBase();
window.IS_LOCAL_HOST = isLocalHost(window.location.hostname);
var IS_LOCAL_HOST = window.IS_LOCAL_HOST;
var API_BASE = window.API_BASE;

// ============================================================================
// BRUSH UNIFIED CATALOG CACHE & FAST DATA LOADER
// - Instant 0ms loads from sessionStorage across internal navigations
// - Stale-While-Revalidate background updates
// - In-flight promise deduplication
// - Automatic graceful fallback to production API if local backend is offline
// ============================================================================
(function() {
  const CACHE_KEY = 'brush_catalog_v2';
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  let inFlight = null;

  function readCache() {
    try {
      if (typeof sessionStorage === 'undefined') return null;
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.data) && parsed.data.length > 0) {
        return parsed;
      }
    } catch (_) {}
    return null;
  }

  function writeCache(data) {
    try {
      if (typeof sessionStorage !== 'undefined' && Array.isArray(data) && data.length > 0) {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data, time: Date.now() }));
      }
    } catch (_) {}
  }

  async function fetchNetwork(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  }

  async function loadFresh() {
    // 1. Static Edge Catalogue: same-origin, 0ms CORS, CDN-cached, fast ~15ms load
    try {
      const edgeData = await fetchNetwork('/data/products.json');
      const edgeList = Array.isArray(edgeData) ? edgeData : (edgeData && Array.isArray(edgeData.products) ? edgeData.products : null);
      if (edgeList && edgeList.length > 0) {
        return edgeList;
      }
    } catch (_) {}

    // 2. Production or Local API
    try {
      const data = await fetchNetwork(`${window.API_BASE}/products`);
      return Array.isArray(data) ? data : (data && Array.isArray(data.products) ? data.products : []);
    } catch (err) {
      if (window.API_BASE !== 'https://brush-production.onrender.com/api') {
        try {
          console.warn('⚠️ Local backend unreachable, falling back to production backend:', err.message);
          window.API_BASE = 'https://brush-production.onrender.com/api';
          API_BASE = window.API_BASE;
          const fallback = await fetchNetwork(`${window.API_BASE}/products`);
          return Array.isArray(fallback) ? fallback : (fallback && Array.isArray(fallback.products) ? fallback.products : []);
        } catch (_) {}
      }
      throw err;
    }
  }

  function revalidateInBackground() {
    fetchNetwork(`${window.API_BASE}/products`)
      .then(res => {
        const data = Array.isArray(res) ? res : (res && Array.isArray(res.products) ? res.products : null);
        if (data && data.length > 0) {
          writeCache(data);
          window.dispatchEvent(new CustomEvent('brush:catalog-updated', { detail: { products: data } }));
        }
      })
      .catch(() => {});
  }

  window.BrushCatalog = {
    invalidate() {
      try { sessionStorage.removeItem(CACHE_KEY); } catch (_) {}
    },
    async getProducts(forceFresh = false) {
      if (!forceFresh) {
        const cached = readCache();
        if (cached) {
          const age = Date.now() - (cached.time || 0);
          if (age > CACHE_TTL) {
            // Stale cache: return immediately to render in 0ms, revalidate in background
            revalidateInBackground();
          }
          return cached.data;
        }
      }

      if (inFlight) return inFlight;

      inFlight = (async () => {
        try {
          const data = await loadFresh();
          writeCache(data);
          return data;
        } finally {
          inFlight = null;
        }
      })();

      return inFlight;
    },

    clearCache() {
      try {
        if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(CACHE_KEY);
      } catch (_) {}
    }
  };

  // Expose global shorthand for compatibility
  window.BrushGetProducts = function() {
    return window.BrushCatalog.getProducts();
  };

  // Immediate 0ms warmup during head execution
  try {
    if (typeof window !== 'undefined' && window.BrushCatalog) {
      window.BrushCatalog.getProducts().catch(() => {});
    }
  } catch (_) {}
})();
