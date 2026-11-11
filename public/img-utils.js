// ========================================
// BRUSH — Image helpers (shared)
//
//  BrushImg.src(product, size)  -> best URL to render for a product card
//  BrushImg.attrs(product, size) -> src + fallback data-attributes string
//  BrushImg.onError(img)         -> staged fallback: thumbnail -> original -> placeholder
//
// Catalog photos are 1–6 MB originals. Resized WebP copies live in
// img/w480/ and img/w1080/ (same relative path, .webp extension) —
// regenerate them after adding products with tools/make-thumbs.py.
// Anything without a thumbnail (e.g. a fresh admin upload) silently falls
// back to the original, and a broken original falls back to a placeholder.
// ========================================
(function () {
  var LOCAL_ROOTS = /^(assets|posters|uploads)\//i;

  // BASE is the directory this script itself is served from, so it is correct
  // for a root deployment (''), a project page ('Brush-Production/'), and any
  // other sub-path, without hardcoding the repo name.
  var BASE = (function () {
    var self = document.currentScript && document.currentScript.src;
    if (!self) return '';
    try {
      return new URL(self, window.location.href).pathname
        .replace(/[^/]*$/, '')   // drop the filename
        .replace(/^\//, '');     // and the leading slash
    } catch (e) { return ''; }
  })();
  var PLACEHOLDER_TYPES = { stickers: 1, collectibles: 1, wallpapers: 1 };

  function typeKey(p) {
    return String((p && p.productType) || 'posters').toLowerCase();
  }

  function isDummy(p) {
    var kw = p && p.keywords;
    var list = Array.isArray(kw) ? kw : String(kw || '').split(',');
    return list.some(function (k) { return String(k).trim().toLowerCase() === 'dummy'; }) ||
      /images\.unsplash\.com/.test(String((p && p.image) || ''));
  }

  function placeholder(p) {
    var t = typeKey(p);
    if (!PLACEHOLDER_TYPES[t]) return '/img/placeholders/fallback.webp';
    var n = (Math.abs(parseInt(p.id, 10) || 0) % 6) + 1;
    return '/img/placeholders/' + t + '-' + n + '.webp';
  }

  function relPath(url) {
    if (!url) return null;
    var s = String(url).trim();
    try {
      if (/^https?:\/\//i.test(s)) {
        var u = new URL(s, window.location.href);
        s = u.pathname.replace(/^\//, '');
      } else {
        s = s.replace(/^\//, '');
      }
    } catch (e) {
      s = s.replace(/^[a-z]+:\/\/[^/]+\//i, '').replace(/^\//, '');
    }
    try { s = decodeURIComponent(s); } catch (e) {}
    if (BASE && s.indexOf(BASE) === 0) {
      s = s.slice(BASE.length).replace(/^\//, '');
    }
    s = s.replace(/^img\/w(480|1080)\//i, '');
    if (LOCAL_ROOTS.test(s)) return s;
    return null;
  }

  function thumb(url, size) {
    var rel = relPath(url);
    if (!rel) return null;
    // The thumbnail pipeline publishes 480 px and 1080 px derivatives.
    // Smaller UI requests (such as the 300 px product-modal strip) must use
    // the 480 px asset; requesting img/w300/ falls through to multi-megabyte
    // originals because that derivative tree does not exist.
    var derivativeSize = Number(size) >= 1080 ? 1080 : 480;
    var prefix = BASE ? '/' + BASE.replace(/\/+$/, '') + '/' : '/';
    return prefix + 'img/w' + derivativeSize + '/' + encodeURI(rel.replace(/\.(jpe?g|png|webp)$/i, '')) + '.webp';
  }

  function srcSet(url) {
    var rel = relPath(url);
    if (!rel) return '';
    var prefix = BASE ? '/' + BASE.replace(/\/+$/, '') + '/' : '/';
    var clean = encodeURI(rel.replace(/\.(jpe?g|png|webp)$/i, ''));
    return prefix + 'img/w480/' + clean + '.webp 480w, ' + prefix + 'img/w1080/' + clean + '.webp 1080w';
  }

  function original(p) {
    return isDummy(p) ? placeholder(p) : String((p && p.image) || '');
  }

  function src(p, size) {
    var orig = original(p);
    return thumb(orig, size) || orig || placeholder(p);
  }

  function esc(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  function attrs(p, size) {
    var orig = original(p);
    var targetSize = Number(size) || 480;
    var s = src(p, targetSize);
    var ss = srcSet(orig);
    var sizesValue = targetSize >= 1080 ? '(max-width: 600px) 480px, 1080px' : '(max-width: 600px) 480px, 600px';
    var srcsetAttr = ss ? ' srcset="' + esc(ss) + '" sizes="' + sizesValue + '"' : '';
    return 'src="' + esc(s) + '"' + srcsetAttr + ' data-orig="' + esc(orig) +
      '" data-fallback="' + esc(placeholder(p)) + '" onload="this.classList.add(\'loaded\')" onerror="BrushImg.onError(this)"';
  }

  function onError(img) {
    var stage = img.dataset.stage || '0';
    var orig = img.dataset.orig;
    if (stage === '0' && orig && img.getAttribute('src') !== orig) {
      img.dataset.stage = '1';
      img.src = orig;
    } else if (stage !== '2') {
      img.dataset.stage = '2';
      img.src = img.dataset.fallback || '/img/placeholders/fallback.webp';
    }
    img.classList.add('loaded');
  }

  // Cart line items only store a URL, not the product — same fallback chain.
  function urlAttrs(url, size) {
    var targetSize = Number(size) || 480;
    var t = thumb(url, targetSize);
    var ss = srcSet(url);
    var sizesValue = targetSize >= 1080 ? '(max-width: 600px) 480px, 1080px' : '(max-width: 600px) 480px, 600px';
    var srcsetAttr = ss ? ' srcset="' + esc(ss) + '" sizes="' + sizesValue + '"' : '';
    return 'src="' + esc(t || url) + '"' + srcsetAttr + ' data-orig="' + esc(url) +
      '" data-fallback="/img/placeholders/fallback.webp" onload="this.classList.add(\'loaded\')" onerror="BrushImg.onError(this)"';
  }

  // Every product image starts at opacity 0 and fades in once it gets
  // .loaded (styles.css). script.js sets it via inline onload on the cards
  // it renders, but other templates (checkout summary, order confirmation)
  // never did, so their poster mockups stayed invisible. One capture-phase
  // listener covers every page that loads this file.
  var FADE_IN = '.mockup-frame, .mockup-poster, .mockup-hover, .plain-product-image, .modal-plain-image, .product-card-hover-mockup, .ag-slide img, .product-gallery-main img';
  document.addEventListener('load', function (e) {
    var t = e.target;
    if (t && t.tagName === 'IMG' && t.matches(FADE_IN)) t.classList.add('loaded');
  }, true);

  // Check already cached images to avoid any fade delay on instant cache hits
  function checkCachedImages() {
    var imgs = document.querySelectorAll(FADE_IN);
    for (var i = 0; i < imgs.length; i++) {
      var img = imgs[i];
      if (img.complete && img.naturalWidth > 0) {
        img.classList.add('loaded');
      }
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkCachedImages);
  } else {
    checkCachedImages();
  }

  // Lazy-load framed card hover mockups strictly on user interaction (pointerenter).
  // Prevents downloading 24-50 hidden images on initial page load, saving 1.5-3MB data per page.
  document.addEventListener('pointerenter', function (e) {
    var card = e.target && e.target.closest && e.target.closest('.product-card, .store-card, .col-card');
    if (!card) return;
    var mockup = card.querySelector('.product-card-hover-mockup[data-mockup]');
    if (mockup && !mockup.src) {
      mockup.src = mockup.getAttribute('data-mockup');
      mockup.removeAttribute('data-mockup');
      mockup.onload = function () { mockup.classList.add('loaded'); };
      mockup.onerror = function () { mockup.remove(); };
    }
  }, true);

  window.BrushImg = { src: src, attrs: attrs, urlAttrs: urlAttrs, onError: onError, original: original, isDummy: isDummy };
})();
