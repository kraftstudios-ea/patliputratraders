# Implementation Changelog

Audit and implementation session: 2026-11-09 (Asia/Kolkata).

## Completed Changes & Implementations

### 1. Profile & My Orders Clean Production Routes
- **Root Cause Identified**:
  - Live production 404s were caused by production hosting running older commit `3f4790d4` before `public/orders.html` and `public/profile.html` were introduced.
  - Local backend 404s were caused by `CLEAN_PAGE_ROUTES` and `CLEAN_LINKS` in `Backend/server.js` omitting `orders.html` and `profile.html`.
- **Source Fixes Applied**:
  - Added `orders.html: /orders/` and `profile.html: /profile/` (along with `track.html` and `build-pack.html`) to `CLEAN_PAGE_ROUTES` and `CLEAN_LINKS` in `Backend/server.js`.
  - Added support for legacy `/posters/` mapping alongside canonical `/reels/`.
  - Added explicit accessibility bindings (`for="<input-id>"` and `aria-label` attributes) in `public/profile.html` and `public/orders.html`.
- **Verification**:
  - `npm run build` generated `.pages-site/orders/index.html` (54,864 bytes) and `.pages-site/profile/index.html` (46,782 bytes).
  - Tested `GET http://127.0.0.1:5500/orders/` -> 200 OK.
  - Tested `GET http://127.0.0.1:5500/profile/` -> 200 OK.
  - Profile and My Orders remain completely separate pages and clean URL routes.

### 2. Metal Poster Product Experience (5-View Gallery)
- **Reusable Mockup Pipeline**:
  - Expanded `tools/generate-metal-poster-images.py` to generate the complete 5-image gallery requested by the audit:
    1. `showcase.jpg`: True 3D perspective quad projection showing 3mm rigid aluminium composite panel thickness, machined silver edge with polyethylene core extrusion, rounded corners, soft diagonal satin specular sheen gradient, and natural cast contact shadow.
    2. `lifestyle.jpg`: Modern minimalist interior wall context showing realistic hanging scale, soft directional ambient lighting, and 3mm floating wall shadow.
    3. `finish.jpg`: Macro detail angle (2.5× magnification) of the corner radius, machined bevel chamfer, edge glint, and fine glare-free satin surface.
    4. `isolated.jpg`: Clean direct frontal studio render on neutral warm background with subtle bevel glint and drop shadow. (Mirrored to `metal.jpg` for backward compatibility).
    5. `mounting.jpg`: High-clarity 3-step installation diagram (`assets/MetalPosters/mounting-guide.jpg`) detailing peel-and-stick magnetic base, flush magnetic lock, and tool-free swappability.
- **Source Artwork Preservation**:
  - Original design artwork (`posters/...`) is strictly preserved as an **unchanged source layer** (`designImage`). No artwork was cropped, redrawn, recolored, or altered.
- **Thumbnail Optimization**:
  - Generated responsive WebP thumbnails for all 5 views across all 24 products into `public/img/w480/` and `public/img/w1080/`.
- **Supplier Specs & Commercial Integrity**:
  - All 24 metal poster listings strictly maintained at `stockQuantity: 0` to prevent orders until supplier confirmation is obtained.
  - Outlined required supplier rate card, dimension tolerances, magnetic hardware specs, and transit packaging confirmations in `audit/metal-posters.md`.

### 3. Catalog-Wide Data Integrity
- **Automated Audit Suite**:
  - Developed `tools/audit-catalog-integrity.js` validating all 555 products in `public/data/products.json` and `products_and_posters.csv`.
- **Results**:
  - 555/555 unique product IDs and unique SKUs.
  - 555/555 primary images exist and verified on disk.
  - 100% of design images and gallery images exist on disk.
  - 0 invalid prices, 0 negative stock quantities.
  - All 24 Metal Posters verified out of stock (`stockQuantity: 0`).
  - Generated machine-readable report: `audit/catalog-integrity-report.json`.

### 4. Responsive Viewport & Accessibility Verification
- **Automated Headless Chrome Audit**:
  - Developed `tools/capture-responsive-audit.js` leveraging Headless Chrome (v157).
  - Tested layout across all 7 requested viewport sizes:
    * 360×800 (Small Android)
    * 390×844 (iPhone 12/13/14)
    * 430×932 (iPhone Pro Max)
    * 768×1024 (iPad Portrait)
    * 1024×768 (iPad Landscape)
    * 1366×900 (Laptop)
    * 1920×1080 (Desktop FHD)
  - Captured 10 desktop and mobile screenshots in `audit/screenshots/`.
  - Machine-readable report saved to `audit/responsive-audit.json`.

### 5. Master E-Commerce Functional & Security Suite
- **Automated Test Orchestrator**:
  - Developed `tools/audit-ecommerce-flows.js` executing 6 core suites:
    1. Pricing & Cart Calculation Parity (`charges-parity.js`) -> 26/26 passed.
    2. AR Poster Contract (`ar-poster-contract.js`) -> passed.
    3. Progressive Product Feed & Pagination (`product-feed-progressive.js`) -> 7/7 passed.
    4. Catalog-Wide Integrity (`audit-catalog-integrity.js`) -> 555 products passed.
    5. Clean Page Routes & SEO (`audit-pages.js`) -> 17 clean routes passed.
    6. Profile OTP Security Flow (`profile-otp-test.js`) -> 8/8 steps passed.
  - Generated machine-readable report: `audit/ecommerce-tests-report.json`.

## Current Status & Blockers

- **All Local Tests**: PASSED (6/6 suites, 0 errors).
- **Static Pages Build**: Complete and verified in `.pages-site` (555 products, 30 collections, 594 sitemap URLs).
- **Blockers**:
  1. *Production Deployment*: Worktree changes must be committed and shipped to production hosting (Vercel / GitHub Pages) to resolve live 404s.
  2. *Supplier Confirmation*: Rate card, dimensions, magnetic hardware, and drop packaging must be verified before making metal posters orderable.
  3. *Payment Gateway*: Live payment transactions withheld per test safety guidelines.
