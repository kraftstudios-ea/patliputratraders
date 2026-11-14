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
  const custom = window.__BACKEND_URL__ || (typeof localStorage !== 'undefined' && localStorage.getItem('patliputra_backend_url'));
  if (custom) {
    const clean = custom.replace(/\/+$/, '');
    return clean.endsWith('/api') ? clean : `${clean}/api`;
  }
  const hostname = window.location.hostname;
  if (isLocalHost(hostname)) {
    const port = window.location.port;
    const backendPort = (port === '9000' || port === '3000' || port === '8080' || port === '5500' || !port) ? '9050' : port;
    return `${window.location.protocol}//${hostname}:${backendPort}/api`;
  }
  return 'https://patliputratraders.onrender.com/api';
};

window.API_BASE = getApiBase();
window.IS_LOCAL_HOST = isLocalHost(window.location.hostname);
var IS_LOCAL_HOST = window.IS_LOCAL_HOST;
var API_BASE = window.API_BASE;

// ============================================================================
// PATLIPUTRA TRADERS LIGHTING CATALOG CACHE & FAST DATA LOADER
// - Live Light Database queries served directly from Backend API
// - Stale-While-Revalidate background updates
// - In-flight promise deduplication
// - Automatic graceful fallback to edge /data/products.json if backend is sleeping
// ============================================================================
(function() {
  const CACHE_KEY = 'patliputra_lighting_catalog_v3';
  const CACHE_TTL = 3 * 60 * 1000; // 3 minutes
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
    // 1. Live Light Database via Backend API
    try {
      const data = await fetchNetwork(`${window.API_BASE}/products`);
      const list = Array.isArray(data) ? data : (data && Array.isArray(data.products) ? data.products : null);
      if (list && list.length > 0) {
        return list;
      }
    } catch (err) {
      console.warn('⚠️ Backend API unreachable or loading, checking edge fallback:', err.message);
    }

    // 2. Static Edge Catalogue fallback (if backend is cold/sleeping or offline)
    try {
      const edgeData = await fetchNetwork('/data/products.json');
      const edgeList = Array.isArray(edgeData) ? edgeData : (edgeData && Array.isArray(edgeData.products) ? edgeData.products : null);
      if (edgeList && edgeList.length > 0) {
        return edgeList;
      }
    } catch (_) {}

    return [];
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
