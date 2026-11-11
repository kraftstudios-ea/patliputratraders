// ========================================
// PATLIPUTRA TRADERS — Shared footer (<global-footer>)
// ========================================
(function () {

  class GlobalFooter extends HTMLElement {
    connectedCallback() {
      const path = window.location.pathname;
      const onHome = /(^|\/)(index\.html)?$/.test(path);
      const home = onHome ? '' : '/';
      const routes = {
        shop: 'all_products.html',
        chandeliers: 'all_products.html?category=Chandeliers',
        wallLamps: 'all_products.html?category=Decorative%20Wall%20Lamps',
        pendants: 'all_products.html?category=Pendant%20%26%20Hanging%20Lights',
        fans: 'all_products.html?category=Ceiling%20%26%20Chandelier%20Fans',
        track: 'all_products.html?category=Spot%20%26%20Track%20Lights',
        outdoor: 'all_products.html?category=Outdoor%20%26%20Landscape%20Lights',
        trackOrder: 'track.html',
        about: 'about_us.html',
        institutional: 'institutional.html',
        policies: 'policies.html'
      };
      const year = new Date().getFullYear();

      this.innerHTML = `
        <footer class="site-footer" id="footer">
          <div class="container">
            <div class="footer-grid">
              <div class="footer-brand">
                <a href="${home || '/'}" class="footer-brand-link" style="display:inline-flex; align-items:center; gap:12px; text-decoration:none; margin-bottom:16px;">
                  <img src="img/site/patliputra-logo.webp" alt="Patliputra Traders Logo" width="44" height="44" style="border-radius:8px; object-fit:contain; box-shadow:0 4px 14px rgba(223,168,74,0.25);" loading="lazy" class="footer-logo">
                  <span style="font-family:'Plus Jakarta Sans',sans-serif; font-weight:800; font-size:1.25rem; letter-spacing:-0.02em; color:var(--text, #f8fafc);">PATLIPUTRA <span style="color:#dfa84a;">TRADERS</span></span>
                </a>
                <div class="footer-parent" style="margin-bottom:14px;">
                  <span class="footer-parent-label" style="text-transform:uppercase; letter-spacing:0.08em; font-size:0.75rem; color:#dfa84a; font-weight:700;">Architectural &amp; Decorative Lighting</span>
                </div>
                <p>Patliputra Traders is Patna's premier destination for luxury illumination, decorative chandeliers, modern pendant lights, architectural profiles, and smart ceiling fans. Elevating residences, hotels, and retail spaces across Bihar and India with tested, high-CRI lighting fixtures.</p>
                <div class="footer-social">
                  <a href="https://www.instagram.com/patliputratraderpatna/" aria-label="Instagram @patliputratraderpatna" target="_blank" rel="noopener"><i class="fa-brands fa-instagram"></i></a>
                  <a href="https://wa.me/919234755686?text=Hello%20Patliputra%20Traders,%20I%20am%20interested%20in%20lighting%20catalogue" aria-label="WhatsApp" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp"></i></a>
                  <a href="tel:+919234755686" aria-label="Phone"><i class="fa-solid fa-phone"></i></a>
                  <a href="mailto:patliputratraderpatna@gmail.com" aria-label="Email"><i class="fa-solid fa-envelope"></i></a>
                </div>
              </div>

              <nav class="footer-column" aria-label="Shop">
                <h2>Collections</h2>
                <ul>
                  <li><a href="${routes.shop}">All Lighting Fixtures</a></li>
                  <li><a href="${routes.chandeliers}">Luxury Chandeliers</a></li>
                  <li><a href="${routes.pendants}">Pendant &amp; Hanging Lights</a></li>
                  <li><a href="${routes.wallLamps}">Decorative Wall Lamps</a></li>
                  <li><a href="${routes.fans}">Designer Ceiling Fans</a></li>
                  <li><a href="${routes.track}">Track &amp; Spot Lights</a></li>
                  <li><a href="${routes.outdoor}">Outdoor &amp; Flood Lights</a></li>
                </ul>
              </nav>

              <nav class="footer-column" aria-label="Quick Links">
                <h2>Quick Links</h2>
                <ul>
                  <li><a href="${routes.shop}">Browse Catalogue</a></li>
                  <li><a href="${routes.trackOrder}">Track Your Order</a></li>
                  <li><a href="${routes.institutional}">Bulk &amp; Architect Enquiries</a></li>
                  <li><a href="${routes.about}">About Patliputra Traders</a></li>
                  <li><a href="https://www.instagram.com/patliputratraderpatna/" target="_blank" rel="noopener">Instagram Showroom</a></li>
                  <li><a href="admin.html">Admin Portal</a></li>
                </ul>
              </nav>

              <nav class="footer-column" aria-label="Support">
                <h2>Customer Care</h2>
                <ul>
                  <li><a href="${routes.policies}#shipping-policy">Shipping &amp; Delivery</a></li>
                  <li><a href="${routes.policies}#cancellation-returns">Warranty &amp; Replacement</a></li>
                  <li><a href="${routes.policies}#refund-policy">Refund Policy</a></li>
                  <li><a href="${routes.policies}#privacy-policy">Privacy Policy</a></li>
                  <li><a href="${home}#faq">Lighting FAQ</a></li>
                </ul>
              </nav>

              <div class="footer-column footer-newsletter">
                <h2>Lighting Consultation</h2>
                <p>Have an architectural blueprint or home renovation? Subscribe for trade discounts &amp; project updates.</p>
                <form class="newsletter-form" novalidate>
                  <input type="email" name="email" placeholder="Enter your email" aria-label="Email for newsletter" autocomplete="email" required>
                  <button type="submit" style="background:#dfa84a; color:#0f172a; font-weight:700;">Subscribe</button>
                </form>
                <p class="newsletter-status" role="status" aria-live="polite"></p>
                <ul class="footer-contact">
                  <li><i class="fa-solid fa-phone" style="color:#dfa84a;" aria-hidden="true"></i><a href="tel:+919234755686">+91-9234755686</a></li>
                  <li><i class="fa-brands fa-whatsapp" style="color:#22c55e;" aria-hidden="true"></i><a href="https://wa.me/919234755686" target="_blank" rel="noopener">WhatsApp Support</a></li>
                  <li><i class="fa-solid fa-envelope" style="color:#dfa84a;" aria-hidden="true"></i><a href="mailto:patliputratraderpatna@gmail.com">patliputratraderpatna@gmail.com</a></li>
                  <li><i class="fa-solid fa-location-dot" style="color:#dfa84a;" aria-hidden="true"></i><span>Patliputra Traders, Patna, Bihar, India</span></li>
                </ul>
              </div>
            </div>

            <div class="footer-bottom">
              <p>
                © ${year} Patliputra Traders. All rights reserved. Patna's Architectural &amp; Decorative Lighting Partner.<br>
                <span class="footer-disclaimer">Product designs, specifications and prices correspond directly with catalog standards. For bulk commercial project inquiries, electrical contractor rates, and on-site lighting mockups in Patna &amp; across Bihar, connect with our support team.</span>
              </p>
              <div class="footer-bottom-links">
                <a href="${routes.policies}#terms-of-service">Terms</a>
                <a href="${routes.policies}#privacy-policy">Privacy</a>
                <a href="https://www.instagram.com/patliputratraderpatna/" target="_blank" rel="noopener">Instagram</a>
              </div>
            </div>
          </div>
        </footer>
      `;
      this.initNewsletter();
    }

    initNewsletter() {
      const form = this.querySelector('.newsletter-form');
      if (!form) return;
      const input = form.querySelector('input');
      const status = this.querySelector('.newsletter-status');
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const valid = input.value.trim() !== '' && input.checkValidity();
        status.classList.toggle('is-error', !valid);
        status.textContent = valid
          ? "Thank you! We've received your inquiry and will reach out with our lighting catalog."
          : 'Please enter a valid email address.';
        if (valid) form.reset();
        else input.focus();
      });
    }
  }

  customElements.define('global-footer', GlobalFooter);
})();
