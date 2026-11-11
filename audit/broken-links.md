# Broken links and routes

Audit and verification date: 2026-11-09 (Asia/Kolkata).

## Production vs Local Route Status

| Route | Live URL | Production Status | Local / Preview Status | Severity | Root Cause & Resolution |
|---|---|---:|---:|---|---|
| `/profile/` | `https://www.brush-art.in/profile/` | 404 | 200 OK (verified) | High | **Production Root Cause:** Production hosting runs older commit `3f4790d4` before `public/profile.html` was committed.<br>**Local Root Cause:** `CLEAN_PAGE_ROUTES` in `Backend/server.js` lacked clean mapping for `profile.html`.<br>**Fix:** Added `/profile.html: /profile/` to `CLEAN_PAGE_ROUTES` and `CLEAN_LINKS` in `Backend/server.js`. Verified `.pages-site/profile/index.html` generates properly and responds with 200 OK. |
| `/orders/` | `https://www.brush-art.in/orders/` | 404 | 200 OK (verified) | High | **Production Root Cause:** Production runs older commit `3f4790d4` before `public/orders.html` was committed.<br>**Local Root Cause:** `CLEAN_PAGE_ROUTES` in `Backend/server.js` lacked clean mapping for `orders.html`.<br>**Fix:** Added `/orders.html: /orders/` to `CLEAN_PAGE_ROUTES` and `CLEAN_LINKS` in `Backend/server.js`. Verified `.pages-site/orders/index.html` generates properly and responds with 200 OK. Profile and My Orders pages remain completely separate. |

## Verification Evidence

1. **Local Build Verification:**
   - Command: `npm run build` (`node tools/build-pages-site.js .pages-site`)
   - Output files:
     - `.pages-site/orders/index.html` (54,864 bytes)
     - `.pages-site/profile/index.html` (46,782 bytes)
2. **Local Preview / Backend Server Smoke Test:**
   - `GET http://127.0.0.1:5500/orders/` -> HTTP 200 OK (Title: `My Orders — Track Shipments & Purchases | Brush`)
   - `GET http://127.0.0.1:5500/profile/` -> HTTP 200 OK (Title: `My Profile — Personal Information & Addresses | Brush`)
   - `GET http://127.0.0.1:5500/orders.html` -> HTTP 301 Redirect -> `/orders/`
   - `GET http://127.0.0.1:5500/profile.html` -> HTTP 301 Redirect -> `/profile/`
3. **Responsive Visual Captures:**
   - Mobile (390×844): `audit/screenshots/orders-mobile-iphone.png` and `audit/screenshots/profile-mobile-iphone.png`
   - Desktop (1920×1080): `audit/screenshots/orders-desktop-1080p.png` and `audit/screenshots/profile-desktop-1080p.png`

## Outstanding Blockers

- **Deployment Blocker:** Changes must be committed and deployed to production hosting (Vercel / GitHub Pages) to resolve the live 404 errors. Per audit policy, production deployments were not initiated.
