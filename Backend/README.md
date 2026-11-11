# Brush Backend Architecture

Express.js backend service powering authentication, cart calculations, order processing, Razorpay/Cashfree payment integrations, AR QuickLook validation, and Qikink print fulfillment.

## Directory Structure

* **`server.js`**: Core HTTP server, REST API endpoints (`/api/...`), webhook endpoints, SSR pre-render cache, and session management.
* **`productTypes.js`**: Central product configuration, pricing formulas, discount tiers (Buy X Get Y), delivery charges, and prepaid constraints. **Critical:** Must maintain exact parity with client-side `public/cart.js`.
* **`qikink.js` & `qikink-map.js`**: Print fulfillment API client and SKU-to-provider mappings.
* **`invoiceTemplate.js` & `orderEmailTemplate.js`**: Order invoice generator and transactional email templates.
* **Catalog Definitions**:
  * `collectiblesCatalog.js`
  * `digitalAssetCatalog.js`
  * `metalPosterCatalog.js`
  * `stickerCatalog.js`
  * `tapestryCatalog.js`
  * `wallpaperCatalog.js`
* **`tests/`**: Parity test suite:
  * `charges-parity.js`: Rigorously verifies mathematical pricing equality between backend (`productTypes.js`) and frontend (`public/cart.js`).
  * `ar-poster-contract.js`: Contract tests for AR USDZ models and QuickLook URLs.
* **`scripts/`**: Database migrations, initializers, and seeders.
  * `scripts/legacy/`: Historical one-off migration and patch scripts.

## Running Tests

```bash
npm test
```
