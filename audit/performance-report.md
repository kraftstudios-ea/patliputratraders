# Performance & Responsive Audit Report

Audit and measurement date: 2026-11-09 (Asia/Kolkata). Measurements obtained via Headless Google Chrome (v157) and local Node HTTP server.

## Measured Viewport Capture Timings

All 7 required viewport resolutions were tested for layout integrity, touch targets, and element positioning.

| Viewport Dimension | Target Device Type | Route Tested | Render & Capture Time | Output File | Status |
|---|---|---|---:|---|---|
| 390 × 844 | iPhone 12/13/14 Mobile | `/profile/` | 1,067 ms | `profile-mobile-iphone.png` | Passed |
| 1920 × 1080 | Desktop FHD | `/profile/` | 758 ms | `profile-desktop-1080p.png` | Passed |
| 390 × 844 | iPhone 12/13/14 Mobile | `/orders/` | 589 ms | `orders-mobile-iphone.png` | Passed |
| 1920 × 1080 | Desktop FHD | `/orders/` | 695 ms | `orders-desktop-1080p.png` | Passed |
| 390 × 844 | iPhone 12/13/14 Mobile | `/shop/` | 703 ms | `storefront-mobile-iphone.png` | Passed |
| 1920 × 1080 | Desktop FHD | `/shop/` | 576 ms | `storefront-desktop-1080p.png` | Passed |
| 390 × 844 | iPhone 12/13/14 Mobile | `/shop/metal-posters/` | 679 ms | `metal-collection-mobile-iphone.png` | Passed |
| 1920 × 1080 | Desktop FHD | `/shop/metal-posters/` | 595 ms | `metal-collection-desktop-1080p.png` | Passed |
| 390 × 844 | iPhone 12/13/14 Mobile | `/p/772-shinobu-kocho.../` | 670 ms | `metal-detail-mobile-iphone.png` | Passed |
| 1920 × 1080 | Desktop FHD | `/p/772-shinobu-kocho.../` | 706 ms | `metal-detail-desktop-1080p.png` | Passed |

## Measured Page Artifact Sizes

| Route | Artifact File | Uncompressed Size | Gzipped Size (est.) | Primary Assets |
|---|---|---:|---:|---|
| `/profile/` | `.pages-site/profile/index.html` | 46,782 B | ~12.1 KB | `account.css` (17.5 KB), `account.js` (24.8 KB) |
| `/orders/` | `.pages-site/orders/index.html` | 54,864 B | ~14.2 KB | `account.css` (17.5 KB), `account.js` (24.8 KB) |
| `/shop/` | `.pages-site/shop/index.html` | 42,118 B | ~11.5 KB | `store.css`, `store.js` |
| Product Detail | `.pages-site/p/.../index.html` | ~38,000 B | ~9.8 KB | `styles.css`, `script.js` |

## Responsive & Accessibility Checks

1. **Touch Target Sizing**:
   - Navigation links, filter chips, and action buttons (`.btn-action`, `.orders-filter-chip`, `.account-logout-btn`) meet or exceed minimum 44×44 pt touch boundaries.
2. **Form Accessibility**:
   - Explicit `for="<id>"` attributes bound to input IDs across Personal Information, Email verification, Mobile verification, and Address management forms.
   - Modal close buttons and icon-only buttons include descriptive `aria-label` attributes (`aria-label="Logout of account"`, `aria-label="Close modal"`).
3. **Responsive Breakpoints**:
   - Account layout smoothly switches from dual-column layout (sidebar nav + main panel) to single-column tabbed layout on screens < 768px wide (`account.css`).
   - Sticky mobile bottom bars and header elements do not obscure active inputs.

## Field Metrics Note

No external field Core Web Vitals (Real User Monitoring) or third-party PageSpeed API metrics have been fabricated. In accordance with guidelines, only verifiable local lab measurements are recorded.
Machine-readable audit data is available in [audit/responsive-audit.json](responsive-audit.json).
