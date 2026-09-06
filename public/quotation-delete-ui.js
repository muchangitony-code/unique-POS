(() => {
  const buttonClass = 'quotation-delete-control';

  function authHeaders() {
    let token = '';
    let user = null;
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key) continue;
      const raw = localStorage.getItem(key) || '';
      if (!token && /token/i.test(key) && raw && raw.length > 20) token = raw.replace(/^"|"$/g, '');
      try {
        const parsed = JSON.parse(raw);
        if (!token && parsed && typeof parsed === 'object') {
          for (const [k, v] of Object.entries(parsed)) {
            if (/token|accessToken|authToken/i.test(k) && typeof v === 'string') token = v;
          }
        }
        if (!user && /auth|user|session/i.test(key) && parsed && typeof parsed === 'object') user = parsed.user || parsed;
      } catch (_) {}
    }
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (user && user.role) headers['x-role'] = String(user.role).toLowerCase();
    if (user && user.id != null) headers['x-user-id'] = String(user.id);
    return headers;
  }

  async function quotationMap() {
    const res = await fetch('/api/quotations', { headers: authHeaders(), credentials: 'include' });
    if (!res.ok) throw new Error('Unable to load quotation records');
    const body = await res.json();
    const rows = Array.isArray(body) ? body : (body.data || body.quotations || []);
    return new Map(rows.map(q => [String(q.quotation_number), q]));
  }

  async function attachDeleteControls() {
    if (!location.pathname.toLowerCase().includes('quotation')) return;
    let quotes;
    try { quotes = await quotationMap(); } catch (_) { return; }

    document.querySelectorAll('table tbody tr').forEach((row) => {
      if (row.querySelector(`.${buttonClass}`)) return;
      const cells = row.querySelectorAll('td');
      if (cells.length < 2) return;
      const number = cells[0].textContent.trim().replace(/\s+/g, '');
      const quote = quotes.get(number);
      if (!quote || String(quote.status).toLowerCase() === 'converted') return;
      const actions = cells[cells.length - 1].querySelector('div') || cells[cells.length - 1];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = buttonClass;
      btn.textContent = 'Delete';
      btn.title = 'Delete quotation';
      btn.style.cssText = 'margin-left:4px;padding:6px 10px;border:1px solid #dc2626;border-radius:6px;background:transparent;color:#ef4444;font:inherit;font-size:12px;font-weight:600;cursor:pointer;';
      btn.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!confirm(`Delete ${quote.quotation_number}? This permanently removes this quotation and its line items. Inventory and sales will not be changed.`)) return;
        btn.disabled = true;
        btn.textContent = 'Deleting…';
        try {
          const res = await fetch(`/api/quotations/${quote.id}`, { method: 'DELETE', headers: authHeaders(), credentials: 'include' });
          if (res.status !== 204 && !res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.error || body.message || `Delete failed (${res.status})`);
          }
          row.remove();
          window.dispatchEvent(new Event('quotation-deleted'));
        } catch (error) {
          alert(error.message || 'Unable to delete quotation.');
          btn.disabled = false;
          btn.textContent = 'Delete';
        }
      });
      actions.appendChild(btn);
    });
  }

  let timer;
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(attachDeleteControls, 150);
  };
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('popstate', schedule);
  window.addEventListener('hashchange', schedule);
  schedule();
})();
