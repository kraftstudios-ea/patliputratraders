# Product Catalogue Audit

Audit Date: 2026-11-09 (Asia/Kolkata). Scope: 100% automated inspection of all 555 catalog records across `public/data/products.json` and `products_and_posters.csv`.

## Catalogue Composition

| Product Type | Count | Stock Status | Primary Media |
|---|---:|---|---|
| Posters | 290 | In Stock / Active | High-res print JPG / WebP |
| poster (legacy tag) | 116 | In Stock / Active | High-res print JPG / WebP |
| Digital Assets | 46 | In Stock / Digital | High-res WebP bundles |
| Stickers | 24 | In Stock / Active | Kiss-cut sheet WebP |
| Metal Posters | 24 | **Out of Stock (`stockQuantity: 0`)** | 5-view gallery (Showcase, In Room, Finish, Isolated, Mount) |
| apparel (T-Shirts) | 8 | In Stock / Active | Apparel mockup + flat art |
| poster_3_pack | 8 | In Stock / Active | 3-pack collage mockup |
| Tapestry | 6 | In Stock / Active | Room + flat wall tapestry JPG |
| Wallpapers | 6 | In Stock / Active | Room + pattern + detail WebP |
| hoodie | 6 | In Stock / Active | Front/back mockup + print art |
| Collectibles | 4 | In Stock / Active | Multi-angle studio WebP |
| poster_pack_10 / 15 / 20 / 25 / 2_pack | 17 | In Stock / Active | Multi-pack mockups |
| **Total** | **555** | **64 zero-stock records** | **100% verified on disk** |

## Verification Checks Passed

1. **Identifier Integrity**:
   - 555/555 unique product IDs. No `null`, `undefined`, or NaN IDs found.
   - All populated SKUs are globally unique across the catalogue.
2. **Media and Artwork Matching**:
   - 555/555 primary images exist at their exact relative paths under `public/`.
   - All 24 metal poster records have valid `designImage` pointing to the unchanged original poster artwork.
   - All 120 generated metal gallery images (5 per product) exist and are validated.
3. **Pricing & Inventory Safety**:
   - All 555 products have positive numeric prices.
   - No products have `originalPrice < price`.
   - All 24 Metal Posters strictly have `stockQuantity: 0` to prevent accidental checkout before supplier confirmation.
4. **SEO & Route Integrity**:
   - All 555 products generate valid, non-empty SEO slugs matching `/p/<id>-<slug>/`.
   - Directory index pages generated in `.pages-site/p/` match route inventory.

## Machine-Readable Evidence

The complete machine-readable audit output is saved to [audit/catalog-integrity-report.json](catalog-integrity-report.json).
Automated verification command: `node tools/audit-catalog-integrity.js`.
