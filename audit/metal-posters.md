# Metal Poster Product Experience & Audit

Audit and implementation date: 2026-11-09 (Asia/Kolkata).

## Implementation Overview

The metal poster pipeline has been upgraded to provide a full 5-image gallery experience for all 24 anime metal posters in the catalog. The mockup generation pipeline operates deterministically via `tools/generate-metal-poster-images.py`.

### 5 Consistent Gallery Views

| View # | Kind | Label | Description & Visual Characteristics |
|---|---|---|---|
| 1 | `showcase` | Showcase | **Hero 3/4 Perspective Mockup**: True 3D perspective quad projection showing 3mm rigid aluminium composite thickness, machined silver bevel edge, dark polyethylene core extrusion, smooth rounded corners, soft diagonal satin specular sheen gradient, and natural contact/diffuse shadow on studio background. |
| 2 | `lifestyle` | In Room | **Interior Wall Context**: Centered eye-level installation on a minimalist architectural wall with realistic proportions, ambient room lighting, and a 3-4mm floating drop shadow characteristic of magnetic mounting. |
| 3 | `finish` | Finish & Edge | **Macro Close-Up**: 2.5× magnification corner framing highlighting the machined rounded radius, dual-layer aluminium edge profile, specular edge glint, and fine glare-free satin dot density. |
| 4 | `isolated` | Isolated Print | **Clean Studio Frontal View**: Direct frontal render on a neutral studio background with subtle perimeter glint and grounding shadow. (Also mirrored as `metal.jpg` for legacy route compatibility). |
| 5 | `mounting` | Magnetic Mount | **Mounting Demonstration**: High-clarity 3-step technical diagram (`assets/MetalPosters/mounting-guide.jpg`) detailing: (1) Peel & stick wall base, (2) Flush magnetic lock, and (3) Tool-free damage-free swappability. |

### Source Artwork Preservation

- **Zero Artwork Alteration**: The original artwork design is preserved as an **unchanged base layer** referenced by `designImage` (`posters/...`).
- No source images were overwritten, cropped, redrawn, or color-altered.
- In `public/script.js`, `buildMetalPosterGallery()` provides the full 5-slide gallery carousel plus an optional 6th high-resolution view of the pure artwork for detailed inspection.
- Responsive WebP thumbnails for all 5 views were generated into `public/img/w480/` and `public/img/w1080/`.

## Supplier Specifications & Business Confirmation Blockers

As required, no supplier details, rate cards, or delivery claims have been fabricated:

1. **Inventory Control**: All 24 metal poster records remain strictly set to `stockQuantity: 0`. They are displayed for merchandising discovery but cannot be ordered through checkout until supply is verified.
2. **Pricing Structure**: Base price is configured in catalog as ₹579 (original ₹799) pending vendor rate card confirmation.
3. **Required Supplier Confirmations**:
   - **Rate Card**: Final manufacturing cost and unit economics per panel size.
   - **Size Tolerances**: Confirmation of actual physical sheet sizes (nominally 8 × 11.7 in / A4 and 11.7 × 15.7 in / A3).
   - **Magnetic Hardware**: Supplier part number, pull strength rating, and adhesive tape specification (e.g., 3M VHB) for the wall mount kit.
   - **Packaging & Transit**: Drop-test confirmation and packaging crate/envelope specification to prevent edge dings during courier handling.

## Verification Evidence

- Generator script: `/usr/local/bin/python3 tools/generate-metal-poster-images.py` (rendered all 24 items).
- Automated integrity test: `node tools/audit-catalog-integrity.js` passed with 0 errors.
- Visual screenshots:
  - Mobile: `audit/screenshots/metal-detail-mobile-iphone.png`
  - Desktop: `audit/screenshots/metal-detail-desktop-1080p.png`
