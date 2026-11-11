/* ==========================================================================
   BRUSH — ACCOUNT & ORDERS CONTROLLER (Shared client logic)
   ========================================================================== */

(function() {
  'use strict';

  const Account = {
    // Current authenticated user session from localStorage
    getUser() {
      try {
        const raw = localStorage.getItem('brushUser');
        if (!raw) return null;
        const user = JSON.parse(raw);
        if (user && (user.token || user.userId || user.email)) return user;
        return null;
      } catch (err) {
        return null;
      }
    },

    // Save/update user session
    setUser(user) {
      try {
        localStorage.setItem('brushUser', JSON.stringify(user));
      } catch (_) {}
    },

    // Redirect to login if user is not authenticated
    requireAuth(redirectUrl) {
      const user = this.getUser();
      if (!user) {
        const dest = redirectUrl || window.location.href;
        window.location.href = `/?login=1&redirect=${encodeURIComponent(dest)}`;
        return false;
      }
      return true;
    },

    // Logout
    logout() {
      if (confirm('Are you sure you want to log out of your Brush account?')) {
        try {
          localStorage.removeItem('brushUser');
        } catch (_) {}
        window.location.href = '/';
      }
    },

    // Populate Sidebar User Card
    initSidebarUser() {
      const user = this.getUser();
      const nameEl = document.getElementById('account-sidebar-name');
      const avatarEl = document.getElementById('account-sidebar-avatar');

      if (user) {
        const displayName = user.name || (user.email ? user.email.split('@')[0] : 'Art Collector');
        if (nameEl) nameEl.textContent = displayName;
        if (avatarEl) {
          const initial = displayName.trim().charAt(0).toUpperCase() || 'B';
          avatarEl.textContent = initial;
        }
      }
    },

    // Toast Notification helper
    showToast(message, type = 'success') {
      let toastEl = document.getElementById('account-toast');
      if (!toastEl) {
        toastEl = document.createElement('div');
        toastEl.id = 'account-toast';
        toastEl.className = 'account-toast';
        document.body.appendChild(toastEl);
      }

      toastEl.className = `account-toast ${type} show`;
      const icon = type === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation';
      toastEl.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${this.escapeHtml(message)}</span>`;

      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => {
        toastEl.classList.remove('show');
      }, 3500);
    },

    // Safe HTML Escaping
    escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    },

    // Format Currency
    formatINR(num) {
      const val = Number(num) || 0;
      return '₹' + val.toLocaleString('en-IN');
    },

    // Format Date
    formatDate(dateVal) {
      if (!dateVal) return 'N/A';
      try {
        const d = dateVal._seconds ? new Date(dateVal._seconds * 1000) : new Date(dateVal);
        return d.toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
          year: 'numeric'
        });
      } catch (_) {
        return 'N/A';
      }
    },

    // Format Date & Time
    formatDateTime(dateVal) {
      if (!dateVal) return '';
      try {
        const d = dateVal._seconds ? new Date(dateVal._seconds * 1000) : new Date(dateVal);
        return d.toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
          year: 'numeric'
        }) + ' at ' + d.toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit'
        });
      } catch (_) {
        return '';
      }
    },

    // API Helper with Auth Header
    async apiFetch(endpoint, options = {}) {
      const user = this.getUser();
      const headers = {
        'Content-Type': 'application/json',
        ...(user && user.token ? { 'Authorization': `Bearer ${user.token}` } : {}),
        ...(options.headers || {})
      };

      const base = window.API_BASE || '/api';
      const url = endpoint.startsWith('http') ? endpoint : `${base}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
      
      const res = await fetch(url, { ...options, headers });
      if (res.status === 401) {
        // Session expired
        this.showToast('Session expired. Please log in again.', 'error');
        setTimeout(() => {
          localStorage.removeItem('brushUser');
          window.location.href = `/?login=1&redirect=${encodeURIComponent(window.location.href)}`;
        }, 1500);
        throw new Error('Session expired');
      }
      return res;
    }
  };

  window.BrushAccount = Account;

  // Run on DOM ready
  document.addEventListener('DOMContentLoaded', () => {
    Account.initSidebarUser();
  });
})();
