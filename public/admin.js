// ========================================
// BRUSH — Admin dashboard (admin.html)
//
// Orders, inventory, add product, pricing and the activity log. Talks to
// the same /api routes as before. Roles: superadmin (everything), stocker
// (stock quantities only), watcher (read-only) — the server enforces these;
// the UI mirrors them so nobody is shown a control that will be refused.
// ========================================
(function () {
  'use strict';

  // ---------- helpers ----------
  // Every value from a shopper (checkout fields, reviews) or the database
  // goes through this before innerHTML — an admin page runs with the
  // admin's session token, so injected markup would be dangerous here.
  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  const $ = (id) => document.getElementById(id);
  const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  // 'awaiting-payment' comes first: a direct transfer that has not been
  // matched against the bank yet. These need action before anything else.
  const STATUSES = ['awaiting-payment', 'confirmed', 'sent-for-printing', 'packed', 'shipped', 'transit', 'delivered', 'cancelled'];
  const STATUS_LABELS = {
    'awaiting-payment': 'Awaiting payment',
    'sent-for-printing': 'Sent for Printing',
    'printing': 'Sent for Printing'
  };
  const TYPES = [
    { key: 'lights', value: 'Lights', label: 'Lighting Fixture' },
    { key: 'chandeliers', value: 'Chandeliers', label: 'Chandelier' },
    { key: 'fans', value: 'Ceiling Fans', label: 'Ceiling Fan' },
    { key: 'wall-lamps', value: 'Wall Lamps', label: 'Wall Lamp' },
    { key: 'pendants', value: 'Pendant Lights', label: 'Pendant Light' },
    { key: 'track', value: 'Track Lights', label: 'Track / Spot Light' },
    { key: 'downlights', value: 'COB Downlights', label: 'COB / Downlight' },
    { key: 'profiles', value: 'Profile Lights', label: 'Profile / Linear' },
    { key: 'outdoor', value: 'Outdoor Lights', label: 'Outdoor / Flood Light' },
    { key: 'generic', value: 'Generic', label: 'Other Product' }
  ];
  const BASE_CATEGORIES = [
    'Chandeliers', 'Decorative Wall Lamps', 'Pendant & Hanging Lights',
    'Ceiling & Chandelier Fans', 'Spot & Track Lights', 'COB & Downlights',
    'Profile & Linear Lights', 'Strip & Rope Lights', 'Outdoor & Landscape Lights',
    'Table & Floor Lamps', 'Smart & Utility Lighting'
  ];
  const LOW_STOCK = 5;

  // Stored product types vary ('poster', 'Posters', undefined, 'wallpaper').
  // Comparing them raw made the type dropdown fall back to its first option
  // ("Posters") for wallpapers — and saving then re-typed them as posters.
  function typeKey(t) {
    const s = String(t || '').toLowerCase();
    if (!s || s.startsWith('poster')) return 'posters';
    if (s === 'apparel' || s.includes('shirt')) return 'apparel';
    if (s.startsWith('sticker')) return 'stickers';
    if (s.startsWith('wallpaper')) return 'wallpapers';
    if (s.startsWith('collectible')) return 'collectibles';
    if (s.startsWith('plate')) return 'plates';
    return s;
  }
  const typeMeta = (t) => TYPES.find(x => x.key === typeKey(t));
  const stockOf = (p) => Number(p.stockQuantity ?? p.stock ?? 0);
  const keywordsText = (k) => (Array.isArray(k) ? k.join(', ') : String(k || ''));

  function relTime(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '—';
    const mins = Math.round((Date.now() - d) / 60000);
    const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    const sameDay = d.toDateString() === new Date().toDateString();
    if (sameDay) return `Today, ${time}`;
    const y = new Date(); y.setDate(y.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return `Yesterday, ${time}`;
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' }) + `, ${time}`;
  }

  // Order items now carry a generic `variants` object (poster/plate/
  // wallpaper all have different variant groups) instead of the old
  // flat `size`/`gsm` fields — this reads either shape so historical
  // orders placed before that change still display correctly.
  function formatVariantLine(item) {
    if (item.variants && typeof item.variants === 'object' && Object.keys(item.variants).length) {
      // Human labels from the shared rate table ("Classic Crew · 180 GSM",
      // "DTG", "12×18″") rather than raw codes like uc21 / dtg.
      const cfg = typeof Cart !== 'undefined' ? Cart.typeConfigFor(item.productType) : null;
      const labels = Object.entries(item.variants).map(([k, v]) => {
        const group = cfg && (cfg.variantGroups || []).find(g => g.key === k);
        const opt = group && group.options.find(o => o.value === v);
        return escapeHtml(opt ? opt.label : v);
      }).filter(Boolean);
      return labels.join(' | ') || 'N/A';
    }
    if (item.size || item.gsm) {
      return `${item.size || 'A4'} | ${item.gsm || '80'} GSM`;
    }
    return 'N/A';
  }


  // Posters / T-shirts are priced from the shared rate table
  // (Backend/productTypes.js, mirrored in cart.js) — their price can't be
  // edited per product here; everything else keeps a manual price.
  function isCatalogPriced(p) {
    return typeof Cart !== 'undefined' && typeof Cart.typeConfigFor(p.productType).basePrice === 'number';
  }

  // ---- Pricing view: every sellable variant, cost, shelf price, margin ----
  async function loadPricing() {
    const box = document.getElementById('pricing-content');
    box.innerHTML = '<p style="color:var(--text-secondary);">Loading…</p>';
    try {
      // /api/pricing is admin-only (it carries the cost basis), so it has to
      // go through api() to pick up the session token. There is no client-side
      // fallback: cart.js does not ship costs, so falling back to it would
      // render a table of NaN margins.
      const data = await api('/pricing');
      if (!data || !data.productTypes) throw new Error('no pricing data');
      const { productTypes: T, orderCharges: C } = data;
      const inr = n => '₹' + (Number.isInteger(n) ? n : n.toFixed(2));
      const row = (label, cost, price, gst) => {
        const margin = price - cost;
        return `<tr><td>${label}</td><td style="text-align:right;">${inr(cost)}</td><td style="text-align:right; font-weight:700;">${inr(price)}</td><td style="text-align:right; color:var(--success);">${inr(margin)} (${(margin / cost * 100).toFixed(1)}%)</td><td style="text-align:right; color:var(--text-secondary);">${Math.round(gst * 100)}%</td></tr>`;
      };
      const head = '<thead><tr><th>Variant</th><th style="text-align:right;">Unit cost</th><th style="text-align:right;">Shelf price</th><th style="text-align:right;">Margin</th><th style="text-align:right;">GST</th></tr></thead>';

      const poster = T.poster;
      const posterRows = poster.variantGroups[0].options.map(o =>
        row(o.label, poster.unitCost.size[o.value], poster.basePrice + o.priceDelta, poster.gstRate)).join('');

      const ap = T.apparel;
      const styleG = ap.variantGroups.find(g => g.key === 'style');
      const printG = ap.variantGroups.find(g => g.key === 'print');
      const sizeG = ap.variantGroups.find(g => g.key === 'size');
      const apRows = [];
      styleG.options.forEach(st => printG.options.forEach(pr => {
        if (pr.onlyWith && !pr.onlyWith.style.includes(st.value)) return;
        const sizes = sizeG.options.filter(o => !o.onlyWith || o.onlyWith.style.includes(st.value)).map(o => o.label);
        apRows.push(row(`${st.label} · ${pr.label}<br><small style="color:var(--text-secondary);">${sizes.join(', ')}</small>`,
          ap.unitCost.style[st.value] + ap.unitCost.print[pr.value],
          ap.basePrice + st.priceDelta + pr.priceDelta, ap.gstRate));
      }));

      box.innerHTML = `
        <p style="color:var(--text-secondary); max-width:760px; line-height:1.5;">
          Shelf prices come from the rate table in <code>Backend/productTypes.js</code>. Taxes, delivery and the COD fee are added once per order at checkout.
          To change a price, edit <code>Backend/productTypes.js</code>, run <code>python3 tools/sync-cart-config.py</code>, and restart the backend — stored product prices update automatically on start.
        </p>
        <h3 style="margin:1.5rem 0 0.5rem;">Posters <small style="color:var(--text-secondary); font-weight:400;">300 GSM art board</small></h3>
        <div class="data-table-wrapper"><table>${head}<tbody>${posterRows}</tbody></table></div>
        <h3 style="margin:1.5rem 0 0.5rem;">T-Shirts <small style="color:var(--text-secondary); font-weight:400;">back A3 + chest print, no colour choice</small></h3>
        <div class="data-table-wrapper"><table>${head}<tbody>${apRows.join('')}</tbody></table></div>
        <h3 style="margin:1.5rem 0 0.5rem;">Per-order charges</h3>
        <div class="data-table-wrapper"><table>
          <thead><tr><th>Charge</th><th style="text-align:right;">Amount</th><th>When</th></tr></thead>
          <tbody>
            <tr><td>Shipping</td><td style="text-align:right;">${inr(C.shipping)} + ${Math.round(C.serviceGstRate * 100)}% GST</td><td>Every order</td></tr>
            <tr><td>COD fee</td><td style="text-align:right;">${inr(C.codFee)} + ${Math.round(C.serviceGstRate * 100)}% GST</td><td>Cash-on-delivery orders</td></tr>
            <tr><td>GST on items</td><td style="text-align:right;">All products ${Math.round(T.poster.gstRate * 100)}% GST (inclusive)</td><td>Every order</td></tr>
          </tbody>
        </table></div>`;
    } catch (e) {
      box.innerHTML = '<p style="color:var(--sale-red);">Couldn\'t load pricing — sign in again, or restart the backend so /api/pricing is available.</p>';
    }
  }


  // ---------- toast ----------
  let toastTimer;
  function showToast(message, isError = false) {
    const toast = $('toast');
    $('toast-text').textContent = message;
    toast.classList.toggle('toast-error', isError);
    toast.querySelector('i').className = isError ? 'fa-solid fa-circle-exclamation' : 'fa-solid fa-circle-check';
    toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('visible'), isError ? 6000 : 3500);
  }

  // ---------- auth ----------
  let adminToken = sessionStorage.getItem('brush_admin_token');
  const role = () => sessionStorage.getItem('brush_admin_role') || 'watcher';
  const isSuper = () => role() === 'superadmin';
  const isWatcher = () => role() === 'watcher';

  async function api(path, opts = {}) {
    const res = await fetch(`${API_BASE}${path}`, {
      ...opts,
      // The storefront gets a 60s shared cache on /products so page-to-page
      // navigation doesn't re-hit Render. The admin panel must not: an admin
      // who edits a price and reloads has to see the new one immediately.
      cache: 'no-cache',
      headers: { ...(opts.body && !(opts.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), 'Cache-Control': 'no-cache', Authorization: `Bearer ${adminToken}`, ...(opts.headers || {}) },
    });
    if (res.status === 401) {
      logout(true);
      throw new Error('Your session expired — please log in again.');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  function checkAuth() {
    if (!adminToken) {
      $('login-overlay').hidden = false;
      setTimeout(() => $('admin-user').focus(), 50);
      return;
    }
    $('login-overlay').hidden = true;
    $('logged-in-user').textContent = sessionStorage.getItem('brush_admin_username') || 'admin';
    $('logged-in-role').textContent = role();
    $('nav-logs').hidden = !isSuper();
    $('nav-manual-order').hidden = !isSuper();
    // The server only lets a superadmin create products.
    $('nav-add-product').hidden = !isSuper();
    openView(currentViewFromHash());
    // Prime the badges even if the admin lands on another tab.
    if (!orders) loadOrders(true);
    if (!products) loadInventory(false, true);
    loadReviews(true);
  }

  function logout(expired) {
    if (adminToken && !expired) {
      fetch(`${API_BASE}/admin/logout`, { method: 'POST', headers: { Authorization: `Bearer ${adminToken}` } }).catch(() => {});
    }
    ['brush_admin_token', 'brush_admin_role', 'brush_admin_username'].forEach(k => sessionStorage.removeItem(k));
    adminToken = null;
    orders = null; products = null; edits.clear();
    updateDirtyUi();
    checkAuth();
  }

  $('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('login-btn');
    const err = $('login-error');
    err.textContent = '';
    btn.disabled = true;
    btn.textContent = 'Signing in…';
    try {
      const res = await fetch(`${API_BASE}/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: $('admin-user').value.trim(), password: $('admin-pass').value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.token) throw new Error(res.status === 429 ? 'Too many attempts — wait a few minutes and try again.' : (data.error || 'Invalid credentials'));
      adminToken = data.token;
      sessionStorage.setItem('brush_admin_token', adminToken);
      sessionStorage.setItem('brush_admin_role', data.role || 'superadmin');
      sessionStorage.setItem('brush_admin_username', data.username || 'admin');
      $('login-form').reset();
      checkAuth();
    } catch (ex) {
      err.textContent = ex.message === 'Failed to fetch' ? "Can't reach the server — is the backend running?" : ex.message;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Log in';
    }
  });
  $('logout-btn').addEventListener('click', () => {
    if (edits.size && !confirm(`You have ${edits.size} unsaved product change(s). Log out anyway?`)) return;
    logout();
  });

  // ---------- navigation ----------
  const VIEWS = ['orders', 'inventory', 'manual-order', 'add-product', 'pricing', 'logs', 'tracking-portal', 'reachout', 'reviews'];
  function currentViewFromHash() {
    const h = location.hash.replace('#', '');
    if (h === 'logs' && !isSuper()) return 'orders';
    if (h === 'add-product' && !isSuper()) return 'orders';
    if (h === 'manual-order' && !isSuper()) return 'orders';
    return VIEWS.includes(h) ? h : 'orders';
  }
  function openView(name) {
    document.querySelectorAll('.nav-item[data-target]').forEach(n => {
      const on = n.dataset.target === name;
      n.classList.toggle('active', on);
      if (on) n.setAttribute('aria-current', 'page'); else n.removeAttribute('aria-current');
    });
    document.querySelectorAll('.view-section').forEach(v => v.classList.toggle('active', v.id === `${name}-view`));
    if (location.hash !== '#' + name) history.replaceState(null, '', '#' + name);
    if (name === 'orders') loadOrders();
    if (name === 'inventory') loadInventory();
    if (name === 'logs') loadLogs();
    if (name === 'pricing') loadPricing();
    if (name === 'add-product') fillAddForm();
    if (name === 'manual-order') initManualOrder();
    if (name === 'tracking-portal') loadTrackingPortal();
    if (name === 'reachout') loadReachoutMessages();
    if (name === 'reviews') loadReviews();
  }
  document.querySelectorAll('.nav-item[data-target]').forEach(item => item.addEventListener('click', () => openView(item.dataset.target)));
  window.addEventListener('hashchange', () => { if (adminToken) openView(currentViewFromHash()); });

  $('sidebar-toggle').addEventListener('click', () => {
    const sidebar = $('admin-sidebar');
    const collapsed = sidebar.classList.toggle('collapsed');
    $('sidebar-toggle-icon').className = `fa-solid fa-chevron-${collapsed ? 'right' : 'left'}`;
    $('sidebar-toggle').setAttribute('aria-expanded', String(!collapsed));
    $('sidebar-toggle').setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
    try { localStorage.setItem('brush_admin_sidebar', collapsed ? '1' : ''); } catch (e) {}
  });
  try { if (localStorage.getItem('brush_admin_sidebar') === '1') $('sidebar-toggle').click(); } catch (e) {}

  // =====================================================================
  // ORDERS
  // =====================================================================
  let orders = null;
  let orderFilter = 'active';
  let ordersPage = 1;
  const ORDERS_PAGE = 50;

  async function loadOrders(silent) {
    if (!adminToken) return;
    const tbody = $('orders-table-body');
    if (!orders && !silent) tbody.innerHTML = '<tr><td colspan="7" class="empty"><span class="skeleton"></span></td></tr>';
    try {
      orders = await api('/orders');
      renderOrders();
    } catch (e) {
      if (!silent) tbody.innerHTML = `<tr><td colspan="7" class="empty error">Couldn't load orders — ${escapeHtml(e.message)}</td></tr>`;
    }
  }

  function orderMatches(o, q) {
    if (!q) return true;
    const c = o.customer || {};
    const itemSkus = (o.items || []).flatMap(i => [i.sku, ...(i.customPosters || []).map(cp => cp.sku)]).filter(Boolean);
    return [o.orderId, c.name, c.email, c.id, c.phone, c.city, c.pincode, ...itemSkus].some(v => String(v || '').toLowerCase().includes(q));
  }

  function renderOrders() {
    if (!orders) return;
    const q = $('orders-search').value.trim().toLowerCase();
    const counts = { all: orders.length, active: 0 };
    STATUSES.forEach(s => { counts[s] = 0; });
    const isFulfilStatus = (s) => s === 'confirmed' || s === 'sent-for-printing' || s === 'printing' || s === 'packed';
    orders.forEach(o => {
      const s = o.status === 'printing' ? 'sent-for-printing' : o.status;
      counts[s] = (counts[s] || 0) + 1;
      if (isFulfilStatus(o.status)) counts.active++;
    });
    const awaitingPayment = counts['awaiting-payment'] || 0;

    // Stats
    const live = orders.filter(o => o.status !== 'cancelled');
    const today = new Date().toDateString();
    const todays = orders.filter(o => new Date(o.createdAt).toDateString() === today);
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const monthRevenue = live.filter(o => new Date(o.createdAt) >= monthStart).reduce((s, o) => s + Number(o.total || 0), 0);
    const aov = live.length ? live.reduce((s, o) => s + Number(o.total || 0), 0) / live.length : 0;
    $('order-stats').innerHTML = `
      <div class="stat${awaitingPayment ? ' is-alert' : ''}"><div class="stat-label">Awaiting payment</div><div class="stat-value">${awaitingPayment}</div><div class="stat-note">check the bank, then confirm</div></div>
      <div class="stat${counts.active ? ' is-alert' : ''}"><div class="stat-label">To fulfil</div><div class="stat-value">${counts.active}</div><div class="stat-note">confirmed + printing + packed</div></div>
      <div class="stat"><div class="stat-label">Today</div><div class="stat-value">${todays.length}</div><div class="stat-note">${inr(todays.filter(o => o.status !== 'cancelled').reduce((s, o) => s + Number(o.total || 0), 0))}</div></div>
      <div class="stat"><div class="stat-label">This month</div><div class="stat-value">${inr(Math.round(monthRevenue))}</div><div class="stat-note">excl. cancelled</div></div>
      <div class="stat"><div class="stat-label">Avg. order</div><div class="stat-value">${inr(Math.round(aov))}</div><div class="stat-note">${live.length} orders all-time</div></div>`;
    $('badge-orders').textContent = counts.active || '';

    // Chips
    const chips = [['active', 'To fulfil'], ['all', 'All'],
      ...STATUSES.map(s => [s, STATUS_LABELS[s] || (s[0].toUpperCase() + s.slice(1))])];
    $('orders-status-chips').innerHTML = chips.map(([k, label]) =>
      `<button type="button" class="chip${orderFilter === k ? ' active' : ''}" data-status="${k}" aria-pressed="${orderFilter === k}">${label} <span>${counts[k] || 0}</span></button>`).join('');

    const list = orders.filter(o => {
      const s = o.status;
      const matchesFilter = orderFilter === 'all'
        ? true
        : (orderFilter === 'active'
          ? isFulfilStatus(s)
          : (orderFilter === s || (orderFilter === 'sent-for-printing' && s === 'printing')));
      return matchesFilter && orderMatches(o, q);
    });

    const pages = Math.max(1, Math.ceil(list.length / ORDERS_PAGE));
    ordersPage = Math.min(ordersPage, pages);
    const slice = list.slice((ordersPage - 1) * ORDERS_PAGE, ordersPage * ORDERS_PAGE);
    const tbody = $('orders-table-body');
    if (!slice.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="empty">${orders.length ? 'No orders match this filter.' : 'No orders yet.'}</td></tr>`;
    } else {
      tbody.innerHTML = slice.map(orderRow).join('');
    }
    renderPager($('orders-pager'), ordersPage, pages, list.length, 'orders');
  }

  // ---- Fulfilment -------------------------------------------------------
  // Nothing is sent automatically. This renders the current state and, for a
  // superadmin, a Review button that shows the exact payload before anything
  // leaves the building.
  function fulfilCell(o) {
    const q = o.fulfilment || {};
    if (q.orderId) {
      return `<span class="status-badge status-delivered" title="Sent ${escapeHtml(new Date(q.sentAt).toLocaleString('en-IN'))} by ${escapeHtml(q.sentBy || '')}">Sent #${escapeHtml(q.orderId)}</span>
        <div class="muted small">${escapeHtml(q.environment || '')}${q.dashboardUrl ? ` · <a href="${escapeHtml(q.dashboardUrl)}" target="_blank" rel="noopener">partner dashboard</a>` : ''}</div>`;
    }
    const failed = q.lastError
      ? `<div class="muted small" style="color:var(--sale-red)" title="${escapeHtml(q.lastError)}">Last attempt failed</div>` : '';
    if (!isSuper()) return `<span class="muted small">Not sent</span>${failed}`;
    // Nothing goes to the printer before the money is in. The server refuses
    // this too, but offering the button at all invites a click that can only
    // fail — and on a busy day, an operator who assumes it worked.
    if (o.status === 'awaiting-payment') {
      return `<span class="muted small" title="Confirm the payment first, then this becomes available">Awaiting payment</span>${failed}`;
    }
    if (o.status === 'cancelled') return `<span class="muted small">Cancelled</span>${failed}`;
    return `<button type="button" class="btn btn-sm" data-action="fulfil">Review &amp; send</button>${failed}`;
  }

  // Two-step by design: build the payload server-side (dryRun), show it, and
  // only send if the operator says so. Printing is irreversible and costs money.
  async function reviewAndSend(orderId) {
    let preview;
    try {
      preview = await api(`/orders/${encodeURIComponent(orderId)}/fulfil?dryRun=1`, { method: 'POST' });
    } catch (err) {
      showToast(err.message, true);
      return;
    }
    const wrap = document.createElement('div');
    wrap.className = 'qk-review-overlay';
    const env = preview.environment === 'LIVE'
      ? '<strong style="color:var(--sale-red)">LIVE — this will be printed and shipped</strong>'
      : 'sandbox — safe to test';
    const lines = preview.payload.line_items.map(li =>
      `<li><code>${escapeHtml(li.sku)}</code> × ${escapeHtml(li.quantity)} · print type ${escapeHtml(li.print_type_id)}${li.designs ? ` · design <code>${escapeHtml(li.designs[0].design_code)}</code>` : ' · <em>plain</em>'}</li>`).join('');
    wrap.innerHTML = `
      <div class="qk-review" role="dialog" aria-modal="true" aria-label="Review fulfilment order">
        <h3>Send ${escapeHtml(orderId)} to fulfilment</h3>
        <p class="muted small">${env}</p>
        ${preview.alreadySent ? `<p style="color:var(--sale-red)"><strong>Already sent as #${escapeHtml(preview.alreadySent.orderId)}.</strong> Sending again would print it twice — the server will refuse.</p>` : ''}
        <ul class="qk-lines">${lines}</ul>
        <p class="muted small">Ship to ${escapeHtml(preview.payload.shipping_address.first_name)} ${escapeHtml(preview.payload.shipping_address.last_name)}, ${escapeHtml(preview.payload.shipping_address.city)} ${escapeHtml(preview.payload.shipping_address.zip)} · ${escapeHtml(preview.payload.gateway)} · ${escapeHtml(preview.payload.total_order_value)}</p>
        <details><summary>Exact payload</summary><pre class="qk-payload">${escapeHtml(JSON.stringify(preview.payload, null, 2))}</pre></details>
        <div class="qk-actions">
          <button type="button" class="btn" data-qk="cancel">Cancel</button>
          <button type="button" class="btn btn-primary" data-qk="send" ${preview.alreadySent ? 'disabled' : ''}>Send to fulfilment</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    const close = () => wrap.remove();
    wrap.addEventListener('click', async (e) => {
      if (e.target === wrap || e.target.dataset.qk === 'cancel') return close();
      if (e.target.dataset.qk !== 'send') return;
      e.target.disabled = true;
      e.target.textContent = 'Sending…';
      try {
        const out = await api(`/orders/${encodeURIComponent(orderId)}/fulfil`, { method: 'POST' });
        showToast(`Sent — fulfilment order ${out.fulfilment.orderId}`);
        close();
        loadOrders();
      } catch (err) {
        showToast(err.message, true);
        e.target.disabled = false;
        e.target.textContent = 'Send to fulfilment';
      }
    });
  }

  function orderRow(o) {
    const id = escapeHtml(o.orderId || o.id || o._id || '');
    const c = o.customer || {};
    const status = STATUSES.includes(o.status) ? o.status : (o.status === 'printing' ? 'sent-for-printing' : 'confirmed');
    const items = o.items || [];
    const itemCount = items.reduce((n, i) => n + Number(i.quantity || 0), 0);
    return `
      <tr data-order="${id}">
        <td><strong class="mono">${id}</strong><div class="muted small">${itemCount} item${itemCount === 1 ? '' : 's'}</div></td>
        <td class="nowrap" title="${escapeHtml(new Date(o.createdAt).toLocaleString('en-IN'))}">${relTime(o.createdAt)}</td>
        <td>${escapeHtml(c.name)}<div class="muted small">${escapeHtml(c.city)}${c.phone ? ' · ' + escapeHtml(c.phone) : ''}</div></td>
        <td class="right nowrap"><strong>${inr(o.total)}</strong></td>
        <td><span class="small" style="text-transform:uppercase;font-weight:700;">${o.paymentMethod === 'direct' ? 'TRANSFER' : escapeHtml(o.paymentMethod)}</span>${o.paymentReference ? `<div class="muted small pay-ref" title="Reference the customer gave for their transfer">${escapeHtml(o.paymentReference)}</div>` : ''}${o.preferredCourier ? `<div class="muted small courier-flag" title="Customer asked for this courier — confirm serviceability and any extra charge with them before dispatch"><i class="fa-solid fa-truck-fast" aria-hidden="true"></i> ${escapeHtml(o.preferredCourier)}</div>` : ''}${o.awbNumber ? `<div class="muted small" style="margin-top:2px;"><a href="/track/?awb=${encodeURIComponent(o.awbNumber)}" target="_blank" style="color:var(--accent);text-decoration:none;font-weight:600;" title="Live AWB: ${escapeHtml(o.awbNumber)}"><i class="fa-solid fa-location-dot"></i> ${escapeHtml(o.awbNumber)}</a></div>` : ''}</td>
        <td>
          <div class="status-cell">
            ${!isWatcher() ? `
            <select class="field field-sm status-dropdown" data-action="status" data-prev="${status}" aria-label="Status for ${id}">
              ${STATUSES.map(s => `<option value="${s}" ${s === status ? 'selected' : ''}>${STATUS_LABELS[s] || (s[0].toUpperCase() + s.slice(1))}</option>`).join('')}
            </select>` : `<span class="status-badge status-${status}">${STATUS_LABELS[status] || status}</span>`}
          </div>
        </td>
        <td>${fulfilCell(o)}</td>
        <td>
          <div class="row-actions">
            <button type="button" class="btn btn-sm btn-icon" data-action="details" aria-expanded="false" title="Show details" aria-label="Show details"><i class="fa-solid fa-chevron-down" aria-hidden="true"></i></button>
            <a href="${API_BASE}/orders/${encodeURIComponent(o.orderId)}/invoice" target="_blank" rel="noopener" class="btn btn-sm btn-icon" title="Invoice (PDF)" aria-label="Invoice"><i class="fa-solid fa-file-pdf" aria-hidden="true"></i></a>
            ${!isWatcher() ? `<button type="button" class="btn btn-sm btn-icon" data-action="email" title="Email the customer their current status" aria-label="Send status email"><i class="fa-solid fa-envelope" aria-hidden="true"></i></button>` : ''}
            ${status === 'awaiting-payment' && o.paymentMethod === 'direct' && isSuper() ? `<button type="button" class="btn btn-sm btn-secondary" data-action="request-payment" title="Email customer with QR code and bank details">Req Pay</button>` : ''}
            ${status === 'awaiting-payment' && isSuper() ? `<button type="button" class="btn btn-sm btn-confirm-pay" data-action="confirm-payment" title="Confirm this payment arrived">Confirm payment</button>` : ''}
            ${status !== 'cancelled' && isSuper() ? `<button type="button" class="btn btn-sm btn-icon btn-danger" data-action="cancel" title="Cancel order" aria-label="Cancel order"><i class="fa-solid fa-ban" aria-hidden="true"></i></button>` : ''}
          </div>
        </td>
      </tr>
      <tr class="details-row" data-details="${id}" data-order="${id}" hidden>
        <td colspan="8">
          <div class="details-grid">
            ${o.paymentMethod === 'direct' ? `
            <div>
              <h4>Payment</h4>
              <p>Direct transfer &middot; <strong>${inr(o.total)}</strong></p>
              <p>Reference: <strong class="pay-ref">${escapeHtml(o.paymentReference || '—')}</strong></p>
              ${o.paymentVerifiedAt
                ? `<p class="muted small">Confirmed by ${escapeHtml(o.paymentVerifiedBy || '')} on ${escapeHtml(new Date(o.paymentVerifiedAt).toLocaleString('en-IN'))}</p>`
                : `<p class="muted small">Not yet matched against the bank. Check for this reference before confirming.</p>`}
            </div>` : ''}
            <div>
              <h4>Delivery</h4>
              <p>${escapeHtml(o.deliveryLabel || 'Standard')}${o.deliveryPromise ? ' · ' + escapeHtml(o.deliveryPromise) : ''}</p>
              ${o.preferredCourier
                ? `<p class="courier-ask"><strong>Courier requested: ${escapeHtml(o.preferredCourier)}</strong><br><span class="muted small">Check serviceability for ${escapeHtml((o.customer || {}).pincode || '—')}. If it costs extra, agree the amount with the customer before dispatch — nothing was charged at checkout.</span></p>`
                : `<p class="muted small">No courier preference.</p>`}
              ${o.courierPreferenceStatus === 'not-applicable-free-delivery' ? `<p class="muted small">A preference was picked but delivery was free, so it does not apply.</p>` : ''}

              <div class="tracking-edit mt-3" style="border-top: 1px solid var(--b); padding-top: 10px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                  <h4 style="font-size: 0.9em; margin: 0;">Transit Tracking</h4>
                  ${o.awbNumber ? `<a href="/track/?awb=${encodeURIComponent(o.awbNumber)}" target="_blank" style="font-size: 0.78rem; color: var(--accent); text-decoration: none; font-weight: 600;"><i class="fa-solid fa-arrow-up-right-from-square"></i> Open Customer Tracker</a>` : ''}
                </div>
                <div class="field-group" style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
                  <input type="text" class="field field-sm" id="tracking-courier-${id}" placeholder="Courier (e.g. DTDC)" value="${escapeHtml(o.courierPartner || 'DTDC')}" style="max-width: 130px;">
                  <input type="text" class="field field-sm" id="tracking-awb-${id}" placeholder="AWB / Transit No." value="${escapeHtml(o.awbNumber || '')}" style="max-width: 150px;">
                  <input type="text" class="field field-sm" id="tracking-url-${id}" placeholder="Partner Tracking Link (e.g. Printster URL)" value="${escapeHtml(o.trackingUrl || '')}" style="flex: 1; min-width: 200px;">
                  <button type="button" class="btn btn-sm btn-secondary" data-action="save-tracking" data-target="${id}">Save Tracking</button>
                  ${o.awbNumber ? `
                    <button type="button" class="btn btn-sm btn-ghost" data-action="copy-tracking" data-awb="${escapeHtml(o.awbNumber)}" title="Copy Customer Tracking Link">
                      <i class="fa-solid fa-copy"></i> Copy Link
                    </button>
                    <button type="button" class="btn btn-sm btn-ghost" data-action="order-inspect-telemetry" data-awb="${escapeHtml(o.awbNumber)}" title="Inspect Live Telemetry">
                      <i class="fa-solid fa-satellite-dish"></i> Live Telemetry
                    </button>
                  ` : ''}
                  ${o.trackingUrl ? `
                    <a href="${escapeHtml(o.trackingUrl)}" target="_blank" class="btn btn-sm btn-ghost" style="text-decoration:none;" title="Open Original Partner Link">
                      <i class="fa-solid fa-external-link"></i> Partner Link
                    </a>
                  ` : ''}
                </div>
              </div>
            </div>
            <div>
              <h4>Customer</h4>
              <p><strong>${escapeHtml(c.name)}</strong></p>
              <p>${escapeHtml(c.email || c.id || '—')}</p>
              <p>${escapeHtml(c.phone || '—')}</p>
              <p class="muted">${escapeHtml(c.address)}, ${escapeHtml(c.city)}, ${escapeHtml(c.state)} – ${escapeHtml(c.pincode)}</p>
            </div>
            <div>
              <h4>Items</h4>
              <table class="items-table">
                <thead><tr><th>Item</th><th>SKU</th><th>Options</th><th class="right">Qty</th><th class="right">Amount</th></tr></thead>
                <tbody>
                  ${items.map(i => `
                    <tr>
                      <td>
                        <div style="display:flex; align-items:flex-start; gap:12px;">
                          ${i.image ? `
                            <div style="position:relative; width:44px; height:60px; border-radius:4px; overflow:hidden; border:1px solid #444; flex-shrink:0; background:#222; box-shadow:0 1px 3px rgba(0,0,0,0.35);">
                              <img src="${escapeHtml(i.image)}" style="width:100%; height:100%; object-fit:cover; display:block;" loading="lazy" alt="${escapeHtml(i.name)}">
                            </div>
                          ` : ''}
                          <div style="flex:1;">
                            <strong style="font-size:0.92rem; display:block; margin-bottom:2px;">${escapeHtml(i.name)}</strong>
                            ${Array.isArray(i.customPosters) && i.customPosters.length > 0 ? `
                              <div style="margin-top:6px; display:flex; flex-wrap:wrap; gap:6px;">
                                ${i.customPosters.map((cp, idx) => {
                                  const sku = cp.sku || (cp.id ? String(cp.id) : '');
                                  return `
                                    <div style="position:relative; width:36px; height:48px; border-radius:3px; overflow:hidden; border:1px solid #444;" title="${escapeHtml(cp.name || cp.title || '')} (${escapeHtml(cp.size || 'A5')})${sku ? ` &mdash; SKU: ${escapeHtml(sku)}` : ''}">
                                      <img src="${escapeHtml(cp.image)}" style="width:100%; height:100%; object-fit:cover;" loading="lazy">
                                      <span style="position:absolute; bottom:1px; right:1px; background:rgba(0,0,0,0.85); color:#fff; font-size:0.5rem; font-weight:700; padding:1px 2px; border-radius:2px; line-height:1;">${escapeHtml(cp.size || 'A5')}</span>
                                    </div>
                                  `;
                                }).join('')}
                              </div>
                              <div style="margin-top:8px; background:rgba(255,255,255,0.03); border:1px solid #333; border-radius:6px; padding:6px 10px;">
                                <div style="font-size:0.75rem; font-weight:700; color:#e5a93c; margin-bottom:5px;">
                                  <i class="fa-solid fa-layer-group"></i> Pack Posters &amp; SKUs (${i.customPosters.length} Items):
                                </div>
                                <table style="width:100%; font-size:0.75rem; border-collapse:collapse; margin-top:4px;">
                                  <thead>
                                    <tr style="text-align:left; color:#888; border-bottom:1px solid #444;">
                                      <th style="padding:2px 4px; width:20px;">#</th>
                                      <th style="padding:2px 4px; width:34px;">Thumb</th>
                                      <th style="padding:2px 4px;">Poster Name</th>
                                      <th style="padding:2px 4px; width:50px;">Size</th>
                                      <th style="padding:2px 4px; width:130px;">SKU</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    ${i.customPosters.map((cp, idx) => {
                                      const sku = cp.sku || (cp.id ? String(cp.id) : '—');
                                      return `
                                        <tr style="border-bottom:1px solid rgba(255,255,255,0.04);">
                                          <td style="padding:4px; color:#888; vertical-align:middle;">${idx + 1}</td>
                                          <td style="padding:4px; vertical-align:middle;">
                                            ${cp.image ? `
                                              <div style="width:28px; height:38px; border-radius:3px; overflow:hidden; border:1px solid #444; background:#222;">
                                                <img src="${escapeHtml(cp.image)}" style="width:100%; height:100%; object-fit:cover; display:block;" loading="lazy" alt="${escapeHtml(cp.name || cp.title || '')}">
                                              </div>
                                            ` : ''}
                                          </td>
                                          <td style="padding:4px; font-weight:600; vertical-align:middle;">${escapeHtml(cp.name || cp.title || 'Poster')}</td>
                                          <td style="padding:4px; vertical-align:middle;"><span style="display:inline-block; padding:1px 5px; border-radius:3px; background:#222; border:1px solid #444; font-weight:700;">${escapeHtml(cp.size || 'A5')}</span></td>
                                          <td style="padding:4px; vertical-align:middle;"><code style="background:rgba(229,169,60,0.15); color:#e5a93c; padding:2px 6px; border-radius:4px; font-family:monospace; font-size:0.75rem; font-weight:700;">${escapeHtml(sku)}</code></td>
                                        </tr>
                                      `;
                                    }).join('')}
                                  </tbody>
                                </table>
                              </div>
                            ` : ''}
                          </div>
                        </div>
                      </td>
                      <td style="vertical-align:top; padding-top:12px;">
                        <code style="background:rgba(229,169,60,0.15); color:#e5a93c; padding:3px 8px; border-radius:4px; font-family:monospace; font-size:0.8rem; font-weight:700; white-space:nowrap;">
                          ${escapeHtml(i.sku || '—')}
                        </code>
                      </td>
                      <td class="muted small" style="vertical-align:top; padding-top:12px;">${formatVariantLine(i)}</td>
                      <td class="right" style="vertical-align:top; padding-top:12px;">${Number(i.quantity)}</td>
                      <td class="right" style="vertical-align:top; padding-top:12px;">${inr(Number(i.price) * Number(i.quantity))}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
              <div class="totals">
                <p>Subtotal (Inc. Tax) ${inr(o.subtotal)}</p>
                ${o.launchDiscount ? `<p>Launch offer -${inr(o.launchDiscount)}</p>` : ''}
                ${o.bundleDiscount ? `<p>${escapeHtml(o.bundleLabel || 'Combo offer')} (${o.bundleFreeCount || 0} free) -${inr(o.bundleDiscount)}</p>` : ''}
                ${o.couponDiscount ? `<p>Coupon -${inr(o.couponDiscount)}</p>` : ''}
                ${(o.launchDiscount == null && o.couponDiscount == null && o.discount) ? `<p>Discount -${inr(o.discount)}</p>` : ''}
                <p>Delivery ${o.shipping ? inr(o.shipping) : 'FREE'}</p>
                ${o.processingFee ? `<p>Handling fee ${inr(o.processingFee)}</p>` : ''}
                ${o.codFee ? `<p>COD fee ${inr(o.codFee)}</p>` : ''}
                <p class="muted" style="color:var(--text-secondary);font-size:0.85rem;">Includes GST ${inr(o.tax != null ? o.tax : o.gst)}</p>
                <p class="grand">Total ${inr(o.total)}</p>
              </div>
            </div>
          </div>
        </td>
      </tr>`;
  }

  async function setOrderStatus(orderId, status) {
    const canonical = (status === 'Sent for Printing' || status === 'printing') ? 'sent-for-printing' : status;
    const data = await api(`/orders/${encodeURIComponent(orderId)}/status`, { method: 'PATCH', body: JSON.stringify({ status: canonical }) });
    const o = orders.find(x => x.orderId === orderId || x.id === orderId || x._id === orderId);
    if (o) {
      o.status = canonical;
      if (data.emailSent) {
        o.emailDelivery = { lastStatus: 'sent', status: canonical, lastSentAt: new Date().toISOString() };
      }
    }
    const label = STATUS_LABELS[canonical] || canonical;
    if (data.unchanged) showToast(`Order ${orderId} is already ${label}.`);
    else if (data.emailSent) showToast(`Order ${orderId} → ${label}. Status email sent.`);
    else showToast(`Order ${orderId} → ${label}, but the email failed: ${data.emailError || 'unknown error'}`, true);
    renderOrders();
  }

  $('orders-table-body').addEventListener('change', async (e) => {
    const sel = e.target.closest('[data-action="status"]');
    if (!sel) return;
    const orderId = sel.closest('tr').dataset.order;
    const prev = sel.dataset.prev;
    // A status change emails the customer — and "cancelled" can't be undone
    // from their side — so the dropdown asks first, like the Cancel button.
    const msg = sel.value === 'cancelled'
      ? `Cancel order ${orderId}? The customer will be emailed.`
      : `Mark order ${orderId} as ${sel.value}? The customer will be emailed.`;
    if (!confirm(msg)) { sel.value = prev; return; }
    sel.disabled = true;
    try { await setOrderStatus(orderId, sel.value); }
    catch (ex) { sel.value = prev; sel.disabled = false; showToast(ex.message, true); }
  });

  $('orders-table-body').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn || btn.tagName === 'SELECT') return;
    const tr = btn.closest('tr');
    const orderId = btn.dataset.target || (tr ? (tr.dataset.order || tr.dataset.details) : null);
    if (!orderId) return;

    if (btn.dataset.action === 'details') {
      const row = $('orders-table-body').querySelector(`[data-details="${CSS.escape(orderId)}"]`);
      row.hidden = !row.hidden;
      btn.setAttribute('aria-expanded', String(!row.hidden));
      btn.querySelector('i').className = `fa-solid fa-chevron-${row.hidden ? 'down' : 'up'}`;
    } else if (btn.dataset.action === 'fulfil') {
      await reviewAndSend(orderId);
    } else if (btn.dataset.action === 'request-payment') {
      if (!confirm(`Email the customer the UPI QR code and bank details to request payment for ${orderId}?`)) return;
      btn.disabled = true;
      btn.textContent = 'Sending...';
      try {
        await api(`/orders/${encodeURIComponent(orderId)}/request-payment`, { method: 'POST' });
        showToast(`Payment request email sent for ${orderId}!`);
      } catch (ex) {
        showToast(ex.message, true);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Req Pay';
      }
    } else if (btn.dataset.action === 'confirm-payment') {
      const row = btn.closest('tr');
      const ref = (row.querySelector('.pay-ref') || {}).textContent || 'no reference given';
      const amount = (row.querySelector('td.right strong') || {}).textContent || '';
      if (!confirm(
        `Confirm payment for ${orderId}?\n\n` +
        `Reference: ${ref}\nAmount: ${amount}\n\n` +
        `Check this against your bank first. Confirming emails the customer that their order is confirmed, and lets it be sent for fulfilment.`
      )) return;
      btn.disabled = true;
      btn.textContent = 'Confirming…';
      try {
        await api(`/orders/${encodeURIComponent(orderId)}/confirm-payment`, { method: 'POST' });
        showToast(`Payment confirmed — ${orderId} is now confirmed and the customer has been emailed.`);
        await loadOrders(true);
      } catch (ex) {
        btn.disabled = false;
        btn.textContent = 'Confirm payment';
        showToast(ex.message, true);
      }
    } else if (btn.dataset.action === 'save-tracking') {
      const courierEl = document.getElementById(`tracking-courier-${orderId}`);
      const awbEl = document.getElementById(`tracking-awb-${orderId}`);
      const urlEl = document.getElementById(`tracking-url-${orderId}`);

      const courierPartner = courierEl ? courierEl.value.trim() : 'DTDC';
      const awbNumber = awbEl ? awbEl.value.trim() : '';
      const trackingUrl = urlEl ? urlEl.value.trim() : '';

      btn.disabled = true;
      const originalText = btn.textContent;
      btn.textContent = 'Saving...';

      try {
        const resp = await api(`/orders/${encodeURIComponent(orderId)}/tracking`, {
          method: 'PATCH',
          body: JSON.stringify({ courierPartner, awbNumber, trackingUrl })
        });

        // Capture which details rows are currently open so they remain open after re-render
        const openDetails = new Set(
          Array.from(document.querySelectorAll('#orders-table-body .details-row:not([hidden])'))
            .map(r => r.getAttribute('data-details') || r.getAttribute('data-order'))
            .filter(Boolean)
        );
        openDetails.add(orderId);

        // Update local state without losing details state
        const o = orders.find(x => x.orderId === orderId || x.id === orderId || x._id === orderId);
        if (o) {
          o.courierPartner = resp.courierPartner !== undefined ? resp.courierPartner : courierPartner;
          o.awbNumber = resp.awbNumber !== undefined ? resp.awbNumber : awbNumber;
          o.trackingUrl = resp.trackingUrl !== undefined ? resp.trackingUrl : trackingUrl;
        }

        renderOrders();

        // Restore open state
        openDetails.forEach(id => {
          const r = document.querySelector(`#orders-table-body [data-details="${CSS.escape(id)}"]`);
          if (r) r.hidden = false;
          const toggleBtn = document.querySelector(`#orders-table-body tr[data-order="${CSS.escape(id)}"] [data-action="details"]`);
          if (toggleBtn) {
            toggleBtn.setAttribute('aria-expanded', 'true');
            const icon = toggleBtn.querySelector('i');
            if (icon) icon.className = 'fa-solid fa-chevron-up';
          }
        });

        const savedPartner = (resp.courierPartner !== undefined ? resp.courierPartner : courierPartner) || 'DTDC';
        const savedAwb = resp.awbNumber !== undefined ? resp.awbNumber : awbNumber;
        showToast(`Tracking saved for ${orderId}: ${savedPartner}${savedAwb ? ' · AWB: ' + savedAwb : ''}`);
      } catch (ex) {
        showToast(ex.message, true);
      } finally {
        btn.disabled = false;
        btn.textContent = originalText;
      }
    } else if (btn.dataset.action === 'copy-tracking') {
      const awb = btn.dataset.awb || '';
      const link = `${window.location.origin}/track/?awb=${encodeURIComponent(awb)}`;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(link).then(() => {
          showToast(`Copied tracking link: ${link}`);
        }).catch(() => {
          prompt('Copy tracking link:', link);
        });
      } else {
        prompt('Copy tracking link:', link);
      }
    } else if (btn.dataset.action === 'order-inspect-telemetry') {
      const awb = btn.dataset.awb || '';
      if (awb) {
        openView('tracking-portal');
        $('tracking-inspect-input').value = awb;
        $('tracking-inspect-form').dispatchEvent(new Event('submit'));
        window.scrollTo({ top: $('tracking-inspect-form').offsetTop - 60, behavior: 'smooth' });
      }
    } else if (btn.dataset.action === 'cancel') {
      if (!confirm(`Cancel order ${orderId}? This can't be undone and the customer will be emailed.`)) return;
      btn.disabled = true;
      try { await setOrderStatus(orderId, 'cancelled'); } catch (ex) { btn.disabled = false; showToast(ex.message, true); }
    } else if (btn.dataset.action === 'email') {
      btn.disabled = true;
      try {
        const data = await api(`/orders/${encodeURIComponent(orderId)}/send-update`, { method: 'POST' });
        showToast(`Status email sent to ${data.to || 'the customer'}.`);
      } catch (ex) { showToast(ex.message, true); }
      btn.disabled = false;
    }
  });

  $('orders-status-chips').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-status]');
    if (!chip) return;
    orderFilter = chip.dataset.status;
    ordersPage = 1;
    renderOrders();
  });
  $('orders-search').addEventListener('input', debounce(() => { ordersPage = 1; renderOrders(); }, 150));
  $('orders-refresh').addEventListener('click', () => loadOrders());

  // =====================================================================
  // INVENTORY
  // =====================================================================
  let products = null;
  let invPage = 1;
  const INV_PAGE = 40;
  // Unsaved edits, keyed by product id: survive filtering, paging and
  // searching (the old table re-rendered from the server copy on every
  // keystroke and silently threw them away).
  const edits = new Map();

  async function loadInventory(force, silent) {
    if (!adminToken) return;
    if (products && !force) { renderInventory(); return; }
    if (force && edits.size && !confirm(`Refreshing will discard ${edits.size} unsaved change(s). Continue?`)) return;
    if (force) edits.clear();
    const tbody = $('inventory-table-body');
    if (!silent) tbody.innerHTML = '<tr><td colspan="8" class="empty"><span class="skeleton"></span></td></tr>';
    try {
      const res = await fetch(`${API_BASE}/products`);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      products = await res.json();
      renderManualProductOptions();
      fillFilterOptions();
      updateDirtyUi();
      renderInventory();
    } catch (e) {
      if (!silent) tbody.innerHTML = `<tr><td colspan="8" class="empty error">Couldn't load products — ${escapeHtml(e.message)}</td></tr>`;
    }
  }

  function getProductCategories(p) {
    if (!p) return [];
    const set = new Set();
    const list = [];
    const add = (str) => {
      if (!str || typeof str !== 'string') return;
      const clean = str.trim();
      if (!clean) return;
      const lower = clean.toLowerCase();
      if (!set.has(lower)) {
        set.add(lower);
        list.push(clean);
      }
    };
    if (Array.isArray(p.categories)) {
      p.categories.forEach(c => {
        if (typeof c === 'string') c.split(/[,|]/).forEach(add);
      });
    }
    if (typeof p.category === 'string') {
      p.category.split(/[,|]/).forEach(add);
    }
    return list;
  }

  function allCategories() {
    const set = new Set(BASE_CATEGORIES);
    (products || []).forEach(p => {
      getProductCategories(p).forEach(c => set.add(c));
    });
    return [...set].sort((a, b) => a.localeCompare(b));
  }

  function fillFilterOptions() {
    const tf = $('inventory-type-filter');
    const tv = tf.value;
    const counts = {};
    products.forEach(p => { const k = typeKey(p.productType); counts[k] = (counts[k] || 0) + 1; });
    tf.innerHTML = '<option value="all">All types</option>' + TYPES.filter(t => counts[t.key]).map(t => `<option value="${t.key}">${t.label}s (${counts[t.key]})</option>`).join('');
    tf.value = [...tf.options].some(o => o.value === tv) ? tv : 'all';
    const cf = $('inventory-cat-filter');
    const cv = cf.value;
    const cc = {};
    products.forEach(p => {
      getProductCategories(p).forEach(c => {
        cc[c] = (cc[c] || 0) + 1;
      });
    });
    cf.innerHTML = '<option value="All">All categories</option>' + Object.keys(cc).sort().map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)} (${cc[c]})</option>`).join('');
    cf.value = [...cf.options].some(o => o.value === cv) ? cv : 'All';
  }

  // Current values for a product: server copy with any unsaved edits on top.
  const view = (p) => ({ ...p, ...(edits.get(String(p.id)) || {}) });

  function filteredProducts() {
    const q = $('inventory-search').value.trim().toLowerCase();
    const type = $('inventory-type-filter').value;
    const cat = $('inventory-cat-filter').value;
    const stock = $('inventory-stock-filter').value;
    const sort = $('inventory-sort').value;
    let list = products.map(view).filter(p => {
      if (type !== 'all' && typeKey(p.productType) !== type) return false;
      if (cat !== 'All') {
        const pCats = getProductCategories(p);
        if (!pCats.some(c => c.toLowerCase() === cat.toLowerCase())) return false;
      }
      const s = stockOf(p);
      if (stock === 'out' && s > 0) return false;
      if (stock === 'low' && !(s > 0 && s <= LOW_STOCK)) return false;
      if (stock === 'in' && s <= 0) return false;
      if (q && !`${p.name || ''} ${p.sku || ''} ${p.id}`.toLowerCase().includes(q)) return false;
      return true;
    });
    const by = {
      'stock-asc': (a, b) => stockOf(a) - stockOf(b),
      'stock-desc': (a, b) => stockOf(b) - stockOf(a),
      'freq-desc': (a, b) => (b.orderFrequency || 0) - (a.orderFrequency || 0),
      name: (a, b) => String(a.name).localeCompare(String(b.name)),
      newest: (a, b) => (Number(b.id) || 0) - (Number(a.id) || 0),
    }[sort];
    if (by) list = list.slice().sort(by);
    return list;
  }

  function renderInventory() {
    if (!products) return;
    // Stats
    const out = products.filter(p => stockOf(view(p)) <= 0).length;
    const low = products.filter(p => { const s = stockOf(view(p)); return s > 0 && s <= LOW_STOCK; }).length;
    const onHome = products.filter(p => p.showInBestsellers || p.showInNewArrivals || p.showInGrossing || p.showInHero).length;
    $('inventory-stats').innerHTML = `
      <div class="stat"><div class="stat-label">Products</div><div class="stat-value">${products.length}</div><div class="stat-note">${onHome} featured on the homepage</div></div>
      <div class="stat${out ? ' is-alert' : ''}"><div class="stat-label">Out of stock</div><div class="stat-value">${out}</div><div class="stat-note"><button type="button" class="btn btn-sm" data-quick="out">Show</button></div></div>
      <div class="stat"><div class="stat-label">Low stock</div><div class="stat-value">${low}</div><div class="stat-note"><button type="button" class="btn btn-sm" data-quick="low">Show</button> ≤ ${LOW_STOCK} left</div></div>`;
    $('badge-inventory').textContent = out || '';

    const list = filteredProducts();
    const pages = Math.max(1, Math.ceil(list.length / INV_PAGE));
    invPage = Math.min(invPage, pages);
    const slice = list.slice((invPage - 1) * INV_PAGE, invPage * INV_PAGE);
    $('inventory-table-body').innerHTML = slice.length ? slice.map(productRow).join('') : '<tr><td colspan="8" class="empty">No products match these filters.</td></tr>';
    renderPager($('inventory-pager'), invPage, pages, list.length, 'products');
  }

  function productRow(p) {
    const id = escapeHtml(p.id);
    const canEdit = isSuper();
    const canStock = !isWatcher();
    const dis = canEdit ? '' : 'disabled';
    const s = stockOf(p);
    const tk = typeKey(p.productType);
    const cats = allCategories();
    if (p.category && !cats.includes(p.category)) cats.push(p.category);
    const locked = typeof Cart !== 'undefined' && typeof Cart.typeConfigFor(p.productType).basePrice === 'number';
    const thumb = window.BrushImg ? BrushImg.src(p, 480) : p.image;
    return `
      <tr data-id="${id}" class="${edits.has(String(p.id)) ? 'is-dirty' : ''}">
        <td>
          <div class="prod-cell">
            <img src="${escapeHtml(thumb)}" data-orig="${escapeHtml(p.image)}" data-fallback="img/placeholders/fallback.webp" onerror="BrushImg.onError(this)" alt="" class="prod-thumb" width="48" height="60" loading="lazy" decoding="async">
            <div class="prod-fields">
              <input type="text" class="field field-sm" data-field="name" value="${escapeHtml(p.name)}" ${dis} aria-label="Name">
              <select class="field field-sm" data-field="productType" ${dis} aria-label="Product type">
                ${TYPES.map(t => `<option value="${t.value}" ${t.key === tk ? 'selected' : ''}>${t.label}</option>`).join('')}
                ${!typeMeta(p.productType) ? `<option value="${escapeHtml(p.productType)}" selected>${escapeHtml(p.productType)}</option>` : ''}
              </select>
              <input type="text" class="field field-sm" data-field="category" list="category-options" value="${escapeHtml(Array.isArray(p.categories) && p.categories.length ? p.categories.join(', ') : (p.category || ''))}" placeholder="Categories (e.g. Gaming, Anime)" ${dis} aria-label="Category" title="Enter one or multiple categories separated by comma, e.g. Gaming, Anime">
            </div>
          </div>
        </td>
        <td><input type="text" class="field field-sm mono w-md" data-field="sku" value="${escapeHtml(p.sku || p.id)}" ${dis} aria-label="SKU"><div class="muted small">ID ${id}</div></td>
        <td>
          <div class="inv-stack">
            <input type="text" class="field field-sm w-md" data-field="badge" value="${escapeHtml(p.badge || '')}" placeholder="Badge" ${dis} aria-label="Badge">
            <input type="text" class="field field-sm w-md" data-field="keywords" value="${escapeHtml(keywordsText(p.keywords))}" placeholder="Keywords" ${dis} aria-label="Keywords">
          </div>
        </td>
        <td class="nowrap">
          ${locked
            ? `<span class="locked-price">${inr(p.price)}</span><span class="locked-note" title="Priced from the rate table — see Pricing"><i class="fa-solid fa-lock" aria-hidden="true"></i> rate table</span>`
            : `<input type="number" min="0" step="1" class="field field-sm w-sm" data-field="price" value="${escapeHtml(p.price)}" ${dis} aria-label="Price">`}
        </td>
        <td class="${s <= 0 ? 'stock-out' : s <= LOW_STOCK ? 'stock-low' : ''}">
          <input type="number" min="0" step="1" class="field field-sm w-sm" data-field="stockQuantity" value="${s}" ${canStock ? '' : 'disabled'} aria-label="Stock">
        </td>
        <td class="right"><strong>${Number(p.orderFrequency || 0)}</strong></td>
        <td>
          <label class="check"><input type="checkbox" data-field="showInBestsellers" ${p.showInBestsellers ? 'checked' : ''} ${dis}> Bestsellers</label>
          <label class="check"><input type="checkbox" data-field="showInNewArrivals" ${p.showInNewArrivals ? 'checked' : ''} ${dis}> New arrivals</label>
          <label class="check"><input type="checkbox" data-field="showInGrossing" ${p.showInGrossing ? 'checked' : ''} ${dis}> Grossing</label>
          <label class="check" title="Adds this product's image to the landing-page slideshow"><input type="checkbox" data-field="showInHero" ${p.showInHero ? 'checked' : ''} ${dis}> Hero slideshow</label>
        </td>
        <td>
          <div class="inv-stack">
            <button type="button" class="btn btn-sm" data-action="save" ${canStock && edits.has(String(p.id)) ? '' : 'disabled'}>Save</button>
            ${isSuper() ? '<button type="button" class="btn btn-sm btn-danger" data-action="delete">Delete</button>' : ''}
          </div>
        </td>
      </tr>`;
  }

  // Read a row's inputs into the fields this role may change.
  function readRow(tr) {
    const out = {};
    tr.querySelectorAll('[data-field]').forEach(el => {
      const f = el.dataset.field;
      if (el.disabled) return;
      if (el.type === 'checkbox') out[f] = el.checked;
      else if (el.type === 'number') out[f] = el.value === '' ? '' : Number(el.value);
      else out[f] = el.value.trim();
    });
    return out;
  }

  // Only the fields that actually differ from the server copy.
  function diff(p, row) {
    const d = {};
    Object.entries(row).forEach(([k, v]) => {
      const orig = k === 'keywords' ? keywordsText(p.keywords) : k === 'sku' ? String(p.sku || p.id) : k === 'stockQuantity' ? stockOf(p) : p[k];
      if (k === 'productType' ? typeKey(v) !== typeKey(orig) : String(v ?? '') !== String(orig ?? (typeof v === 'boolean' ? false : ''))) d[k] = v;
    });
    return d;
  }

  $('inventory-table-body').addEventListener('input', onRowEdit);
  $('inventory-table-body').addEventListener('change', onRowEdit);
  function onRowEdit(e) {
    const tr = e.target.closest('tr[data-id]');
    if (!tr || !e.target.dataset.field) return;
    const p = products.find(x => String(x.id) === tr.dataset.id);
    const d = diff(p, readRow(tr));
    if (Object.keys(d).length) edits.set(tr.dataset.id, d); else edits.delete(tr.dataset.id);
    tr.classList.toggle('is-dirty', edits.has(tr.dataset.id));
    tr.querySelector('[data-action="save"]').disabled = !edits.has(tr.dataset.id);
    if (e.target.dataset.field === 'stockQuantity') {
      const s = Number(e.target.value);
      e.target.parentElement.className = s <= 0 ? 'stock-out' : s <= LOW_STOCK ? 'stock-low' : '';
    }
    updateDirtyUi();
  }

  function updateDirtyUi() {
    const n = edits.size;
    const btn = $('save-all-btn');
    btn.disabled = !n || isWatcher();
    btn.querySelector('span').textContent = n ? `Save ${n} change${n === 1 ? '' : 's'}` : 'No unsaved changes';
    $('discard-btn').hidden = !n;
  }

  // Validate before sending; the server stores whatever it's given.
  function validate(p, d) {
    if ('name' in d && !d.name) return "Name can't be empty";
    if ('stockQuantity' in d && (!Number.isInteger(d.stockQuantity) || d.stockQuantity < 0)) return 'Stock must be a whole number ≥ 0';
    if ('price' in d && (!Number.isFinite(d.price) || d.price <= 0)) return 'Price must be more than 0';
    return null;
  }

  async function saveProduct(id) {
    const p = products.find(x => String(x.id) === String(id));
    const d = edits.get(String(id));
    if (!p || !d) return true;
    const problem = validate(p, d);
    if (problem) { showToast(`${p.name}: ${problem}`, true); return false; }
    const payload = { ...d };
    await api(`/products/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(payload) });
    Object.assign(p, d);
    if (d.category !== undefined) {
      p.categories = getProductCategories({ category: d.category });
      p.category = p.categories.join(', ');
    }
    // The server re-derives the price for rate-table types; mirror it.
    if (typeof Cart !== 'undefined') { const base = Cart.typeConfigFor(p.productType).basePrice; if (typeof base === 'number') p.price = base; }
    edits.delete(String(id));
    try { sessionStorage.removeItem('brush_catalog_v2'); } catch (_) {}
    if (window.BrushCatalog?.invalidate) window.BrushCatalog.invalidate();
    return true;
  }

  $('inventory-table-body').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const tr = btn.closest('tr[data-id]');
    const id = tr.dataset.id;
    const p = products.find(x => String(x.id) === id);
    if (btn.dataset.action === 'save') {
      tr.classList.add('is-saving');
      try {
        if (await saveProduct(id)) { showToast(`Saved “${p.name}”.`); renderInventory(); updateDirtyUi(); }
      } catch (ex) { showToast(ex.message, true); }
      tr.classList.remove('is-saving');
    } else if (btn.dataset.action === 'delete') {
      if (!confirm(`Delete “${p.name}” (ID ${id})? This can't be undone.`)) return;
      try {
        await api(`/products/${encodeURIComponent(id)}`, { method: 'DELETE' });
        products = products.filter(x => String(x.id) !== id);
        edits.delete(id);
        showToast(`Deleted “${p.name}”.`);
        fillFilterOptions(); renderInventory(); updateDirtyUi();
      } catch (ex) { showToast(ex.message, true); }
    }
  });

  // Save only what changed, a few requests at a time (the old Save All
  // PATCHed every visible row one by one, changed or not).
  $('save-all-btn').addEventListener('click', async () => {
    const ids = [...edits.keys()];
    if (!ids.length) return;
    const btn = $('save-all-btn');
    btn.disabled = true;
    btn.querySelector('span').textContent = `Saving ${ids.length}…`;
    let ok = 0, failed = 0, firstError = '';
    const queue = ids.slice();
    const worker = async () => {
      while (queue.length) {
        const id = queue.shift();
        try { if (await saveProduct(id)) ok++; else failed++; }
        catch (ex) { failed++; firstError = firstError || ex.message; }
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    renderInventory();
    updateDirtyUi();
    if (failed) showToast(`Saved ${ok}, ${failed} failed${firstError ? ` — ${firstError}` : ''}. Failed rows are still highlighted.`, true);
    else showToast(`Saved ${ok} product${ok === 1 ? '' : 's'}.`);
  });

  $('discard-btn').addEventListener('click', () => {
    if (!confirm(`Discard ${edits.size} unsaved change(s)?`)) return;
    edits.clear();
    renderInventory();
    updateDirtyUi();
  });

  $('inventory-stats').addEventListener('click', (e) => {
    const q = e.target.closest('[data-quick]');
    if (!q) return;
    $('inventory-stock-filter').value = q.dataset.quick;
    invPage = 1;
    renderInventory();
  });

  const rerenderInv = () => { invPage = 1; renderInventory(); };
  $('inventory-search').addEventListener('input', debounce(rerenderInv, 150));
  ['inventory-type-filter', 'inventory-cat-filter', 'inventory-stock-filter', 'inventory-sort'].forEach(id => $(id).addEventListener('change', rerenderInv));
  $('inventory-refresh').addEventListener('click', () => loadInventory(true));

  window.addEventListener('beforeunload', (e) => {
    if (edits.size) { e.preventDefault(); e.returnValue = ''; }
  });

  // ---------- shared pager ----------
  function renderPager(el, page, pages, total, noun) {
    const label = `${total} ${total === 1 ? noun.replace(/s$/, '') : noun}`;
    if (pages <= 1) { el.innerHTML = total ? `<span>${label}</span>` : ''; return; }
    el.innerHTML = `<span>Page ${page} of ${pages} · ${label}</span>
      <div class="pager-buttons">
        <button type="button" class="btn btn-sm" data-page="${page - 1}" ${page === 1 ? 'disabled' : ''}><i class="fa-solid fa-chevron-left" aria-hidden="true"></i> Prev</button>
        <button type="button" class="btn btn-sm" data-page="${page + 1}" ${page === pages ? 'disabled' : ''}>Next <i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button>
      </div>`;
  }
  $('orders-pager').addEventListener('click', (e) => { const b = e.target.closest('[data-page]'); if (b) { ordersPage = Number(b.dataset.page); renderOrders(); $('orders-view').scrollIntoView(); } });
  $('inventory-pager').addEventListener('click', (e) => { const b = e.target.closest('[data-page]'); if (b) { invPage = Number(b.dataset.page); renderInventory(); $('inventory-view').scrollIntoView(); } });

  // =====================================================================
  // ADD PRODUCT
  // =====================================================================
  function fillAddForm() {
    const typeSel = $('new-prod-type');
    if (!typeSel.options.length) {
      typeSel.innerHTML = TYPES.map(t => `<option value="${t.value}">${t.label}</option>`).join('');
      syncNewProductPriceField();
    }
    $('category-options').innerHTML = allCategories().map(c => `<option value="${escapeHtml(c)}">`).join('');
    const bulkType = $('bulk-type');
    if (!bulkType.options.length) {
      bulkType.innerHTML = TYPES.map(t => `<option value="${t.value}">${t.label}</option>`).join('');
      syncBulkPrice();
    }
    // Duplicate warnings need the catalogue.
    if (!products) loadInventory(false, true);
  }

  function syncNewProductPriceField() {
    const type = $('new-prod-type').value;
    const priceEl = $('new-prod-price');
    const note = $('new-prod-price-note');
    const cfg = typeof Cart !== 'undefined' ? Cart.typeConfigFor(type) : null;
    if (cfg && typeof cfg.basePrice === 'number') {
      priceEl.value = cfg.basePrice;
      priceEl.disabled = true;
      note.textContent = `${cfg.label}s are priced from the rate table (from ₹${cfg.basePrice}; sizes and variants are priced automatically) — see Pricing.`;
    } else {
      if (priceEl.disabled) priceEl.value = '';
      priceEl.disabled = false;
      note.textContent = '';
    }
  }
  $('new-prod-type').addEventListener('change', syncNewProductPriceField);
  $('new-prod-cat').addEventListener('change', (e) => {
    if (e.target.value.trim().toLowerCase() === 'apparel') { $('new-prod-type').value = 'apparel'; syncNewProductPriceField(); }
  });

  // pdf.js is ~300 KB — only fetched when someone actually picks a PDF.
  let pdfjsReady = null;
  function loadPdfJs() {
    if (!pdfjsReady) {
      pdfjsReady = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js';
        s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js'; resolve(window.pdfjsLib); };
        s.onerror = () => { pdfjsReady = null; reject(new Error("Couldn't load the PDF reader")); };
        document.head.appendChild(s);
      });
    }
    return pdfjsReady;
  }

  async function pdfToJpeg(file) {
    const pdfjsLib = await loadPdfJs();
    const pdf = await pdfjsLib.getDocument(await file.arrayBuffer()).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.9));
    return new File([blob], file.name.replace(/\.pdf$/i, '.jpg'), { type: 'image/jpeg' });
  }

  $('new-prod-image').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    const img = $('new-prod-preview');
    if (!file) { img.hidden = true; return; }
    if (file.size > 20 * 1024 * 1024) { showToast('That file is over 20 MB — please pick a smaller one.', true); e.target.value = ''; img.hidden = true; return; }
    try {
      const shown = file.type === 'application/pdf' ? await pdfToJpeg(file) : file;
      img.src = URL.createObjectURL(shown);
      img.hidden = false;
    } catch (ex) { img.hidden = true; }
  });

  $('add-product-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!adminToken) return;
    const btn = $('add-prod-btn');
    const label = btn.innerHTML;
    btn.disabled = true;
    try {
      let file = $('new-prod-image').files[0];
      if (file && file.type === 'application/pdf') {
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Converting PDF…';
        file = await pdfToJpeg(file);
      }
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Uploading…';
      const price = $('new-prod-price').value;
      const fd = new FormData();
      fd.append('name', $('new-prod-name').value.trim());
      fd.append('category', $('new-prod-cat').value.trim());
      fd.append('productType', $('new-prod-type').value);
      fd.append('price', price);
      fd.append('originalPrice', $('new-prod-original-price').value || price);
      fd.append('badge', $('new-prod-badge').value.trim());
      fd.append('stockQuantity', $('new-prod-stock').value);
      fd.append('description', $('new-prod-desc').value.trim());
      fd.append('keywords', $('new-prod-keywords').value.trim());
      fd.append('sku', $('new-prod-sku').value.trim());
      fd.append('image', file);
      const data = await api('/products', { method: 'POST', body: fd });
      showToast(`Added “${data.product ? data.product.name : 'product'}”.`);
      $('add-product-form').reset();
      $('new-prod-preview').hidden = true;
      syncNewProductPriceField();
      if (products && data.product) { products.push(data.product); fillFilterOptions(); }
    } catch (ex) {
      showToast(ex.message, true);
    } finally {
      btn.disabled = false;
      btn.innerHTML = label;
    }
  });

  // =====================================================================
  // ADD MULTIPLE PRODUCTS
  // Shared details are entered once; every image becomes a row that can be
  // edited before upload. Each row is its own POST /products (the same call
  // the single form makes), a few at a time, so one bad file never sinks
  // the batch and failed rows can simply be retried.
  // =====================================================================
  const BULK_MAX = 50;
  const BULK_CONCURRENCY = 3;
  let bulkRows = [];      // { key, file, previewUrl, name, category, price, stock, status, error, productId }
  let bulkKey = 0;
  let bulkRunning = false;
  let bulkStop = false;

  document.querySelectorAll('[data-add-mode]').forEach(btn => btn.addEventListener('click', () => {
    const bulk = btn.dataset.addMode === 'bulk';
    document.querySelectorAll('[data-add-mode]').forEach(b => {
      b.classList.toggle('active', b === btn);
      b.setAttribute('aria-selected', String(b === btn));
    });
    $('add-single-panel').hidden = bulk;
    $('add-bulk-panel').hidden = !bulk;
  }));

  const bulkPriceLocked = () => {
    const cfg = typeof Cart !== 'undefined' ? Cart.typeConfigFor($('bulk-type').value) : null;
    return cfg && typeof cfg.basePrice === 'number' ? cfg : null;
  };

  function syncBulkPrice() {
    const cfg = bulkPriceLocked();
    const price = $('bulk-price');
    if (cfg) {
      price.value = cfg.basePrice;
      price.disabled = true;
      $('bulk-price-note').textContent = `${cfg.label}s are priced from the rate table (from ₹${cfg.basePrice}) — the price column is locked.`;
    } else {
      if (price.disabled) price.value = '';
      price.disabled = false;
      $('bulk-price-note').textContent = '';
    }
    renderBulkRows();
  }
  $('bulk-type').addEventListener('change', syncBulkPrice);

  // Shared fields fill every row that hasn't been edited by hand.
  ['bulk-cat', 'bulk-price', 'bulk-stock'].forEach(id => $(id).addEventListener('input', () => {
    const field = { 'bulk-cat': 'category', 'bulk-price': 'price', 'bulk-stock': 'stock' }[id];
    bulkRows.forEach(r => { if (!r.touched[field] && r.status !== 'done') r[field] = $(id).value.trim(); });
    renderBulkRows();
  }));
  $('bulk-cat').addEventListener('change', (e) => {
    if (e.target.value.trim().toLowerCase() === 'apparel') { $('bulk-type').value = 'apparel'; syncBulkPrice(); }
  });

  // "Waifu_2_Dark_Blue_A3_Portrait.jpg" → "Waifu 2 Dark Blue"
  function nameFromFile(filename) {
    let n = filename.replace(/\.[^.]+$/, '').replace(/[_]+|-{1,}/g, ' ').replace(/\s+/g, ' ').trim();
    n = n.replace(/\b(A[1-5]|portrait|landscape|poster|final|copy|print)\b/gi, '').replace(/\(\d+\)/g, '').replace(/\s+/g, ' ').trim();
    if (n && n === n.toLowerCase()) n = n.replace(/\b\w/g, c => c.toUpperCase());
    return n || filename.replace(/\.[^.]+$/, '');
  }

  const normName = (n) => String(n || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  function isDuplicateName(row) {
    const n = normName(row.name);
    if (!n) return false;
    const inCatalogue = (products || []).some(p => normName(p.name) === n);
    const inBatch = bulkRows.some(r => r !== row && normName(r.name) === n);
    return inCatalogue || inBatch;
  }

  function addBulkFiles(fileList) {
    const files = [...fileList];
    const room = BULK_MAX - bulkRows.filter(r => r.status !== 'done').length;
    let skipped = 0;
    files.slice(0, Math.max(0, room)).forEach(file => {
      const okType = ['image/png', 'image/jpeg', 'application/pdf'].includes(file.type);
      if (!okType || file.size > 20 * 1024 * 1024) { skipped++; return; }
      bulkRows.push({
        key: ++bulkKey,
        file,
        previewUrl: file.type === 'application/pdf' ? '' : URL.createObjectURL(file),
        name: nameFromFile(file.name),
        category: $('bulk-cat').value.trim(),
        price: $('bulk-price').value.trim(),
        stock: $('bulk-stock').value.trim(),
        touched: {},
        status: 'ready',
        error: '',
      });
    });
    if (!bulkRunning) $('bulk-progress').hidden = true;
    const over = Math.max(0, files.length - Math.max(0, room));
    if (over) showToast(`Only ${BULK_MAX} products per batch — ${over} file(s) weren't added. Upload these first, then add the rest.`, true);
    if (skipped) showToast(`${skipped} file(s) skipped — only PNG, JPG or PDF up to 20 MB.`, true);
    renderBulkRows();
    // PDFs get a real thumbnail once converted (in the background).
    bulkRows.filter(r => r.file.type === 'application/pdf' && !r.previewUrl && !r.converting).forEach(async r => {
      r.converting = true;
      try { r.converted = await pdfToJpeg(r.file); r.previewUrl = URL.createObjectURL(r.converted); renderBulkRows(); }
      catch (e) { r.previewUrl = ''; }
    });
  }

  $('bulk-files').addEventListener('change', (e) => { addBulkFiles(e.target.files); e.target.value = ''; });
  const drop = $('bulk-drop');
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('is-over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, () => drop.classList.remove('is-over')));
  drop.addEventListener('drop', (e) => { e.preventDefault(); if (e.dataTransfer && e.dataTransfer.files.length) addBulkFiles(e.dataTransfer.files); });

  function statusHtml(r) {
    if (r.status === 'uploading') return '<span class="bulk-status"><i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Uploading…</span>';
    if (r.status === 'done') return `<span class="bulk-status ok"><i class="fa-solid fa-circle-check" aria-hidden="true"></i> Added · ID ${escapeHtml(r.productId)}</span>`;
    if (r.status === 'failed') return `<span class="bulk-status err">${escapeHtml(r.error)}</span>`;
    const missing = rowProblem(r);
    return missing ? `<span class="bulk-status warn">${escapeHtml(missing)}</span>` : '<span class="bulk-status">Ready</span>';
  }

  function rowProblem(r) {
    if (!r.name.trim()) return 'Needs a name';
    if (!r.category.trim()) return 'Needs a category';
    if (!bulkPriceLocked() && !(Number(r.price) > 0)) return 'Needs a price';
    if (!(Number.isInteger(Number(r.stock)) && Number(r.stock) >= 0) || r.stock === '') return 'Needs a stock number';
    return '';
  }

  function renderBulkRows() {
    const review = $('bulk-review');
    review.hidden = !bulkRows.length;
    if (!bulkRows.length) { $('bulk-rows').innerHTML = ''; $('bulk-progress').hidden = true; return; }
    const locked = bulkPriceLocked();
    const pending = bulkRows.filter(r => r.status !== 'done');
    const done = bulkRows.length - pending.length;
    $('bulk-count').textContent = `${bulkRows.length} product${bulkRows.length === 1 ? '' : 's'}${done ? ` · ${done} added` : ''}`;
    $('bulk-clear-done').hidden = !done || bulkRunning;
    $('bulk-rows').innerHTML = bulkRows.map(r => {
      const fixed = r.status === 'done' || r.status === 'uploading' || bulkRunning;
      const dis = fixed ? 'disabled' : '';
      return `
      <tr data-key="${r.key}" class="${r.status === 'done' ? 'is-done' : r.status === 'failed' ? 'is-failed' : r.status === 'uploading' ? 'is-busy' : ''}">
        <td>${r.previewUrl ? `<img src="${r.previewUrl}" alt="" class="prod-thumb">` : '<span class="prod-thumb" style="display:grid;place-items:center"><i class="fa-solid fa-file-pdf" aria-hidden="true"></i></span>'}</td>
        <td>
          <input type="text" class="field field-sm" data-bulk="name" value="${escapeHtml(r.name)}" maxlength="140" ${dis} aria-label="Name">
          ${r.status !== 'done' && isDuplicateName(r) ? '<span class="dup-flag"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> A product with this name already exists</span>' : ''}
        </td>
        <td><input type="text" class="field field-sm" data-bulk="category" list="category-options" value="${escapeHtml(r.category)}" ${dis} aria-label="Category"></td>
        <td>${locked ? `<span class="locked-price">₹${locked.basePrice}</span>` : `<input type="number" min="1" step="1" class="field field-sm w-sm" data-bulk="price" value="${escapeHtml(r.price)}" ${dis} aria-label="Price">`}</td>
        <td><input type="number" min="0" step="1" class="field field-sm w-sm" data-bulk="stock" value="${escapeHtml(r.stock)}" ${dis} aria-label="Stock"></td>
        <td>${statusHtml(r)}</td>
        <td>${r.status === 'failed' && !bulkRunning ? '<button type="button" class="btn btn-sm" data-bulk-action="retry">Retry</button>' : ''}
            ${r.status !== 'done' && r.status !== 'uploading' && !bulkRunning ? '<button type="button" class="btn btn-sm btn-icon" data-bulk-action="remove" title="Remove" aria-label="Remove row"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>' : ''}</td>
      </tr>`;
    }).join('');
    const ready = pending.filter(r => !rowProblem(r)).length;
    const btn = $('bulk-upload');
    btn.disabled = bulkRunning || !ready || ready < pending.length;
    btn.querySelector('span').textContent = bulkRunning ? 'Uploading…'
      : !pending.length ? 'All added'
      : ready < pending.length ? `Fix ${pending.length - ready} row${pending.length - ready === 1 ? '' : 's'} to upload`
      : `Upload ${pending.length} product${pending.length === 1 ? '' : 's'}`;
    $('bulk-stop').hidden = !bulkRunning;
  }

  // Typing in a row updates that row only — no full re-render, so focus
  // and cursor position stay put.
  $('bulk-rows').addEventListener('input', (e) => {
    const f = e.target.dataset.bulk;
    if (!f) return;
    const r = bulkRows.find(x => String(x.key) === e.target.closest('tr').dataset.key);
    r[f] = e.target.value;
    r.touched[f] = true;
    if (r.status === 'failed') r.status = 'ready';
    const tr = e.target.closest('tr');
    tr.children[5].innerHTML = statusHtml(r);
    const flag = tr.querySelector('.dup-flag');
    if (f === 'name') {
      const dup = isDuplicateName(r);
      if (dup && !flag) e.target.insertAdjacentHTML('afterend', '<span class="dup-flag"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> A product with this name already exists</span>');
      if (!dup && flag) flag.remove();
    }
    const pending = bulkRows.filter(x => x.status !== 'done');
    const ready = pending.filter(x => !rowProblem(x)).length;
    const btn = $('bulk-upload');
    btn.disabled = !ready || ready < pending.length;
    btn.querySelector('span').textContent = ready < pending.length ? `Fix ${pending.length - ready} row${pending.length - ready === 1 ? '' : 's'} to upload` : `Upload ${pending.length} product${pending.length === 1 ? '' : 's'}`;
  });

  $('bulk-rows').addEventListener('click', (e) => {
    const b = e.target.closest('[data-bulk-action]');
    if (!b) return;
    const key = b.closest('tr').dataset.key;
    const r = bulkRows.find(x => String(x.key) === key);
    if (b.dataset.bulkAction === 'remove') {
      if (r.previewUrl) URL.revokeObjectURL(r.previewUrl);
      bulkRows = bulkRows.filter(x => x !== r);
      renderBulkRows();
    } else if (b.dataset.bulkAction === 'retry') {
      r.status = 'ready';
      runBulkUpload([r]);
    }
  });

  $('bulk-clear-done').addEventListener('click', () => {
    bulkRows.filter(r => r.status === 'done').forEach(r => r.previewUrl && URL.revokeObjectURL(r.previewUrl));
    bulkRows = bulkRows.filter(r => r.status !== 'done');
    renderBulkRows();
  });
  $('bulk-clear-all').addEventListener('click', () => {
    const pending = bulkRows.filter(r => r.status !== 'done').length;
    if (pending && !confirm(`Remove all ${bulkRows.length} rows? ${pending} haven't been uploaded yet.`)) return;
    bulkRows.forEach(r => r.previewUrl && URL.revokeObjectURL(r.previewUrl));
    bulkRows = [];
    renderBulkRows();
  });
  $('bulk-stop').addEventListener('click', () => { bulkStop = true; $('bulk-stop').disabled = true; $('bulk-stop').textContent = 'Stopping…'; });

  async function uploadBulkRow(r) {
    r.status = 'uploading';
    renderBulkRows();
    try {
      let file = r.file;
      if (file.type === 'application/pdf') file = r.converted || (r.converted = await pdfToJpeg(file));
      const locked = bulkPriceLocked();
      const price = locked ? String(locked.basePrice) : String(r.price).trim();
      const original = $('bulk-original-price').value.trim();
      const keywords = [r.name.trim(), $('bulk-keywords').value.trim()].filter(Boolean).join(', ');
      const fd = new FormData();
      fd.append('name', r.name.trim());
      fd.append('category', r.category.trim());
      fd.append('productType', $('bulk-type').value);
      fd.append('price', price);
      fd.append('originalPrice', original && Number(original) > Number(price) ? original : price);
      fd.append('badge', $('bulk-badge').value.trim());
      fd.append('stockQuantity', String(r.stock).trim());
      fd.append('description', '');
      fd.append('keywords', keywords);
      fd.append('sku', '');
      fd.append('image', file, file.name);
      const data = await api('/products', { method: 'POST', body: fd });
      r.status = 'done';
      r.productId = data.product ? data.product.id : '';
      if (products && data.product) products.push(data.product);
    } catch (ex) {
      r.status = 'failed';
      r.error = ex.message === 'Failed to fetch' ? "Couldn't reach the server" : ex.message;
    }
  }

  async function runBulkUpload(rows) {
    if (bulkRunning || !rows.length) return;
    bulkRunning = true;
    bulkStop = false;
    const total = rows.length;
    let finished = 0;
    const progress = () => {
      $('bulk-progress').hidden = false;
      $('bulk-progress-fill').style.width = `${Math.round((finished / total) * 100)}%`;
      $('bulk-progress-text').textContent = `${finished} of ${total} done`;
    };
    progress();
    renderBulkRows();
    const queue = rows.slice();
    const worker = async () => {
      while (queue.length && !bulkStop) {
        const r = queue.shift();
        await uploadBulkRow(r);
        finished++;
        progress();
        renderBulkRows();
      }
    };
    await Promise.all(Array.from({ length: Math.min(BULK_CONCURRENCY, rows.length) }, worker));
    bulkRunning = false;
    $('bulk-stop').disabled = false;
    $('bulk-stop').textContent = 'Stop after current';
    const ok = rows.filter(r => r.status === 'done').length;
    const failed = rows.filter(r => r.status === 'failed').length;
    if (products) { fillFilterOptions(); renderInventory(); }
    renderBulkRows();
    if (failed) showToast(`Added ${ok} of ${total}. ${failed} failed — fix or retry the highlighted rows.`, true);
    else if (bulkStop && ok < total) showToast(`Stopped — ${ok} of ${total} added. The rest are still in the list.`);
    else showToast(`Added ${ok} product${ok === 1 ? '' : 's'}. They're live in the store (new items can take up to a minute to appear).`);
  }

  $('bulk-upload').addEventListener('click', () => {
    const pending = bulkRows.filter(r => r.status === 'ready' || r.status === 'failed');
    if (pending.some(rowProblem)) { showToast('Some rows are missing details — see the Status column.', true); return; }
    const dups = pending.filter(isDuplicateName).length;
    if (dups && !confirm(`${dups} product name(s) already exist in the catalogue or appear twice in this batch. Upload anyway?`)) return;
    pending.forEach(r => { r.status = 'ready'; });
    runBulkUpload(pending);
  });

  window.addEventListener('beforeunload', (e) => {
    if (bulkRunning || bulkRows.some(r => r.status === 'ready' || r.status === 'failed')) { e.preventDefault(); e.returnValue = ''; }
  });

  // =====================================================================
  // MANUAL ORDERS
  // =====================================================================
  let manualLines = [];
  let manualOrderReady = false;

  function manualProductFromSearch() {
    const raw = $('manual-product-search').value.trim();
    if (!raw || !products) return null;
    const lower = raw.toLowerCase();
    const normalized = raw.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    return products.find(p => String(p.id) === raw || String(p.sku || '').toLowerCase() === lower || String(p.name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() === normalized) || null;
  }

  function renderManualProductOptions() {
    if (!products) return;
    $('manual-product-options').innerHTML = products.map(p => `<option value="${escapeHtml(p.sku || p.id)}">${escapeHtml(p.name)} · ID ${escapeHtml(p.id)}</option>`).join('');
  }

  function renderManualVariants() {
    const product = manualProductFromSearch();
    const box = $('manual-variant-fields');
    if (!product || typeof Cart === 'undefined') { box.innerHTML = ''; return; }
    const cfg = Cart.typeConfigFor(product.productType);
    box.innerHTML = (cfg.variantGroups || []).map(group => `<label>${escapeHtml(group.label)}<select class="field" data-manual-variant="${escapeHtml(group.key)}">${group.options.filter(o => o.available !== false).map(option => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`).join('')}</select></label>`).join('');
  }

  function renderManualLines() {
    $('manual-lines-body').innerHTML = manualLines.length ? manualLines.map((line, index) => `<tr><td><strong>${escapeHtml(line.product.name)}</strong><div class="muted small">${escapeHtml(line.product.sku || 'ID ' + line.product.id)}</div></td><td class="muted small">${escapeHtml(Object.values(line.variants || {}).join(' · ') || 'Default')}</td><td>${line.quantity}</td><td>${inr(line.unitPrice)}</td><td>${inr(line.unitPrice * line.quantity)}</td><td><button type="button" class="btn btn-sm btn-danger" data-manual-remove="${index}" aria-label="Remove product"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button></td></tr>`).join('') : '<tr><td colspan="6" class="empty">No products added.</td></tr>';
  }

  function renderManualBreakdown() {
    const discount = Math.max(0, Number($('manual-flat-discount').value) || 0);
    const subtotal = manualLines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
    if (!subtotal) { $('manual-order-breakdown').textContent = 'Add a product to see the server-calculated total.'; return; }
    const launch = subtotal >= 399 ? 50 : 0;
    const effective = Math.min(discount, Math.max(0, subtotal - launch));
    $('manual-order-breakdown').innerHTML = `<p>Estimated subtotal (Inc. Tax) <strong>${inr(subtotal)}</strong></p><p>Launch offer <strong>-${inr(launch)}</strong></p><p>Flat discount <strong>-${inr(effective)}</strong></p><p class="manual-total-note">All poster prices are inclusive of taxes. Delivery and handling fees are confirmed by the server when you create the order.</p>`;
  }

  function initManualOrder() {
    if (!isSuper()) return;
    renderManualProductOptions();
    renderManualVariants();
    renderManualLines();
    renderManualBreakdown();
  }

  $('manual-product-search').addEventListener('input', renderManualVariants);
  $('manual-product-search').addEventListener('change', renderManualVariants);
  $('manual-flat-discount').addEventListener('input', renderManualBreakdown);
  $('manual-lines-body').addEventListener('click', (e) => {
    const button = e.target.closest('[data-manual-remove]');
    if (!button) return;
    manualLines.splice(Number(button.dataset.manualRemove), 1);
    renderManualLines(); renderManualBreakdown();
  });
  $('manual-add-item').addEventListener('click', () => {
    const product = manualProductFromSearch();
    const quantity = Number($('manual-product-quantity').value);
    if (!product) return showToast('Choose a product by ID, SKU, or exact name.', true);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) return showToast('Quantity must be a whole number from 1 to 100.', true);
    const variants = {};
    document.querySelectorAll('[data-manual-variant]').forEach(select => { variants[select.dataset.manualVariant] = select.value; });
    const priced = Cart.priceFor(product, variants);
    manualLines.push({ product, quantity, variants: priced.variants, unitPrice: priced.price });
    $('manual-product-search').value = '';
    $('manual-product-quantity').value = '1';
    $('manual-variant-fields').innerHTML = '';
    renderManualLines(); renderManualBreakdown();
  });

  $('manual-order-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!isSuper()) return;
    if (!manualLines.length) return showToast('Add at least one product.', true);
    const status = $('manual-status').value;
    const paymentMethod = $('manual-payment-method').value;
    const paymentReference = $('manual-payment-reference').value.trim();
    if (status === 'confirmed' && paymentMethod !== 'cod' && paymentMethod !== 'complimentary' && !paymentReference) return showToast('Add a payment reference before confirming.', true);
    if (!confirm('Create this order and deduct the requested stock?')) return;
    const button = $('manual-create-btn');
    button.disabled = true;
    try {
      const data = await api('/admin/orders', { method: 'POST', body: JSON.stringify({
        customer: {
          name: $('manual-customer-name').value.trim(), email: $('manual-customer-email').value.trim(), phone: $('manual-customer-phone').value.trim(),
          address: $('manual-customer-address').value.trim(), city: $('manual-customer-city').value.trim(), state: $('manual-customer-state').value.trim(), pincode: $('manual-customer-pincode').value.trim()
        },
        items: manualLines.map(line => ({ productId: line.product.id, quantity: line.quantity, variants: line.variants })),
        flatDiscount: Number($('manual-flat-discount').value) || 0,
        paymentMethod, status, paymentReference,
        internalNotes: $('manual-internal-notes').value.trim(), sendEmail: $('manual-send-email').checked
      }) });
      showToast(`Created ${data.order.orderId} for ${inr(data.order.total)}.`);
      $('manual-order-form').reset();
      manualLines = [];
      renderManualLines(); renderManualBreakdown();
      loadOrders(true); loadInventory(true, true);
    } catch (error) {
      showToast(error.message, true);
    } finally { button.disabled = false; }
  });

  // =====================================================================
  // ACTIVITY LOG
  // =====================================================================
  let logs = null;
  async function loadLogs() {
    if (!adminToken || !isSuper()) return;
    const tbody = $('logs-table-body');
    try {
      logs = await api('/admin/logs');
      renderLogs();
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="5" class="empty error">Couldn't load the log — ${escapeHtml(e.message)}</td></tr>`;
    }
  }
  function renderLogs() {
    if (!logs) return;
    const q = $('logs-search').value.trim().toLowerCase();
    const list = logs.filter(l => !q || `${l.username} ${l.action} ${l.details}`.toLowerCase().includes(q));
    $('logs-table-body').innerHTML = list.length ? list.map(l => `
      <tr data-log="${escapeHtml(l.id)}">
        <td class="nowrap" title="${escapeHtml(new Date(l.timestamp).toLocaleString('en-IN'))}">${relTime(l.timestamp)}</td>
        <td><strong>${escapeHtml(l.username)}</strong></td>
        <td><span class="status-badge status-packed">${escapeHtml(l.action)}</span></td>
        <td class="muted">${escapeHtml(l.details)}</td>
        <td><button type="button" class="btn btn-sm btn-icon" data-keep="${l.keep ? '0' : '1'}" aria-pressed="${!!l.keep}" title="${l.keep ? 'Kept — click to let it expire' : 'Keep beyond 72 hours'}" aria-label="Keep entry"><i class="fa-${l.keep ? 'solid' : 'regular'} fa-star" aria-hidden="true" style="${l.keep ? 'color:var(--accent)' : ''}"></i></button></td>
      </tr>`).join('') : '<tr><td colspan="5" class="empty">No log entries.</td></tr>';
  }
  $('logs-table-body').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-keep]');
    if (!b) return;
    const id = b.closest('tr').dataset.log;
    try {
      await api(`/admin/logs/${encodeURIComponent(id)}/keep`, { method: 'PATCH', body: JSON.stringify({ keep: b.dataset.keep === '1' }) });
      const l = logs.find(x => x.id === id);
      if (l) l.keep = b.dataset.keep === '1';
      renderLogs();
    } catch (ex) { showToast(ex.message, true); }
  });
  $('logs-search').addEventListener('input', debounce(renderLogs, 150));
  $('logs-refresh').addEventListener('click', loadLogs);
  $('pricing-refresh').addEventListener('click', loadPricing);

  // =====================================================================
  // TRACKING PORTAL
  // =====================================================================
  let trackingData = null;
  let trackingFilter = 'all';

  async function loadTrackingPortal() {
    if (!adminToken) return;
    const tbody = $('tracking-table-body');
    tbody.innerHTML = '<tr><td colspan="6" class="empty"><span class="skeleton"></span></td></tr>';
    try {
      trackingData = await api('/admin/tracking-portal');
      renderTrackingPortal();
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="6" class="empty error">Failed to load tracking portal — ${escapeHtml(e.message)}</td></tr>`;
    }
  }

  function renderTrackingPortal() {
    if (!trackingData) return;
    const { shipments, stats } = trackingData;

    // Render Stats
    $('tracking-stats').innerHTML = `
      <div class="stat-card">
        <div class="stat-val">${stats.total}</div>
        <div class="stat-lbl">Active Shipments</div>
      </div>
      <div class="stat-card">
        <div class="stat-val" style="color: #e07700;">${stats.inTransit}</div>
        <div class="stat-lbl">In Transit</div>
      </div>
      <div class="stat-card">
        <div class="stat-val" style="color: var(--accent);">${stats.awaitingAwb}</div>
        <div class="stat-lbl">Awaiting AWB</div>
      </div>
      <div class="stat-card">
        <div class="stat-val" style="color: #2f6b46;">${stats.delivered}</div>
        <div class="stat-lbl">Delivered</div>
      </div>
    `;

    // Render Filter Chips
    const filters = [
      { id: 'all', label: `All (${shipments.length})` },
      { id: 'with-awb', label: `With AWB (${stats.withAwb})` },
      { id: 'awaiting-awb', label: `Awaiting AWB (${stats.awaitingAwb})` },
      { id: 'transit', label: `In Transit (${stats.inTransit})` },
      { id: 'delivered', label: `Delivered (${stats.delivered})` }
    ];

    $('tracking-filter-chips').innerHTML = filters.map(f => `
      <button type="button" class="chip ${trackingFilter === f.id ? 'active' : ''}" data-track-filter="${f.id}">${escapeHtml(f.label)}</button>
    `).join('');

    // Filter & Search list
    const q = ($('tracking-search').value || '').trim().toLowerCase();
    const filtered = shipments.filter(s => {
      if (trackingFilter === 'with-awb' && !s.awbNumber) return false;
      if (trackingFilter === 'awaiting-awb' && s.awbNumber) return false;
      if (trackingFilter === 'transit' && s.status !== 'transit' && s.status !== 'shipped') return false;
      if (trackingFilter === 'delivered' && s.status !== 'delivered') return false;

      if (!q) return true;
      const haystack = `${s.orderId} ${s.awbNumber} ${s.courierPartner} ${s.customer.name} ${s.customer.city} ${s.status}`.toLowerCase();
      return haystack.includes(q);
    });

    $('tracking-table-body').innerHTML = filtered.length ? filtered.map(s => `
      <tr data-order="${escapeHtml(s.orderId)}">
        <td>
          <strong class="mono">${escapeHtml(s.orderId)}</strong>
          <div class="muted small">${s.itemCount} item${s.itemCount === 1 ? '' : 's'} · ${inr(s.total)}</div>
        </td>
        <td>
          <strong>${escapeHtml(s.customer.name)}</strong>
          <div class="muted small">${escapeHtml(s.customer.city)}${s.customer.state ? ', ' + escapeHtml(s.customer.state) : ''}</div>
        </td>
        <td>
          ${s.awbNumber ? `
            <div><strong>${escapeHtml(s.courierPartner || 'DTDC')}</strong></div>
            <div style="font-family: monospace; font-size: 0.85rem; color: var(--text-primary); display: flex; align-items: center; gap: 4px;">
              ${escapeHtml(s.awbNumber)}
              <button type="button" class="btn btn-sm btn-icon" data-action="copy-portal-awb" data-awb="${escapeHtml(s.awbNumber)}" title="Copy AWB">
                <i class="fa-solid fa-copy"></i>
              </button>
            </div>
          ` : `<span class="muted small" style="color: var(--accent);"><i class="fa-solid fa-clock"></i> No AWB Assigned</span>`}
        </td>
        <td>
          <span class="status-badge status-${escapeHtml(s.status)}">${escapeHtml(STATUS_LABELS[s.status] || s.status)}</span>
        </td>
        <td class="nowrap">
          ${s.estimatedDelivery ? escapeHtml(new Date(s.estimatedDelivery).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })) : '—'}
        </td>
        <td>
          <div style="display: flex; gap: 6px; flex-wrap: wrap;">
            ${s.awbNumber ? `
              <a href="${s.brushTrackingUrl}" target="_blank" class="btn btn-sm btn-secondary" style="text-decoration: none;">
                <i class="fa-solid fa-arrow-up-right-from-square"></i> Live Track
              </a>
              <button type="button" class="btn btn-sm btn-outline" data-action="inspect-live-telemetry" data-awb="${escapeHtml(s.awbNumber)}" title="Inspect real-time carrier scans">
                <i class="fa-solid fa-satellite-dish"></i> Telemetry
              </button>
              <button type="button" class="btn btn-sm btn-ghost" data-action="copy-portal-link" data-url="${window.location.origin}${s.brushTrackingUrl}" title="Copy Customer Link">
                <i class="fa-solid fa-link"></i> Link
              </button>
            ` : `
              <button type="button" class="btn btn-sm btn-primary" data-action="open-order-tracking" data-order="${escapeHtml(s.orderId)}">
                Assign AWB
              </button>
            `}
            ${s.trackingUrl ? `
              <a href="${escapeHtml(s.trackingUrl)}" target="_blank" class="btn btn-sm btn-ghost" title="Open partner link">
                <i class="fa-solid fa-external-link"></i> Partner
              </a>
            ` : ''}
          </div>
        </td>
      </tr>
    `).join('') : '<tr><td colspan="6" class="empty">No shipments match filter.</td></tr>';
  }

  // Live Telemetry Inspection form
  function formatDateIST(isoString) {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return isoString;
      return d.toLocaleDateString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
    } catch (_) {
      return isoString;
    }
  }

  function formatDateTimeIST(isoString) {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return isoString;
      const dateStr = d.toLocaleDateString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
      const timeStr = d.toLocaleTimeString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
      return `${dateStr} · ${timeStr} IST`;
    } catch (_) {
      return isoString;
    }
  }

  function renderAdminTrackingTelemetry(data, query) {
    const shipment = data.shipment;
    const order = data.order;

    let statusClass = 'status-in-transit';
    let statusLabel = 'In Transit';
    let stepIndex = 3; // 0: confirmed, 1: printed, 2: dispatched, 3: in transit, 4: delivered

    if (shipment && shipment.status) {
      const statusRaw = String(shipment.status).toLowerCase();
      statusLabel = shipment.status;
      if (statusRaw.includes('delivered')) {
        statusClass = 'status-delivered';
        stepIndex = 4;
      } else if (statusRaw.includes('out for delivery')) {
        statusClass = 'status-in-transit';
        stepIndex = 3;
      } else if (statusRaw.includes('booked') || statusRaw.includes('pickup') || statusRaw.includes('manifest')) {
        statusClass = 'status-booked';
        stepIndex = 2;
      }
    } else if (order && order.status) {
      const oStatus = String(order.status).toLowerCase();
      if (oStatus === 'delivered') {
        statusClass = 'status-delivered';
        statusLabel = 'Delivered';
        stepIndex = 4;
      } else if (oStatus === 'transit' || oStatus === 'in-transit' || oStatus === 'out for delivery') {
        statusClass = 'status-in-transit';
        statusLabel = 'In Transit';
        stepIndex = 3;
      } else if (oStatus === 'shipped' || oStatus === 'dispatched' || oStatus === 'packed') {
        statusClass = 'status-booked';
        statusLabel = 'Dispatched';
        stepIndex = 2;
      } else if (oStatus === 'printing' || oStatus === 'sent-for-printing') {
        statusClass = 'status-booked';
        statusLabel = 'In Printing';
        stepIndex = 1;
      } else if (oStatus === 'cancelled') {
        statusClass = 'status-cancelled';
        statusLabel = 'Order Cancelled';
        stepIndex = -1;
      } else {
        statusClass = 'status-booked';
        statusLabel = 'Order Confirmed';
        stepIndex = 0;
      }
    }

    const events = (shipment && Array.isArray(shipment.events)) ? shipment.events : [];
    const carrierName = (shipment && shipment.carrier)
      ? `${shipment.carrier} Express`
      : (order && order.carrierPartner ? `${order.carrierPartner} Express` : (order && order.carrier ? `${order.carrier} Express` : 'DTDC Express'));
    const awb = (shipment && shipment.awb) || (order && order.awbNumber) || (order ? order.orderId : query);
    const expectedDate = (shipment && shipment.expectedDelivery)
      ? formatDateIST(shipment.expectedDelivery)
      : (order && order.estimatedDelivery ? formatDateIST(order.estimatedDelivery) : 'Expected Shortly');
    const lastUpdated = (shipment && shipment.lastUpdated)
      ? formatDateTimeIST(shipment.lastUpdated)
      : (events[0] ? formatDateTimeIST(events[0].time) : (order && order.createdAt ? formatDateTimeIST(order.createdAt) : 'Recent'));
    const originLocation = (events.length > 0 && events[events.length - 1].location)
      ? events[events.length - 1].location
      : 'Brush Studio Apex (Patna, BR)';
    const destCity = (shipment && shipment.destCity)
      ? `${shipment.destCity}${shipment.destState ? ', ' + shipment.destState : ''}`
      : (order && order.customerCity ? `${order.customerCity}${order.customerState ? ', ' + order.customerState : ''}` : 'Customer Destination');

    const fillPercent = stepIndex >= 0 ? Math.min(100, (stepIndex / 4) * 100) : 0;

    const eventsHtml = events.map((ev, idx) => {
      const isLatest = idx === 0;
      return `
        <div class="event-row ${isLatest ? 'latest' : ''}">
          <div class="event-dot"><i class="fa-solid fa-${isLatest ? 'circle-dot' : 'check'}"></i></div>
          <div class="event-body">
            <div class="event-top-row">
              <span class="event-status">${escapeHtml(ev.status)}${isLatest ? '<span class="latest-badge">Current Status</span>' : ''}</span>
              <span class="event-time">${formatDateTimeIST(ev.time)}</span>
            </div>
            <div class="event-location">
              <i class="fa-solid fa-location-dot"></i>
              <span>${escapeHtml(ev.location || 'In Transit Hub')}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');

    const orderArtworksHtml = (order && Array.isArray(order.items) && order.items.length > 0) ? `
      <div class="track-card">
        <h4 class="timeline-heading"><i class="fa-solid fa-palette"></i> Artworks in this Package</h4>
        <div class="order-items-grid">
          ${order.items.flatMap(item => {
            if (Array.isArray(item.customPosters) && item.customPosters.length > 0) {
              return item.customPosters.map((cp, idx) => `
                <div class="artwork-preview-card">
                  ${cp.image ? `<img src="${escapeHtml(cp.image)}" alt="${escapeHtml(cp.name || cp.title || 'Poster')}" class="artwork-thumb" onerror="this.style.display='none'">` : ''}
                  <div class="artwork-info">
                    <h5>${escapeHtml(cp.name || cp.title || `Poster ${idx+1}`)}</h5>
                    <p><span style="font-weight:600; color:var(--accent);">${escapeHtml(item.name)}</span> &middot; Size: ${escapeHtml(cp.size || 'A5')}</p>
                  </div>
                </div>
              `);
            }
            return `
              <div class="artwork-preview-card">
                ${item.image ? `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" class="artwork-thumb" onerror="this.style.display='none'">` : ''}
                <div class="artwork-info">
                  <h5>${escapeHtml(item.name)}</h5>
                  <p>${escapeHtml(item.size || 'A4')} ${item.frame ? '· ' + escapeHtml(item.frame) : ''} · Qty ${item.quantity || 1}</p>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    ` : '';

    const emptyTimelineMsg = stepIndex === 4
      ? `Parcel successfully delivered to ${escapeHtml(destCity)}. Confirmed in carrier network.`
      : (stepIndex === 3
          ? `Package in transit with ${escapeHtml(carrierName)}. Checkpoint scans update upon regional hub arrival.`
          : (stepIndex === 2
              ? `Package packed and handed over to ${escapeHtml(carrierName)}. Courier barcode manifest recorded.`
              : (stepIndex === 1
                  ? 'Archival museum-grade print is currently being prepared and framed in the studio.'
                  : (stepIndex === 0
                      ? 'Order confirmed and registered in production pipeline.'
                      : 'Order has been cancelled.'))));

    const customerLink = `${window.location.origin}/track/?awb=${encodeURIComponent(awb)}`;
    const phone = order?.customerPhone ? String(order.customerPhone).replace(/[^0-9]/g, '') : '';
    const waUrl = phone ? `https://wa.me/${phone.startsWith('91') ? phone : '91' + phone}?text=${encodeURIComponent(`Hi ${order.customerName || 'there'}, your Brush parcel (${awb}) status: ${statusLabel}. Track live here: ${customerLink}`)}` : '';

    return `
      <div class="track-telemetry-container">
        <!-- Hero Overview Card -->
        <div class="track-hero-card">
          <div class="track-hero-header">
            <div>
              <span class="track-status-pill ${statusClass}">
                <span class="track-badge-pulse"></span>
                ${escapeHtml(statusLabel)}
              </span>
            </div>
            <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
              <span class="carrier-pill">
                <i class="fa-solid fa-truck-fast"></i>
                ${escapeHtml(carrierName)}
              </span>
              <button type="button" class="btn btn-sm btn-ghost" onclick="document.getElementById('tracking-inspect-result').style.display='none'" title="Close telemetry view">
                <i class="fa-solid fa-xmark"></i> Close
              </button>
            </div>
          </div>

          <!-- Route Visualizer -->
          <div class="track-route-box">
            <div class="route-node">
              <span class="route-label">Dispatched From</span>
              <span class="route-city">${escapeHtml(originLocation)}</span>
            </div>
            <div class="route-line-wrap">
              <i class="fa-solid fa-truck-moving route-icon"></i>
              <div class="route-line"></div>
            </div>
            <div class="route-node right">
              <span class="route-label">Destination Address</span>
              <span class="route-city">${escapeHtml(destCity)}</span>
            </div>
          </div>

          <!-- 5-Stage Stepper -->
          <div class="track-stepper">
            <div class="stepper-track-bg"></div>
            <div class="stepper-track-fill" style="width: ${fillPercent}%;"></div>

            <div class="step-node ${stepIndex >= 0 ? (stepIndex === 0 ? 'active' : 'completed') : ''}">
              <div class="step-circle"><i class="fa-solid fa-check"></i></div>
              <span class="step-title">Confirmed</span>
            </div>
            <div class="step-node ${stepIndex >= 1 ? (stepIndex === 1 ? 'active' : 'completed') : ''}">
              <div class="step-circle"><i class="fa-solid fa-print"></i></div>
              <span class="step-title">Printed</span>
            </div>
            <div class="step-node ${stepIndex >= 2 ? (stepIndex === 2 ? 'active' : 'completed') : ''}">
              <div class="step-circle"><i class="fa-solid fa-box-archive"></i></div>
              <span class="step-title">Dispatched</span>
            </div>
            <div class="step-node ${stepIndex >= 3 ? (stepIndex === 3 ? 'active' : 'completed') : ''}">
              <div class="step-circle"><i class="fa-solid fa-truck-fast"></i></div>
              <span class="step-title">In Transit</span>
            </div>
            <div class="step-node ${stepIndex >= 4 ? 'completed' : ''}">
              <div class="step-circle"><i class="fa-solid fa-house-chimney"></i></div>
              <span class="step-title">Delivered</span>
            </div>
          </div>

          <!-- Meta Details -->
          <div class="track-meta-grid">
            <div class="meta-box">
              <span class="meta-label">Waybill / AWB Number</span>
              <span class="meta-val">
                <span style="font-family: monospace;">${escapeHtml(awb)}</span>
                <button type="button" class="meta-copy-btn" onclick="navigator.clipboard.writeText('${escapeHtml(awb)}').then(() => showToast('Copied AWB: ${escapeHtml(awb)}'))" title="Copy AWB">
                  <i class="fa-solid fa-copy"></i>
                </button>
              </span>
            </div>
            <div class="meta-box">
              <span class="meta-label">Estimated Delivery</span>
              <span class="meta-val"><i class="fa-solid fa-calendar-check" style="color: var(--accent);"></i> ${escapeHtml(expectedDate)}</span>
            </div>
            <div class="meta-box">
              <span class="meta-label">Last Checked Scan</span>
              <span class="meta-val"><i class="fa-solid fa-clock-rotate-left" style="color: var(--text-muted);"></i> ${escapeHtml(lastUpdated)}</span>
            </div>
          </div>
        </div>

        <!-- Order Artwork Details (if found) -->
        ${orderArtworksHtml}

        <!-- Chronological Journey Timeline -->
        <div class="track-card">
          <h4 class="timeline-heading"><i class="fa-solid fa-timeline"></i> Transit Checkpoint History</h4>
          ${events.length > 0 ? `<div class="events-list">${eventsHtml}</div>` : `<p class="muted" style="margin: 0; font-size: 0.9rem;"><i class="fa-solid fa-circle-info" style="color: var(--accent); margin-right: 6px;"></i> ${escapeHtml(emptyTimelineMsg)}</p>`}
        </div>

        <!-- Admin Quick Actions Bar -->
        <div class="telemetry-admin-actions">
          <a href="${escapeHtml(customerLink)}" target="_blank" class="btn btn-sm btn-primary">
            <i class="fa-solid fa-arrow-up-right-from-square"></i> Open Customer Tracker
          </a>
          <button type="button" class="btn btn-sm btn-ghost" onclick="navigator.clipboard.writeText('${escapeHtml(customerLink)}').then(() => showToast('Copied customer tracking link!'))">
            <i class="fa-solid fa-link"></i> Copy Tracking Link
          </button>
          ${waUrl ? `
            <a href="${escapeHtml(waUrl)}" target="_blank" class="btn btn-sm btn-secondary" style="background: #25d366; color: #fff; border-color: #25d366;">
              <i class="fa-brands fa-whatsapp"></i> WhatsApp Customer
            </a>
          ` : ''}
          ${order?.customerEmail ? `
            <a href="mailto:${escapeHtml(order.customerEmail)}?subject=${encodeURIComponent(`Brush Order Tracking Update — ${awb}`)}&body=${encodeURIComponent(`Hi ${order.customerName || ''},\n\nYour order shipment status is: ${statusLabel}.\nYou can track it live anytime here:\n${customerLink}\n\nWarm regards,\nBrush Team`)}" class="btn btn-sm btn-ghost">
              <i class="fa-solid fa-envelope"></i> Email Customer
            </a>
          ` : ''}
          ${order?.orderId ? `
            <button type="button" class="btn btn-sm btn-ghost" onclick="openView('orders'); $('orders-search').value='${escapeHtml(order.orderId)}'; renderOrders();">
              <i class="fa-solid fa-receipt"></i> Jump to Order #${escapeHtml(order.orderId)}
            </button>
          ` : ''}
        </div>
      </div>
    `;
  }

  $('tracking-inspect-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const query = $('tracking-inspect-input').value.trim();
    if (!query) return;

    const btn = $('tracking-inspect-btn');
    const resultBox = $('tracking-inspect-result');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Checking...';
    resultBox.style.display = 'block';
    resultBox.innerHTML = '<p class="muted" style="padding: 16px; margin: 0;"><i class="fa-solid fa-satellite-dish fa-spin"></i> Querying carrier logistics hub &amp; order database...</p>';

    try {
      const data = await api(`/track?q=${encodeURIComponent(query)}`);
      if (!data.success) throw new Error(data.error || 'Tracking not found');

      resultBox.innerHTML = renderAdminTrackingTelemetry(data, query);
    } catch (err) {
      resultBox.innerHTML = `
        <div style="padding: 18px; color: var(--sale-red); background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <strong style="font-size: 0.95rem;"><i class="fa-solid fa-triangle-exclamation"></i> Tracking Query Failed</strong>
            <button type="button" class="btn btn-sm btn-ghost" onclick="document.getElementById('tracking-inspect-result').style.display='none'"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <p class="muted small" style="margin: 0 0 10px;">${escapeHtml(err.message)}</p>
          <a href="/track/?awb=${encodeURIComponent(query)}" target="_blank" class="btn btn-sm btn-ghost" style="color: var(--accent);"><i class="fa-solid fa-arrow-up-right-from-square"></i> Try Public Track Page</a>
        </div>
      `;
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-magnifying-glass-location"></i> Inspect Telemetry';
    }
  });

  $('tracking-filter-chips').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-track-filter]');
    if (!chip) return;
    trackingFilter = chip.dataset.trackFilter;
    renderTrackingPortal();
  });

  $('tracking-search').addEventListener('input', debounce(renderTrackingPortal, 150));
  $('tracking-refresh').addEventListener('click', loadTrackingPortal);

  $('tracking-table-body').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;

    if (action === 'copy-portal-awb') {
      const awb = btn.dataset.awb;
      navigator.clipboard.writeText(awb).then(() => showToast(`Copied AWB: ${awb}`));
    } else if (action === 'copy-portal-link') {
      const url = btn.dataset.url;
      navigator.clipboard.writeText(url).then(() => showToast(`Copied tracking link: ${url}`));
    } else if (action === 'inspect-live-telemetry') {
      const awb = btn.dataset.awb;
      $('tracking-inspect-input').value = awb;
      $('tracking-inspect-form').dispatchEvent(new Event('submit'));
      window.scrollTo({ top: $('tracking-inspect-form').offsetTop - 60, behavior: 'smooth' });
    } else if (action === 'open-order-tracking') {
      const orderId = btn.dataset.order;
      openView('orders');
      $('orders-search').value = orderId;
      renderOrders();
    }
  });

  // =====================================================================
  // REACH OUT MESSAGES
  // =====================================================================
  let reachoutMessages = null;
  let reachoutFilter = 'all';

  async function loadReachoutMessages() {
    if (!adminToken) return;
    const container = $('reachout-list');
    container.innerHTML = '<div class="empty"><span class="skeleton"></span></div>';
    try {
      reachoutMessages = await api('/admin/reachout');
      renderReachoutMessages();
    } catch (e) {
      container.innerHTML = `<div class="empty error">Failed to load reach out messages — ${escapeHtml(e.message)}</div>`;
    }
  }

  function renderReachoutMessages() {
    if (!reachoutMessages) return;
    const total = reachoutMessages.length;
    const unread = reachoutMessages.filter(m => m.status === 'unread').length;
    const artists = reachoutMessages.filter(m => m.type === 'artist').length;
    const requests = reachoutMessages.filter(m => m.type === 'poster_request' || m.type === 'request').length;
    const curators = reachoutMessages.filter(m => m.type === 'curator').length;

    // Update Sidebar Badge
    const badge = $('badge-reachout');
    if (badge) {
      badge.textContent = unread > 0 ? String(unread) : '';
      badge.style.display = unread > 0 ? 'inline-block' : 'none';
    }

    // Render Stats
    $('reachout-stats').innerHTML = `
      <div class="stat-card">
        <div class="stat-val">${total}</div>
        <div class="stat-lbl">Total Submissions</div>
      </div>
      <div class="stat-card">
        <div class="stat-val" style="color: var(--accent);">${unread}</div>
        <div class="stat-lbl">Unread</div>
      </div>
      <div class="stat-card">
        <div class="stat-val" style="color: #6366f1;">${artists}</div>
        <div class="stat-lbl">Artists</div>
      </div>
      <div class="stat-card">
        <div class="stat-val" style="color: #0ea5e9;">${requests}</div>
        <div class="stat-lbl">Poster Requests</div>
      </div>
      <div class="stat-card">
        <div class="stat-val" style="color: #10b981;">${curators}</div>
        <div class="stat-lbl">Curators</div>
      </div>
    `;

    // Render Filter Chips
    const filters = [
      { id: 'all', label: `All (${total})` },
      { id: 'unread', label: `Unread (${unread})` },
      { id: 'artist', label: `Artists (${artists})` },
      { id: 'poster_request', label: `Requests (${requests})` },
      { id: 'curator', label: `Curators (${curators})` }
    ];

    $('reachout-filter-chips').innerHTML = filters.map(f => `
      <button type="button" class="chip ${reachoutFilter === f.id ? 'active' : ''}" data-reach-filter="${f.id}">${escapeHtml(f.label)}</button>
    `).join('');

    // Filter & Search
    const q = ($('reachout-search').value || '').trim().toLowerCase();
    const list = reachoutMessages.filter(m => {
      if (reachoutFilter === 'unread' && m.status !== 'unread') return false;
      if (reachoutFilter === 'artist' && m.type !== 'artist') return false;
      if (reachoutFilter === 'poster_request' && m.type !== 'poster_request' && m.type !== 'request') return false;
      if (reachoutFilter === 'curator' && m.type !== 'curator') return false;

      if (!q) return true;
      const haystack = `${m.name} ${m.email} ${m.type} ${JSON.stringify(m.payload || {})}`.toLowerCase();
      return haystack.includes(q);
    });

    const typeBadge = (type) => {
      if (type === 'artist') return `<span class="badge" style="background: rgba(99, 102, 241, 0.15); color: #6366f1;"><i class="fa-solid fa-palette"></i> Artist</span>`;
      if (type === 'poster_request' || type === 'request') return `<span class="badge" style="background: rgba(14, 165, 233, 0.15); color: #0284c7;"><i class="fa-solid fa-lightbulb"></i> Poster Request</span>`;
      if (type === 'curator') return `<span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #059669;"><i class="fa-solid fa-handshake"></i> Curator</span>`;
      return `<span class="badge" style="background: var(--surface-muted); color: var(--text-muted);">Inquiry</span>`;
    };

    $('reachout-list').innerHTML = list.length ? list.map(m => {
      const p = m.payload || {};
      const id = m._id || m.id;
      const isUnread = m.status === 'unread';
      return `
        <div class="card p-3" style="background: var(--bg-card); border: 1px solid ${isUnread ? 'rgba(var(--accent-rgb), 0.5)' : 'var(--border)'}; border-radius: var(--radius-md); padding: 18px 22px; position: relative;">
          ${isUnread ? `<span style="position: absolute; top: 18px; right: 20px; width: 10px; height: 10px; border-radius: 50%; background: var(--accent);"></span>` : ''}
          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 8px; flex-wrap: wrap;">
            <div style="display: flex; align-items: center; gap: 10px;">
              ${typeBadge(m.type)}
              <strong style="font-size: 1.05rem; color: var(--text-primary);">${escapeHtml(m.name)}</strong>
              <a href="mailto:${escapeHtml(m.email)}" style="font-size: 0.85rem; color: var(--accent); text-decoration: none;">&lt;${escapeHtml(m.email)}&gt;</a>
            </div>
            <span class="muted small" title="${escapeHtml(new Date(m.createdAt).toLocaleString('en-IN'))}">${relTime(m.createdAt)}</span>
          </div>

          <div style="font-size: 0.88rem; color: var(--text-secondary); line-height: 1.5; margin-bottom: 12px;">
            ${p.portfolio ? `<p style="margin: 4px 0;"><strong>Portfolio / Work:</strong> <a href="${escapeHtml(p.portfolio)}" target="_blank" rel="noopener" style="color: var(--accent); text-decoration: underline;">${escapeHtml(p.portfolio)}</a></p>` : ''}
            ${p.style ? `<p style="margin: 4px 0;"><strong>Art Style:</strong> ${escapeHtml(p.style)}</p>` : ''}
            ${p.theme ? `<p style="margin: 4px 0;"><strong>Theme / Concept:</strong> <strong>${escapeHtml(p.theme)}</strong></p>` : ''}
            ${p.details ? `<p style="margin: 4px 0;"><strong>Details &amp; Suggestions:</strong> ${escapeHtml(p.details)}</p>` : ''}
            ${p.platform ? `<p style="margin: 4px 0;"><strong>Platform / Socials:</strong> <a href="${escapeHtml(p.platform)}" target="_blank" rel="noopener" style="color: var(--accent); text-decoration: underline;">${escapeHtml(p.platform)}</a></p>` : ''}
            ${p.collab ? `<p style="margin: 4px 0;"><strong>Collaboration Pitch:</strong> ${escapeHtml(p.collab)}</p>` : ''}
          </div>

          <div style="display: flex; gap: 8px; align-items: center; border-top: 1px solid var(--border); padding-top: 10px;">
            <button type="button" class="btn btn-sm ${isUnread ? 'btn-secondary' : 'btn-ghost'}" data-action="toggle-reachout-status" data-id="${escapeHtml(id)}" data-current="${m.status}">
              <i class="fa-solid fa-${isUnread ? 'check' : 'envelope'}"></i> Mark as ${isUnread ? 'Read' : 'Unread'}
            </button>
            <a href="mailto:${escapeHtml(m.email)}?subject=Re:%20Brush%20Collaboration" class="btn btn-sm btn-outline" style="text-decoration: none;">
              <i class="fa-solid fa-reply"></i> Reply Email
            </a>
            <button type="button" class="btn btn-sm btn-ghost" data-action="delete-reachout" data-id="${escapeHtml(id)}" style="color: var(--sale-red); margin-left: auto;">
              <i class="fa-solid fa-trash-can"></i> Delete
            </button>
          </div>
        </div>
      `;
    }).join('') : '<div class="empty">No submissions match this filter.</div>';
  }

  $('reachout-filter-chips').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-reach-filter]');
    if (!chip) return;
    reachoutFilter = chip.dataset.reachFilter;
    renderReachoutMessages();
  });

  $('reachout-search').addEventListener('input', debounce(renderReachoutMessages, 150));
  $('reachout-refresh').addEventListener('click', loadReachoutMessages);

  $('reachout-list').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;

    if (action === 'toggle-reachout-status') {
      const cur = btn.dataset.current;
      const nextStatus = cur === 'unread' ? 'read' : 'unread';
      try {
        await api(`/admin/reachout/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ status: nextStatus }) });
        const m = reachoutMessages.find(x => (x._id || x.id) === id);
        if (m) m.status = nextStatus;
        renderReachoutMessages();
      } catch (err) {
        showToast(err.message, true);
      }
    } else if (action === 'delete-reachout') {
      if (!confirm('Permanently delete this message?')) return;
      try {
        await api(`/admin/reachout/${encodeURIComponent(id)}`, { method: 'DELETE' });
        reachoutMessages = reachoutMessages.filter(x => (x._id || x.id) !== id);
        renderReachoutMessages();
        showToast('Message deleted');
      } catch (err) {
        showToast(err.message, true);
      }
    }
  });

  // =====================================================================
  // CUSTOMER & PRODUCT REVIEWS
  // =====================================================================
  let reviewsData = null;
  let reviewsFilter = 'all';

  async function loadReviews(silent = false) {
    if (!adminToken) return;
    const container = $('reviews-list');
    
    // If already in memory and not silent, render immediately (0ms instant render)
    if (!silent && reviewsData && Array.isArray(reviewsData.reviews)) {
      renderReviews();
    } else if (!silent && container) {
      container.innerHTML = '<div class="empty"><span class="skeleton"></span></div>';
    }

    try {
      const data = await api('/admin/reviews');
      if (data && Array.isArray(data.reviews)) {
        reviewsData = data;
        updateReviewsBadge();
        if (!silent) renderReviews();
      }
    } catch (e) {
      console.error('Failed to load reviews:', e);
      if (!silent && container && (!reviewsData || !reviewsData.reviews)) {
        container.innerHTML = `
          <div class="empty error" style="padding: 24px; text-align: center;">
            <p style="margin-bottom: 12px; font-weight: 600; color: var(--sale-red);">
              <i class="fa-solid fa-triangle-exclamation"></i> Failed to load customer reviews: ${escapeHtml(e.message)}
            </p>
            <button type="button" class="btn btn-sm btn-secondary" onclick="window.BrushAdminLoadReviews && window.BrushAdminLoadReviews()">
              <i class="fa-solid fa-rotate-right"></i> Try Again
            </button>
          </div>
        `;
      }
    }
  }

  // Expose global helper for retry button
  window.BrushAdminLoadReviews = () => loadReviews(false);

  function updateReviewsBadge() {
    const badge = $('badge-reviews');
    if (!badge) return;
    const count = reviewsData?.reviews?.length || 0;
    badge.textContent = count > 0 ? String(count) : '';
    badge.style.display = count > 0 ? 'inline-block' : 'none';
  }

  function renderStarRating(rating) {
    if (rating == null || isNaN(rating)) return '<span class="muted small">No star rating</span>';
    const num = Math.min(5, Math.max(1, Math.round(rating)));
    let starsHtml = '';
    for (let i = 1; i <= 5; i++) {
      if (i <= num) {
        starsHtml += '<i class="fa-solid fa-star" style="color: #f59e0b;" aria-hidden="true"></i>';
      } else {
        starsHtml += '<i class="fa-regular fa-star" style="color: rgba(245, 158, 11, 0.35);" aria-hidden="true"></i>';
      }
    }
    return `<div class="review-stars" title="${num} out of 5 stars">${starsHtml}<span class="review-stars-num">(${num}.0)</span></div>`;
  }

  function renderReviews() {
    if (!reviewsData) return;
    const reviews = Array.isArray(reviewsData.reviews) ? reviewsData.reviews : [];
    const stats = reviewsData.stats || {
      total: reviews.length,
      productCount: reviews.filter(r => r.type === 'product').length,
      orderCount: reviews.filter(r => r.type === 'order').length,
      averageRating: '5.0',
      ratedCount: reviews.length,
      fiveStar: reviews.filter(r => r.rating === 5).length,
      fourStar: reviews.filter(r => r.rating === 4).length,
      threeOrLower: 0,
      withComments: reviews.filter(r => r.comment && r.comment.trim()).length,
      withPhotos: reviews.filter(r => r.images && r.images.length).length
    };
    updateReviewsBadge();

    // Render Stats
    const statsContainer = $('reviews-stats');
    if (statsContainer) {
      statsContainer.innerHTML = `
        <div class="stat-card">
          <div class="stat-val" style="display: flex; align-items: center; gap: 8px;">
            <span>${stats.averageRating || '5.0'}</span>
            <i class="fa-solid fa-star" style="color: #f59e0b; font-size: 1.1rem;"></i>
          </div>
          <div class="stat-lbl">Average Rating (${stats.ratedCount || 0} rated)</div>
        </div>
        <div class="stat-card">
          <div class="stat-val">${stats.total || 0}</div>
          <div class="stat-lbl">Total Reviews</div>
        </div>
        <div class="stat-card">
          <div class="stat-val" style="color: #2f6b46;">${stats.orderCount || 0}</div>
          <div class="stat-lbl">Order Reviews</div>
        </div>
        <div class="stat-card">
          <div class="stat-val" style="color: var(--accent);">${stats.productCount || 0}</div>
          <div class="stat-lbl">Product Reviews</div>
        </div>
        <div class="stat-card">
          <div class="stat-val" style="color: #10b981;">${stats.fiveStar || 0} <span style="font-size: 0.85rem; font-weight: normal; color: var(--text-muted);">(★5)</span></div>
          <div class="stat-lbl">5-Star Feedback</div>
        </div>
      `;
    }

    // Render Filter Chips
    const chipsContainer = $('reviews-filter-chips');
    if (chipsContainer) {
      const filters = [
        { id: 'all', label: `All Reviews (${stats.total || 0})` },
        { id: 'order', label: `Order Reviews (${stats.orderCount || 0})` },
        { id: 'product', label: `Product Reviews (${stats.productCount || 0})` },
        { id: '5star', label: `5 Stars (${stats.fiveStar || 0})` },
        { id: '4star', label: `4 Stars (${stats.fourStar || 0})` },
        { id: 'comments', label: `With Comments (${stats.withComments || 0})` }
      ];

      chipsContainer.innerHTML = filters.map(f => `
        <button type="button" class="chip ${reviewsFilter === f.id ? 'active' : ''}" data-review-filter="${f.id}">${escapeHtml(f.label)}</button>
      `).join('');
    }

    // Filter & Search
    const searchEl = $('reviews-search');
    const q = (searchEl ? searchEl.value : '').trim().toLowerCase();
    const filtered = reviews.filter(r => {
      if (reviewsFilter === 'order' && r.type !== 'order') return false;
      if (reviewsFilter === 'product' && r.type !== 'product') return false;
      if (reviewsFilter === '5star' && r.rating !== 5) return false;
      if (reviewsFilter === '4star' && r.rating !== 4) return false;
      if (reviewsFilter === 'comments' && (!r.comment || !r.comment.trim())) return false;

      if (!q) return true;
      const haystack = `${r.author} ${r.productName || ''} ${r.orderId || ''} ${r.customerEmail || ''} ${r.customerPhone || ''} ${r.comment || ''} ${r.sourceLabel || ''}`.toLowerCase();
      return haystack.includes(q);
    });

    const container = $('reviews-list');
    if (!container) return;
    if (!filtered.length) {
      container.innerHTML = '<div class="empty">No customer reviews match this filter or search query.</div>';
      return;
    }

    container.innerHTML = filtered.map(r => {
      const isOrder = r.type === 'order';
      const sourceBadge = isOrder
        ? `<span class="badge" style="background: rgba(47, 107, 70, 0.15); color: #2f6b46; font-weight: 600;"><i class="fa-solid fa-box-open"></i> Order Review (#${escapeHtml(r.orderId)})</span>`
        : `<span class="badge" style="background: rgba(192, 50, 14, 0.14); color: var(--accent); font-weight: 600;"><i class="fa-solid fa-image"></i> Product Review</span>`;

      const photos = Array.isArray(r.images) && r.images.length > 0 ? r.images : (r.photo ? [r.photo] : []);
      const photosHtml = photos.length ? `
        <div class="review-photos-grid">
          ${photos.map(p => `
            <a href="${escapeHtml(p)}" target="_blank" rel="noopener" title="View full-size photo">
              <img src="${escapeHtml(p)}" alt="Customer review photo" class="review-photo-thumb" loading="lazy">
            </a>
          `).join('')}
        </div>
      ` : '';

      const itemsHtml = isOrder && Array.isArray(r.items) && r.items.length ? `
        <div style="margin-top: 10px;">
          <span class="muted small" style="display: block; margin-bottom: 4px; font-weight: 600;">Ordered Artwork:</span>
          <div class="review-order-items">
            ${r.items.map(it => `
              <span class="review-item-tag">
                <i class="fa-solid fa-palette" style="font-size: 0.75rem; color: var(--accent);" aria-hidden="true"></i>
                <strong>${escapeHtml(it.name)}</strong>
                ${it.size ? `<span class="muted">${escapeHtml(it.size)}</span>` : ''}
                ${it.framing ? `<span class="muted">(${escapeHtml(it.framing)})</span>` : ''}
                ${it.quantity > 1 ? `<span class="muted">&times;${it.quantity}</span>` : ''}
              </span>
            `).join('')}
          </div>
        </div>
      ` : '';

      const productCardHtml = !isOrder ? `
        <div style="display: flex; align-items: center; gap: 10px; margin: 8px 0; background: var(--bg-primary); padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border-color);">
          ${r.productImage ? `<img src="${escapeHtml(r.productImage)}" alt="${escapeHtml(r.productName)}" style="width: 32px; height: 44px; object-fit: cover; border-radius: 4px; flex-shrink: 0;">` : ''}
          <div style="min-width: 0; flex: 1;">
            <div style="font-size: 0.88rem; font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(r.productName)}</div>
            <span class="muted small">Product ID: #${r.productId}</span>
          </div>
          <a href="/p/${encodeURIComponent(r.productId)}" target="_blank" rel="noopener" class="btn btn-sm btn-ghost" style="flex-shrink: 0;">
            <i class="fa-solid fa-arrow-up-right-from-square"></i> Store Page
          </a>
        </div>
      ` : '';

      return `
        <div class="card review-card" data-review-id="${escapeHtml(r.id)}">
          <div class="review-header">
            <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
              ${sourceBadge}
              ${renderStarRating(r.rating)}
              <strong style="font-size: 1.02rem; color: var(--text-primary);">${escapeHtml(r.author || 'Customer')}</strong>
              ${r.customerEmail ? `<a href="mailto:${escapeHtml(r.customerEmail)}" style="font-size: 0.85rem; color: var(--accent); text-decoration: none;">&lt;${escapeHtml(r.customerEmail)}&gt;</a>` : ''}
              ${r.customerPhone ? `<span class="muted small"><i class="fa-solid fa-phone"></i> ${escapeHtml(r.customerPhone)}</span>` : ''}
            </div>
            <span class="muted small" title="${escapeHtml(new Date(r.createdAt).toLocaleString('en-IN'))}">${relTime(r.createdAt)}</span>
          </div>

          ${productCardHtml}

          ${r.comment ? `
            <div class="review-comment-text">
              <i class="fa-solid fa-quote-left" style="opacity: 0.4; margin-right: 6px;" aria-hidden="true"></i>
              ${escapeHtml(r.comment)}
            </div>
          ` : `
            <div style="margin: 6px 0; font-size: 0.85rem; color: var(--text-muted); font-style: italic;">
              <i class="fa-regular fa-star" style="margin-right: 4px;"></i> Star-only rating submitted by customer.
            </div>
          `}

          ${photosHtml}
          ${itemsHtml}

          <div style="display: flex; gap: 8px; align-items: center; border-top: 1px solid var(--border-color); margin-top: 12px; padding-top: 10px; flex-wrap: wrap;">
            ${isOrder ? `
              <button type="button" class="btn btn-sm btn-secondary" data-action="open-order-review" data-order="${escapeHtml(r.orderId)}">
                <i class="fa-solid fa-box-open"></i> View Order in Orders Tab
              </button>
              ${r.customerEmail ? `
                <a href="mailto:${escapeHtml(r.customerEmail)}?subject=Re:%20Your%20Brush%20Order%20${encodeURIComponent(r.orderId)}%20Review" class="btn btn-sm btn-outline" style="text-decoration: none;">
                  <i class="fa-solid fa-reply"></i> Reply to Customer
                </a>
              ` : ''}
            ` : `
              <a href="/p/${encodeURIComponent(r.productId)}" target="_blank" rel="noopener" class="btn btn-sm btn-secondary" style="text-decoration: none;">
                <i class="fa-solid fa-eye"></i> View on Store
              </a>
            `}
            <button type="button" class="btn btn-sm btn-ghost" data-action="delete-review" data-type="${escapeHtml(r.type)}" data-target-id="${escapeHtml(isOrder ? r.orderId : r.productId)}" data-raw-index="${r.rawIndex != null ? r.rawIndex : ''}" style="color: var(--sale-red); margin-left: auto;">
              <i class="fa-solid fa-trash-can"></i> Delete
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  $('reviews-filter-chips').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-review-filter]');
    if (!chip) return;
    reviewsFilter = chip.dataset.reviewFilter;
    renderReviews();
  });

  $('reviews-search').addEventListener('input', debounce(renderReviews, 150));
  $('reviews-refresh').addEventListener('click', () => loadReviews(false));

  $('reviews-list').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;

    if (action === 'open-order-review') {
      const orderId = btn.dataset.order;
      openView('orders');
      $('orders-search').value = orderId;
      renderOrders();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (action === 'delete-review') {
      const type = btn.dataset.type;
      const targetId = btn.dataset.targetId;
      const rawIndex = btn.dataset.rawIndex;
      if (!confirm(`Are you sure you want to delete this ${type} review?`)) return;

      btn.disabled = true;
      try {
        let url = `/admin/reviews/${encodeURIComponent(type)}/${encodeURIComponent(targetId)}`;
        if (type === 'product' && rawIndex !== '') {
          url += `?index=${encodeURIComponent(rawIndex)}`;
        }
        await api(url, { method: 'DELETE' });
        showToast('Review removed successfully');
        loadReviews(false);
      } catch (err) {
        showToast(err.message, true);
        btn.disabled = false;
      }
    }
  });

  checkAuth();
})();
