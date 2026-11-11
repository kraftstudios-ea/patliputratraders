# Mobile & Touch Optimization — Implementation Plan

**Project:** Brush e-commerce frontend  
**Scope:** `public/` only — no backend changes  
**Audit base:** styles.css (6 395 LOC), script.js (2 795), cart.js (993), store.css, reels.css, site-overlays.js, global-navbar.js, global-footer.js, checkout.html, poster-reels.html, all other HTML pages

---

## Summary of findings

The site is already well-architected for touch in several areas: micro-interactions.js gates the cursor RAF loop and magnetic buttons behind `(pointer: fine)`, product-quick-actions are hidden with `display:none` on mobile via `@media (max-width: 480px)`, the reels feed uses `scroll-snap-type: y mandatory` and `overscroll-behavior-y: contain`, the store bottom sheets use safe-area insets, and touch-enabled galleries in the product modal already handle `touchstart/touchmove/touchend`.

Remaining gaps are:

1. **Viewport meta** — `viewport-fit=cover` is missing from every page that uses `env(safe-area-inset-*)` (checkout.html, all_products.html, and all pages that load styles.css with the modal sticky CTA and cart drawer footer).
2. **Touch targets** — `.cart-close-btn` is 36 × 36 px; `.nav-action-btn` and `.menu-toggle` shrink to 32 × 32 px at ≤ 480 px; `.qty-control button` in the cart is 30 × 30 px; `.auth-close-btn / .profile-close-btn` have no explicit size; `.facet-option` in the store filter sheet is only 34 px tall; `.filter-chip` has 6 px vertical padding (total ~28 px); the search submit button is 38 × 38 px.
3. **Input font-size / iOS zoom** — `select { font-size: 0.9rem }` (≈ 14.4 px at 16 px base) triggers iOS auto-zoom on focus. The checkout `.form-group input/select/textarea { font-size: 0.92rem }` (≈ 14.7 px) is borderline. The auth/profile form inputs inherit from `.form-group input` in styles.css which has no explicit font-size set, inheriting `1rem`—fine, but the global `select` rule overrides this. The reels genre `select` in reels.css uses `font-size: var(--text-micro)` (0.75 rem ≈ 12 px)—will trigger zoom.
4. **`-webkit-tap-highlight-color`** — never set site-wide; custom-styled buttons and links will flash the default blue/grey rectangle on tap.
5. **Reels `touch-action`** — `.reels-feed` has no `touch-action` declaration; `.reel-stage` has `touch-action: manipulation` which suppresses double-tap zoom but also disables the vertical pan-y that the feed scroll-snap relies on. The container needs `touch-action: pan-y` so the browser handles vertical swipe natively and the double-tap-to-add still works through `pointerup`.
6. **Cart drawer footer** — `.cart-drawer-footer` has no `env(safe-area-inset-bottom)` padding, so on iPhone notch/Dynamic Island the checkout button sits in the home-indicator zone.
7. **Hover-only product card lift** — `.product-card:hover { transform: translateY(-6px) }` fires on touch because iOS dispatches a hover event on first tap. It needs a `@media (hover: hover)` guard.
8. **Scroll-to-top button** — fixed at `bottom: 30px` with no safe-area adjustment; overlaps iPhone home bar.
9. **Analytics consent banner** — already uses `env(safe-area-inset-bottom)` in its inline CSS, good.
10. **Lenis on touch** — `scroll.js` is already gated behind `prefers-reduced-motion` but not behind `pointer: coarse`/touch. On iOS Safari, Lenis overrides native momentum scroll, which can interfere with the overscroll-bounce feel. The poster-reels page correctly excludes Lenis, but other pages do not disable it on touch.
11. **Search overlay close button** — `.search-close-btn { display: none }` leaves no visible close affordance on mobile; the overlay can only be dismissed by clicking the backdrop — there is no explicit accessible close path for touch users.
12. **`font-size` on `<body>` body text** — base is `1rem` / `--text-body: 1rem`, fine. But many UI labels use `0.7–0.8rem` (11–13 px) e.g. cart add-on prices, badge text, reel action labels — these are below the 14 px minimum for readable body copy.

---

## Implementation Plan

Items are ordered by dependency. Each item leaves the codebase in a buildable, testable state.

---

- [ ] **1. Add `viewport-fit=cover` to all pages that render safe-area-dependent UI**

  Every page loads `styles.css`, which contains the sticky modal CTA (`env(safe-area-inset-bottom)` in the `@media (max-width: 768px)` block). `checkout.html` adds its own mobile bar with `env(safe-area-inset-bottom)`. `all_products.html` renders the store bottom sheets (safe-area in store.css). Without `viewport-fit=cover`, `env(safe-area-inset-bottom)` resolves to `0` and the UI overlaps the home indicator on iPhone.

  **Files:** `public/index.html`, `public/all_products.html`, `public/checkout.html`, `public/about_us.html`, `public/institutional.html`, `public/policies.html`, `public/order-confirmation.html`, `public/special_day.html`, `public/reset-password.html`, `public/style_options.html`, `public/404.html`, `public/maintenance.html`

  **What to change:** For each file, find the line:
  ```html
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ```
  Replace with:
  ```html
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  ```
  (`admin.html` and `poster-reels.html` already have `viewport-fit=cover` — skip them.)

  **Why it matters:** Without this, `env(safe-area-inset-bottom)` is always 0 on iPhones with a home indicator. The sticky modal Add-to-cart button, the cart drawer footer, the store mobile bar, and the checkout mobile bar all sit inside the home indicator / Dynamic Island zone and are obscured or hard to tap.

  **Verify:** Open checkout.html, all_products.html, and index.html on an iPhone (or DevTools → iPhone 14 Pro with safe areas enabled) and confirm the bottom CTAs are above the home indicator.

---

- [ ] **2. Fix input/select font-size to prevent iOS auto-zoom**

  iOS Safari zooms the page automatically when a focused input has `font-size < 16px`. The affected declarations:

  - **`public/styles.css` line ~505:** `select { font-size: 0.9rem; }` → `font-size: 1rem;`
  - **`public/styles.css` line ~4044:** `.global-search-form input { font-size: 1.1rem; }` — already ≥ 16 px, no change needed.
  - **`public/reels.css` line ~90:** `.reels-genre select { font-size: var(--text-micro); }` — `--text-micro` is `0.75rem` (12 px). Override inside a `@media (pointer: coarse)` or just set the min to `1rem` here: `font-size: max(1rem, var(--text-micro));`
  - **`public/checkout.html` inline style block line ~124:** `.form-group input, .form-group select, .form-group textarea { font-size: 0.92rem; }` → `font-size: 1rem;`
  - **`public/styles.css` `.form-group input, .form-group textarea`** (line ~3867): no `font-size` set—these will inherit from the global `select` rule once it is corrected. Add explicit `font-size: 1rem;` to `.form-group input, .form-group textarea` so there is no reliance on cascade order.

  **Files:** `public/styles.css`, `public/reels.css`, `public/checkout.html`

  **Why it matters:** When a user taps any `<select>` or `<input>` with a font-size under 16 px, iOS zooms the viewport in. The user then has to manually zoom out after each field interaction—a major UX friction point on the checkout and filter sheets.

  **Verify:** On a real iPhone or iOS Simulator, tap into the State dropdown on checkout.html, the search input on the store, and the genre select on poster-reels.html. The viewport must not zoom.

---

- [ ] **3. Bump sub-44 px touch targets to ≥ 44 × 44 px**

  The following interactive elements are confirmed below the 44 px minimum:

  | Element | Current size | File / line | Fix |
  |---|---|---|---|
  | `.cart-close-btn` | 36 × 36 px | styles.css ~2877 | `width: 44px; height: 44px;` |
  | `.nav-action-btn` + `.menu-toggle` at ≤ 480 px | 32 × 32 px | styles.css ~3787 | `width: 44px; height: 44px;` |
  | `.qty-control button` | 30 × 30 px | styles.css ~3002 | `width: 44px; height: 44px;` |
  | `.qty-control` total height | 30 px | styles.css ~2998 | `min-height: 44px;` on `.qty-control` |
  | `.auth-close-btn, .profile-close-btn` | no explicit size, about 20 × 20 px from font-size only | styles.css ~3838 | `width: 44px; height: 44px; display: inline-flex; align-items: center; justify-content: center;` |
  | `.facet-option` | `min-height: 34px` | store.css ~172 | `min-height: 44px;` |
  | `.filter-chip` | `padding: 6px 12px` ≈ 28 px tall | store.css ~338 | `padding: 10px 12px;` |
  | `.global-search-form button` | 38 × 38 px | styles.css ~4052 | `width: 44px; height: 44px;` |
  | `.ag-nav` (apparel gallery prev/next on mobile) | 38 × 38 px | styles.css ~5114 | `width: 44px; height: 44px;` |
  | `.reel-size` buttons | `min-height: 36px` | reels.css ~~ | `min-height: 44px;` |

  Additionally, `.swatch-btn` uses `padding: 0.6rem 1rem` which at base font gives ~34 px height. Add `min-height: 44px` to `.swatch-btn`.

  **Files:** `public/styles.css`, `public/store.css`, `public/reels.css`

  **Why it matters:** Apple HIG and WCAG 2.5.5 require 44 × 44 pt minimum. Sub-size targets cause mis-taps, especially the cart close, the qty +/− spinner, and filter chips—all high-frequency touch operations on a shopping site.

  **Verify:** Open DevTools with a mobile emulator. Inspect each element listed above and confirm the rendered height ≥ 44 px. Also test on an actual phone: close the cart, change qty in cart, close the auth modal, tap filter chips on the store—all should respond on first tap without struggle.

---

- [ ] **4. Add `-webkit-tap-highlight-color: transparent` globally**

  No `-webkit-tap-highlight-color` is currently set anywhere in the CSS. On iOS/Android, tapping a `<button>`, `<a>`, or `[role="button"]` flashes the browser's default blue/grey rectangle—highly visible against the brand's dark card surfaces and inconsistent with the custom hover states.

  **File:** `public/styles.css`

  **What to change:** Inside the CSS reset block (near the `*, *::before, *::after` rule at the top), add:
  ```css
  * {
    -webkit-tap-highlight-color: transparent;
  }
  ```
  This resets the tap flash site-wide. Elements that need a deliberate tap feedback already get it from the `button:active { transform: scale(0.97); }` rule already present.

  **Why it matters:** Without this, every tap on a button or link shows a semi-opaque native highlight overlay. It looks broken on dark surfaces and conflicts with the brand's custom press feedback.

  **Verify:** On a real iOS or Android device, tap a product card, nav icon, Add to Cart button, and a filter chip. No blue flash should appear.

---

- [ ] **5. Fix `touch-action` on the reels feed**

  **Current state:** `.reel-stage` has `touch-action: manipulation` (suppresses double-tap zoom, but also blocks browser-native vertical pan). `.reels-feed` has no `touch-action` at all.

  **Problem:** `touch-action: manipulation` on the stage container prevents the browser from handling the vertical swipe that drives the `scroll-snap-type: y mandatory` feed. The feed scrolls via `overflow-y: auto` + scroll-snap, which needs native pan-y to work smoothly on iOS. Without declaring `touch-action: pan-y` on `.reels-feed`, iOS may intercept or stutter the swipe.

  **What to change in `public/reels.css`:**

  1. On `.reels-feed`, add `touch-action: pan-y;` — lets the browser handle vertical swipes natively for the scroll-snap, disables pinch-zoom (not useful in a full-screen feed).
  2. Change `.reel-stage` from `touch-action: manipulation` to `touch-action: pan-y` — keeps double-tap-zoom suppressed while still allowing vertical swipe to propagate to the feed container.

  The double-tap-to-add gesture is handled by `pointerup` + timing in `reels.js`, not by a native gesture, so removing `manipulation` does not break it. The existing `feed.addEventListener('dblclick', e => e.preventDefault())` already blocks the native browser double-tap zoom fallback.

  **Files:** `public/reels.css`

  **Why it matters:** If the browser doesn't see `touch-action: pan-y` on the scroll container or its ancestors, iOS Safari may refuse to let JavaScript scroll-snap work smoothly, causing the feed to feel laggy or require multiple swipe attempts.

  **Verify:** Open poster-reels.html on an iPhone. Swipe up/down through several posters—each swipe should snap cleanly with no stutter. Double-tap the poster image—it should add to cart (burst animation plays) without zooming the page.

---

- [ ] **6. Guard hover-only product card and mockup effects behind `@media (hover: hover)`**

  **Current state:**
  - `.product-card:hover { transform: translateY(-6px); box-shadow: ... }` — fires on iOS on first tap, making cards jump unexpectedly before opening.
  - `.mockup-wrapper:hover .mockup-hover { opacity: 1 }` — shows the hover image on tap instead of on sustained hover.
  - `.product-card:hover .product-quick-actions { transform: none; opacity: 1 }` — the overlay quick-add is already hidden via `display: none` at ≤ 480 px, but between 481–900 px on a touch device it appears on first tap (the `.product-quick-actions` mobile hide rule only applies at ≤ 480 px).

  **What to change in `public/styles.css`:**

  Wrap the hover-specific rules for product cards in `@media (hover: hover)`:
  ```css
  @media (hover: hover) {
    .product-card:hover {
      transform: translateY(-6px);
      border-color: var(--border-light);
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4), 0 0 40px rgba(var(--accent-rgb), 0.15);
    }
    .product-card:hover .product-quick-actions {
      transform: translateY(0);
      opacity: 1;
    }
    .mockup-wrapper:hover .mockup-hover {
      opacity: 1;
    }
    .product-card:hover .mockup-wrapper { /* existing rule */ }
    .product-card:hover .plain-product-image { /* existing rule */ }
  }
  ```
  Keep the existing `@media (max-width: 480px) { .product-quick-actions { display: none; } }` for small phones on top of this.

  **Files:** `public/styles.css`

  **Why it matters:** On iOS Safari, `:hover` is sticky — the first tap applies the hover state and the second tap triggers the click. A card that jumps 6 px on first tap before opening the product modal is confusing and feels like a mis-tap.

  **Verify:** On an iPhone, tap a product card. It should open the modal directly without a jump. On desktop, hover over a card — the lift and shadow should still appear.

---

- [ ] **7. Add safe-area inset to cart drawer footer and scroll-to-top button**

  **Cart drawer footer** (`public/styles.css` line ~3039): `.cart-drawer-footer` has `padding: 20px 24px` — no bottom safe-area. On iPhones with a home indicator, the checkout button in the footer sits inside the home bar zone.

  Change:
  ```css
  .cart-drawer-footer {
    padding: 20px 24px;
  }
  ```
  To:
  ```css
  .cart-drawer-footer {
    padding: 20px 24px calc(20px + env(safe-area-inset-bottom));
  }
  ```

  **Scroll-to-top button** (`public/styles.css` line ~2581): `.scroll-top { bottom: 30px; right: 30px; }` — overlaps the iPhone home bar. Change to:
  ```css
  .scroll-top {
    bottom: calc(30px + env(safe-area-inset-bottom));
    right: calc(30px + env(safe-area-inset-right));
  }
  ```

  Note: these `env()` values are only meaningful when `viewport-fit=cover` is set (done in item 1).

  **Files:** `public/styles.css`

  **Why it matters:** The cart checkout CTA is the single most important mobile tap target on the site. If it sits under the iPhone home bar, users can't tap it — they tap the home indicator instead and accidentally minimize the browser.

  **Verify:** On iPhone (real device or Simulator with home indicator), open the cart drawer. The "Proceed to Checkout" button must sit fully above the home indicator. The scroll-to-top FAB must not overlap the home bar.

---

- [ ] **8. Add a visible close button to the search overlay for touch users**

  **Current state:** `public/styles.css` line ~3983: `.search-close-btn { display: none; }` — the design says "click outside to close", which is a mouse idiom. On touch, the overlay's backdrop is behind the full-page scroll container, so tapping outside the search box is unreliable.

  **What to change:**

  In `public/styles.css`, replace `.search-close-btn { display: none; }` with a media-query-scoped rule:
  ```css
  .search-close-btn { display: none; } /* default: hidden on desktop (click-outside works) */
  @media (pointer: coarse) {
    .search-close-btn {
      display: flex;
      width: 44px;
      height: 44px;
      align-items: center;
      justify-content: center;
      border: none;
      background: transparent;
      color: var(--text-secondary);
      font-size: 1.1rem;
    }
  }
  ```
  The button already exists in the HTML rendered by `site-overlays.js` (line ~22 of the overlay template: `<button class="search-close-btn" …>`). No HTML change is needed.

  **Files:** `public/styles.css`

  **Why it matters:** Touch users have no reliable way to dismiss the search overlay without tapping a visible close control. An invisible close button is an accessibility failure (WCAG 2.5.3).

  **Verify:** On a mobile device, open search, then tap the close button — overlay dismisses. On desktop, confirm no close button is shown (click-outside continues to work).

---

- [ ] **9. Add `touch-action: manipulation` to high-frequency tap targets in styles.css**

  `touch-action: manipulation` eliminates the 300 ms tap delay (still present on some Android WebViews) and prevents accidental double-tap-zoom on buttons that are used rapidly (add-to-cart, qty controls, size swatches).

  **What to change in `public/styles.css`:** Add to the button reset block (near line 404):
  ```css
  button, [role="button"], .swatch-btn, .filter-chip, .store-tab {
    touch-action: manipulation;
  }
  ```

  **Files:** `public/styles.css`

  **Why it matters:** On older Android browsers, the 300 ms delay makes the UI feel sluggish. `manipulation` removes it without disabling scroll or other native touch gestures. This is complementary to the existing `button:active { transform: scale(0.97); }` feedback — the response is now both immediate and visual.

  **Verify:** On an Android device (Chrome), rapidly tap the + button in the cart quantity control and confirm the count increments immediately on each tap with no delay.

---

- [ ] **10. Disable Lenis smooth scroll on coarse-pointer / touch devices**

  **Current state:** `scroll.js` only gates Lenis behind `prefers-reduced-motion`. On touch devices, Lenis overrides native inertial scroll (momentum scrolling), removing the physics iOS/Android users expect. `data-lenis-prevent` is correctly used on scroll containers (filter panel, cart body), but the main page scroll itself still goes through Lenis.

  **What to change in `public/scroll.js`:** Add a coarse-pointer check alongside the existing `prefersReducedMotion` guard:
  ```js
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
  if (prefersReducedMotion || isCoarsePointer || typeof Lenis === 'undefined') return;
  ```

  **Files:** `public/scroll.js`

  **Why it matters:** Lenis replaces the browser's native scroll handler. On iOS Safari, this strips the rubber-band overscroll effect and makes the page feel like a web app from 2012. Native scroll on mobile is hardware-accelerated and has better physics than any JS replacement. The smooth-scroll effect Lenis provides (eased deceleration) is a desktop mouse-wheel enhancement — it adds nothing for finger-based touch scroll.

  **Verify:** On an iPhone, scroll the homepage. The page should have native iOS rubber-band overscroll. On desktop with a mouse wheel, the page should still have the smooth Lenis easing (scroll.js must still initialize).

---

- [ ] **11. Fix `product-quick-actions` touch reveal at mid-range breakpoints (481 – 900 px)**

  **Current state:** `.product-quick-actions` is hidden via `display: none` at `max-width: 480px` (item 6 removes the hover trigger but the layer still exists as `opacity: 0` between 481–900 px). After item 6 wraps the hover rules in `@media (hover: hover)`, on a tablet-sized touch screen (481–900 px), `product-quick-actions` will have `opacity: 0` and `transform: translateY(20px)` as its resting state — invisible but still occupying the stacking context and intercepting taps.

  **What to change in `public/styles.css`:** Extend the `product-quick-actions { display: none }` rule to cover all touch/coarse-pointer devices, not just ≤ 480 px:
  ```css
  @media (pointer: coarse) {
    .product-quick-actions {
      display: none;
    }
  }
  ```
  (Keep the existing `max-width: 480px` rule as a fallback for old browsers that don't support `pointer: coarse`.)

  **Files:** `public/styles.css`

  **Why it matters:** On a 768 px iPad in touch mode, without this fix, the quick-actions overlay is invisible but present — a tap near the bottom of a card image lands on the hidden overlay's event target instead of the card link, causing the card to feel unresponsive.

  **Verify:** On an iPad (landscape, 1024 px wide, touch mode), tap a product card on the homepage. The modal should open on the first tap. Use DevTools to confirm `.product-quick-actions` has `display: none` when `pointer: coarse` is emulated.

---

- [ ] **12. Ensure auth modal/drawer is bottom-sheet on mobile (small screens)**

  **Current state:** `.auth-modal, .profile-modal` are centered modals (`top: 50%; left: 50%; transform: translate(-50%, -47%) scale(0.95)`). On small phones (< 480 px) with the iOS keyboard open, the modal can be partially obscured by the keyboard, and the centered overlay is less ergonomic than a bottom sheet.

  **What to change in `public/styles.css`:** Add a mobile override:
  ```css
  @media (max-width: 480px) {
    .auth-modal, .profile-modal {
      top: auto;
      left: 0;
      right: 0;
      bottom: 0;
      transform: translateY(8px) scale(0.98); /* closed state */
      border-radius: var(--radius-xl) var(--radius-xl) 0 0;
      width: 100%;
      max-width: 100%;
      max-height: 92dvh;
      overflow-y: auto;
      padding-bottom: calc(2rem + env(safe-area-inset-bottom));
    }
    .auth-modal.open, .profile-modal.open {
      transform: translateY(0) scale(1);
    }
  }
  ```

  **Files:** `public/styles.css`

  **Why it matters:** A bottom sheet is the native mobile pattern for authentication flows. It keeps the input fields visible above the keyboard, allows the user to dismiss by swiping down (via the existing click-overlay-to-close), and sits comfortably within thumb reach. The centered dialog approach on mobile requires two-handed interaction or awkward one-handed stretching.

  **Verify:** On an iPhone, tap the account icon. The login sheet should slide up from the bottom. Enter text in a field — the keyboard should push the visible area up without hiding the form. Tap outside to dismiss.

---

- [ ] **13. Fix hero-cta and btn-ghost minimum touch height**

  **Current state:** `.hero-cta { padding: 12px 28px }` with `font-size: 0.85rem` and `line-height` inherited (1.6 × 0.85 rem ≈ 21.8 px). Total height ≈ 12 + 21.8 + 12 = 45.8 px — just over 44 px, so fine.

  `.btn-ghost { padding: 11px 27px }` — 11 + 21.8 + 11 = 43.8 px — just under 44 px. Add `min-height: 44px` to both as a safety guard for font-scaling scenarios:

  ```css
  .hero-cta, .btn-ghost {
    min-height: 44px;
  }
  ```

  **Files:** `public/styles.css`

  **Why it matters:** If a user has their system font size scaled up (accessibility setting), the computed padding stays fixed but the text grows, which can actually push buttons over 44 px. However, with the default font and these paddings, btn-ghost is marginally under. The `min-height` guard is a one-liner defensive fix.

  **Verify:** Inspect `.btn-ghost` in DevTools mobile view and confirm `height ≥ 44px`.

---

## Files modified summary

| File | Items |
|---|---|
| `public/index.html` | 1 |
| `public/all_products.html` | 1 |
| `public/checkout.html` | 1, 2 |
| `public/about_us.html` | 1 |
| `public/institutional.html` | 1 |
| `public/policies.html` | 1 |
| `public/order-confirmation.html` | 1 |
| `public/special_day.html` | 1 |
| `public/reset-password.html` | 1 |
| `public/style_options.html` | 1 |
| `public/404.html` | 1 |
| `public/maintenance.html` | 1 |
| `public/styles.css` | 2, 3, 4, 6, 7, 8, 9, 11, 12, 13 |
| `public/reels.css` | 2, 3, 5 |
| `public/store.css` | 3 |
| `public/scroll.js` | 10 |

---

## Explicitly confirmed as already correct

The following were audited and require **no changes**:

- `micro-interactions.js` — cursor RAF loop and magnetic buttons are already gated behind `(pointer: fine)` check; the RAF is never started on touch devices.
- `poster-reels.html` viewport — already has `viewport-fit=cover`.
- `admin.html` viewport — already has `viewport-fit=cover`.
- Reels `pointerup` double-tap handler — uses `pointerType` check and `dblclick` prevention; no conflict with browser zoom when `touch-action: pan-y` is set (item 5).
- Apparel gallery touch swipe — `touchstart/touchmove/touchend` correctly implemented with passive/non-passive split in `script.js`.
- Product modal on mobile — already `width: 100vw`, `flex-direction: column`, sticky Add-to-cart button with `env(safe-area-inset-bottom)`.
- Store bottom sheets — already `max-height: 85dvh`, `transform: translateY(105%)` slide-in, `env(safe-area-inset-bottom)` on the sheet footer.
- Store mobile bar — already has `padding-bottom: env(safe-area-inset-bottom)`.
- `reels-bar` — already uses `padding: calc(10px + env(safe-area-inset-top))`.
- `reels-feed` — already uses `scroll-snap-type: y mandatory`, `overscroll-behavior-y: contain`, `scrollbar-width: none`.
- Checkout input types — `type="email"`, `type="tel"`, `type="text"` with correct `inputmode` and `autocomplete` attributes already set.
- HTML body font-size — base `1rem` (16 px) — fine.
- `scroll-track` horizontal scroll — already has `scroll-snap-type: x mandatory`, `-webkit-overflow-scrolling: touch`, `overscroll-behavior-x: contain`, `touch-action: pan-x pan-y`.
- Footer link touch targets — already padded at `@media (max-width: 900px)` with `padding: 10px 0`.
- `products-grid` — already `repeat(2, 1fr)` at `max-width: 640px`.
- `nav-links` mobile menu — already `overflow-y: auto; -webkit-overflow-scrolling: touch` when open.
- Product card quick-actions — hidden with `display: none` at `max-width: 480px` (item 11 extends this to all touch).
- Checkout mobile bar — already uses `env(safe-area-inset-bottom)`, has `.is-tucked` IntersectionObserver to hide when the real Place Order button is visible.
- Cart drawer — `height: 100vh` / `100dvh` already set; `overscroll-behavior: contain` present.
- `analytics.js` consent banner — inline CSS already uses `env(safe-area-inset-bottom)`.
- `prefers-reduced-motion` — respected in Lenis, the reels burst animation, and the apparel gallery transitions.
