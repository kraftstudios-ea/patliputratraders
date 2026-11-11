# E-Commerce Functional & Security Tests

Audit and test date: 2026-11-09 (Asia/Kolkata). Executed in non-production workstation environment against local Node backend and static Pages build.

## Test Matrix & Results

| Flow / Suite | Result | Scope & Evidence | Notes / Blockers |
|---|---|---|---|
| **Price Calculation & Cart Parity** | **Passed** | `node Backend/tests/charges-parity.js` passed all 26 assertions. Verified subtotal, taxes, shipping tiers, launch offer (₹50 off ₹399+), prepaid discount, COD fee (₹34), and buy-N-get-M free deals. | Zero discrepancies between server and client calculators. |
| **AR Poster Contract** | **Passed** | `node Backend/tests/ar-poster-contract.js` verified Quick Look USDZ model links, aspect ratios, and dimensions. | Passed contract invariants. |
| **Progressive Product Feed & Infinite Scroll** | **Passed** | `node Backend/tests/product-feed-progressive.js` passed 7/7 test cases (A through G). Feeds never terminate early; New Arrivals maintains strict descending chronological order; hard vs soft filters separated. | Feed architecture verified. |
| **Catalog-Wide Data Integrity** | **Passed** | `node tools/audit-catalog-integrity.js` inspected all 555 products. Unique IDs, unique SKUs, valid prices, 100% existing image assets. | All 24 Metal Posters verified out of stock (`stockQuantity: 0`). |
| **Clean Route & SEO Structure** | **Passed** | `npm run audit:pages` verified 17 clean directory routes in `.pages-site`. Meta tags, OpenGraph tags, schema JSON-LD, canonical links verified. | Pages build verified. |
| **Profile OTP Verification & Security** | **Passed** | `node Backend/tests/profile-otp-test.js` executed complete 8-step authenticated workflow: signup, OTP dispatch via Resend API, rejection of incorrect OTP (400), successful verification (200), email update persistence, duplicate email collision rejection (400), and mobile OTP update persistence. | Rate limiting (`authLimiter`) and customer-data isolation verified. |
| **Profile & Orders Navigation (Local)** | **Passed** | `http://127.0.0.1:5500/orders/` and `/profile/` return HTTP 200 OK with distinct HTML documents. Legacy `.html` requests return 301 redirects. | Pages kept separate. |
| **Profile & Orders Navigation (Live)** | **Open (Deploy Blocker)** | Live routes `https://www.brush-art.in/orders/` and `/profile/` return 404 because production is running older commit `3f4790d4`. | Blocked until deployment of current worktree. |
| **Live Payment & Real Charges** | **Blocked by Policy** | No production orders or real payment captures were triggered. | Test fixtures and simulated webhooks used exclusively. |
| **Metal Poster Orderability** | **Blocked by Policy** | Metal posters maintained at `stockQuantity: 0` to prevent orders until supplier rate card and hardware are confirmed. | Supplier confirmation required. |

## Machine-Readable Test Report

The complete automated test results and metadata are recorded in [audit/ecommerce-tests-report.json](ecommerce-tests-report.json).
Master runner command: `node tools/audit-ecommerce-flows.js`.
