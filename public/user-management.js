(function () {
  'use strict';

  const TOKEN_KEY = 'uniquepos.token';
  const USER_KEY = 'uniquepos.user';
  const ROLE_OPTIONS = [
    ['cashier', 'Cashier'],
    ['sales_cashier', 'Sales Cashier'],
    ['sales_rep', 'Sales Representative'],
    ['storekeeper', 'Storekeeper'],
    ['inventory_manager', 'Inventory Manager'],
    ['branch_manager', 'Branch Manager'],
    ['manager', 'Manager'],
    ['administrator', 'Administrator'],
    ['super_admin', 'Super Admin'],
    ['business_owner', 'Business Owner']
  ];

  let timer = null;
  let modal = null;
  let lastRenderKey = '';
  let users = [];
  let branches = [];

  function currentUser() {
    try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null') || {}; } catch (_) { return {}; }
  }

  function isAdmin() {
    const role = String(currentUser().role || '').toLowerCase();
    return role === 'super_admin' || role === 'business_owner';
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function token() { return localStorage.getItem(TOKEN_KEY) || ''; }

  async function api(path, options) {
    const opts = Object.assign({ headers: {} }, options || {});
    opts.headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    if (token()) opts.headers.Authorization = 'Bearer ' + token();
    const response = await fetch(path, opts);
    const text = await response.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch (_) { body = text; }
    if (!response.ok) throw new Error((body && body.error) || ('Request failed (' + response.status + ')'));
    return body;
  }

  function password() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
    const bytes = new Uint8Array(14);
    if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(bytes);
    else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    return Array.from(bytes, b => chars[b % chars.length]).join('');
  }

  function normalizeList(value) {
    if (Array.isArray(value)) return value;
    if (value && Array.isArray(value.data)) return value.data;
    if (value && Array.isArray(value.users)) return value.users;
    return [];
  }

  async function loadData() {
    const [userResult, branchResult] = await Promise.all([
      api('/api/users'),
      api('/api/branches').catch(() => [])
    ]);
    users = normalizeList(userResult);
    branches = normalizeList(branchResult);
  }

  function branchName(user) {
    if (user.branch_name) return user.branch_name;
    const id = user.branch_id || user.branchId;
    const branch = branches.find(b => String(b.id) === String(id));
    return branch ? (branch.name || branch.branch_name) : (user.branch || 'Main Branch');
  }

  function roleLabel(role) {
    const found = ROLE_OPTIONS.find(r => r[0] === role);
    return found ? found[1] : (role || 'User');
  }

  function canManageTarget(user) {
    const me = currentUser();
    if (String(user.id) === String(me.id || me.user_id)) return false;
    const targetTop = ['super_admin', 'business_owner'].includes(String(user.role));
    return !targetTop || me.role === 'business_owner';
  }

  function render() {
    if (!isAdmin()) return;
    const root = document.getElementById('viewRoot');
    if (!root) return;
    const key = location.hash + '|' + users.map(u => [u.id, u.name, u.email, u.role, u.is_active].join(':')).join('|');
    if (location.hash.replace('#', '') !== 'users') { lastRenderKey = ''; return; }
    if (key === lastRenderKey && root.querySelector('[data-user-management-root]')) return;
    lastRenderKey = key;

    const active = users.filter(u => u.is_active !== false && u.isActive !== false).length;
    const inactive = users.length - active;
    const topAdmins = users.filter(u => ['super_admin', 'business_owner'].includes(String(u.role))).length;

    root.innerHTML = `
      <div data-user-management-root>
        <div class="module-toolbar">
          <div class="inline-group">
            <button class="btn btn-primary" data-um="add"><i class="fa-solid fa-user-plus"></i> Add User</button>
            <button class="btn btn-outline" data-um="reset-all"><i class="fa-solid fa-key"></i> Reset All Staff Passwords</button>
            <button class="btn btn-outline" data-um="refresh"><i class="fa-solid fa-rotate"></i> Refresh</button>
          </div>
        </div>
        <section class="overview-grid">
          <article class="card overview-tile"><div class="kpi-card__label">Total Users</div><strong>${users.length}</strong></article>
          <article class="card overview-tile"><div class="kpi-card__label">Active</div><strong>${active}</strong></article>
          <article class="card overview-tile"><div class="kpi-card__label">Inactive</div><strong>${inactive}</strong></article>
          <article class="card overview-tile"><div class="kpi-card__label">Top Administrators</div><strong>${topAdmins}</strong></article>
        </section>
        <section class="card section-card">
          <div class="section-head"><div><h3>User Management</h3><p>Create, edit, disable, reset passwords and delete users without database or coding access.</p></div></div>
          <div style="overflow:auto">
            <table class="data-table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Branch</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>${users.map(renderRow).join('') || '<tr><td colspan="6">No users found.</td></tr>'}</tbody></table>
          </div>
        </section>
      </div>`;
  }

  function renderRow(user) {
    const active = user.is_active !== false && user.isActive !== false;
    const manageable = canManageTarget(user);
    const id = escapeHtml(user.id);
    return `<tr>
      <td><strong>${escapeHtml(user.name || '—')}</strong></td>
      <td>${escapeHtml(user.email || '—')}<br><small>${escapeHtml(user.phone || '')}</small></td>
      <td><span class="badge">${escapeHtml(roleLabel(user.role))}</span></td>
      <td>${escapeHtml(branchName(user))}</td>
      <td>${active ? '<span class="badge badge-success">Active</span>' : '<span class="badge badge-danger">Inactive</span>'}</td>
      <td><div class="table-actions">
        ${manageable ? `<button class="btn btn-outline" data-um="edit" data-id="${id}"><i class="fa-solid fa-pen"></i> Edit</button>` : ''}
        ${manageable ? `<button class="btn btn-outline" data-um="reset" data-id="${id}"><i class="fa-solid fa-key"></i> Reset Password</button>` : ''}
        ${manageable ? `<button class="btn btn-outline" data-um="toggle" data-id="${id}">${active ? '<i class="fa-solid fa-user-slash"></i> Disable' : '<i class="fa-solid fa-user-check"></i> Enable'}</button>` : ''}
        ${manageable ? `<button class="btn btn-danger" data-um="delete" data-id="${id}"><i class="fa-solid fa-trash"></i> Delete</button>` : '<span class="muted">Protected</span>'}
      </div></td>
    </tr>`;
  }

  function openModal(title, body) {
    closeModal();
    modal = document.createElement('div');
    modal.id = 'userManagementModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.58);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;';
    modal.innerHTML = `<div style="background:#fff;border-radius:16px;width:min(760px,100%);max-height:90vh;overflow:auto;box-shadow:0 24px 80px rgba(0,0,0,.25)"><div style="display:flex;justify-content:space-between;align-items:center;padding:18px 20px;border-bottom:1px solid #e2e8f0"><div><h3 style="margin:0">${escapeHtml(title)}</h3><p style="margin:5px 0 0;color:#64748b">User administration</p></div><button type="button" class="icon-btn" data-um="close"><i class="fa-solid fa-xmark"></i></button></div><div style="padding:20px">${body}</div></div>`;
    document.body.appendChild(modal);
  }

  function closeModal() {
    if (modal) modal.remove();
    modal = null;
  }

  function field(label, name, value, type) {
    return `<label style="display:block"><span>${escapeHtml(label)}</span><input name="${escapeHtml(name)}" type="${type || 'text'}" value="${escapeHtml(value || '')}" style="width:100%" /></label>`;
  }

  function roleSelect(selected) {
    const owner = currentUser().role === 'business_owner';
    return `<label style="display:block"><span>Role</span><select name="role" style="width:100%">${ROLE_OPTIONS.filter(r => owner || !['super_admin','business_owner'].includes(r[0])).map(r => `<option value="${r[0]}" ${r[0] === selected ? 'selected' : ''}>${r[1]}</option>`).join('')}</select></label>`;
  }

  function branchSelect(selected) {
    return `<label style="display:block"><span>Branch</span><select name="branch_id" style="width:100%"><option value="">Main / Unassigned</option>${branches.map(b => `<option value="${escapeHtml(b.id)}" ${String(b.id) === String(selected || '') ? 'selected' : ''}>${escapeHtml(b.name || b.branch_name || ('Branch ' + b.id))}</option>`).join('')}</select></label>`;
  }

  function userForm(user) {
    const editing = !!user;
    const active = editing ? (user.is_active !== false && user.isActive !== false) : true;
    openModal(editing ? 'Edit User' : 'Create User', `<form id="umUserForm">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
        ${field('Full Name','name',editing ? user.name : '')}
        ${field('Email','email',editing ? user.email : '','email')}
        ${field('Phone','phone',editing ? user.phone : '')}
        ${roleSelect(editing ? user.role : 'cashier')}
        ${branchSelect(editing ? (user.branch_id || user.branchId) : '')}
        ${field(editing ? 'New Password (optional)' : 'Initial Password','password','', 'password')}
      </div>
      <label style="display:flex;gap:10px;align-items:center;margin-top:14px"><input name="is_active" type="checkbox" ${active ? 'checked' : ''} style="width:auto" /> <span>Account active</span></label>
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px"><button type="button" class="btn btn-outline" data-um="close">Cancel</button><button class="btn btn-primary" type="submit">${editing ? 'Save Changes' : 'Create User'}</button></div>
    </form>`);
    const form = modal.querySelector('#umUserForm');
    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      const fd = new FormData(form);
      const body = Object.fromEntries(fd.entries());
      body.is_active = form.elements.is_active.checked;
      if (!body.password) delete body.password;
      try {
        if (editing) {
          await api('/api/admin/users/' + encodeURIComponent(user.id), { method: 'PATCH', body: JSON.stringify(body) });
          alert('User updated successfully.');
        } else {
          if (!body.password || body.password.length < 10) throw new Error('Initial password must contain at least 10 characters.');
          await api('/api/users', { method: 'POST', body: JSON.stringify(body) });
          alert('User created successfully.');
        }
        closeModal(); await refresh();
      } catch (error) { alert(error.message); }
    });
  }

  async function resetUser(user) {
    const generated = password();
    openModal('Reset Password', `<p>Reset the password for <strong>${escapeHtml(user.name)}</strong>.</p><form id="umResetForm">${field('New Password','password',generated,'text')}<p style="color:#64748b;font-size:13px">Copy the temporary password and give it to the user securely. The password is not stored in the audit log.</p><div style="display:flex;justify-content:flex-end;gap:10px"><button type="button" class="btn btn-outline" data-um="close">Cancel</button><button class="btn btn-primary" type="submit">Reset Password</button></div></form>`);
    modal.querySelector('#umResetForm').addEventListener('submit', async function (event) {
      event.preventDefault();
      const value = new FormData(event.target).get('password');
      if (!value || String(value).length < 10) return alert('Password must contain at least 10 characters.');
      try {
        const result = await api('/api/admin/users/' + encodeURIComponent(user.id) + '/reset-password', { method: 'POST', body: JSON.stringify({ password: String(value) }) });
        closeModal();
        openModal('Password Reset Complete', `<div style="padding:10px 0"><p>The password for <strong>${escapeHtml(user.name)}</strong> has been reset.</p><div style="background:#f1f5f9;border-radius:10px;padding:14px;font-family:monospace;font-size:18px;word-break:break-all">${escapeHtml(result.temporary_password)}</div><p style="color:#64748b">Copy this password now and provide it securely to the user.</p><div style="display:flex;justify-content:flex-end"><button class="btn btn-primary" type="button" data-um="close">Done</button></div></div>`);
      } catch (error) { alert(error.message); }
    });
  }

  async function toggleUser(user) {
    const active = user.is_active !== false && user.isActive !== false;
    if (!confirm((active ? 'Disable' : 'Enable') + ' user "' + user.name + '"?')) return;
    try {
      await api('/api/admin/users/' + encodeURIComponent(user.id), { method: 'PATCH', body: JSON.stringify({ is_active: !active }) });
      await refresh();
    } catch (error) { alert(error.message); }
  }

  async function deleteUser(user) {
    if (!confirm('Permanently delete user "' + user.name + '"?\n\nThis cannot be undone.')) return;
    const reason = prompt('Enter a reason for deleting this user:');
    if (reason === null) return;
    if (!reason.trim()) return alert('A reason is required.');
    try {
      await api('/api/admin/users/' + encodeURIComponent(user.id), { method: 'DELETE', body: JSON.stringify({ reason }) });
      alert('User deleted.');
      await refresh();
    } catch (error) { alert(error.message); }
  }

  async function resetAllStaff() {
    const staff = users.filter(u => !['super_admin','business_owner'].includes(String(u.role)) && String(u.id) !== String(currentUser().id));
    if (!staff.length) return alert('There are no staff users available for bulk reset.');
    if (!confirm('Reset passwords for all ' + staff.length + ' staff users?\n\nNew temporary passwords will be generated for every staff account.')) return;
    try {
      const result = await api('/api/admin/users/reset-all', { method: 'POST', body: JSON.stringify({ include_top_level: false }) });
      const rows = (result.users || []).map(u => `<tr><td>${escapeHtml(u.name)}</td><td>${escapeHtml(u.email)}</td><td>${escapeHtml(roleLabel(u.role))}</td><td><code>${escapeHtml(u.temporary_password)}</code></td></tr>`).join('');
      openModal('Staff Passwords Reset', `<p>${result.count} password(s) were reset. Copy these temporary passwords now.</p><div style="overflow:auto"><table class="data-table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Temporary Password</th></tr></thead><tbody>${rows}</tbody></table></div><div style="display:flex;justify-content:flex-end;margin-top:16px"><button class="btn btn-primary" type="button" data-um="close">Done</button></div>`);
      await refresh(false);
    } catch (error) { alert(error.message); }
  }

  async function refresh(renderAfter) {
    await loadData();
    if (renderAfter !== false) render();
  }

  function findUser(id) { return users.find(u => String(u.id) === String(id)); }

  document.addEventListener('click', function (event) {
    const button = event.target.closest('[data-um]');
    if (!button) return;
    const action = button.getAttribute('data-um');
    if (action === 'close') return closeModal();
    if (action === 'refresh') return refresh().catch(e => alert(e.message));
    if (action === 'add') return userForm(null);
    if (action === 'edit') { const u = findUser(button.dataset.id); if (u) return userForm(u); }
    if (action === 'reset') { const u = findUser(button.dataset.id); if (u) return resetUser(u); }
    if (action === 'toggle') { const u = findUser(button.dataset.id); if (u) return toggleUser(u); }
    if (action === 'delete') { const u = findUser(button.dataset.id); if (u) return deleteUser(u); }
    if (action === 'reset-all') return resetAllStaff();
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && modal) closeModal();
  });

  function watch() {
    if (!isAdmin()) return;
    const route = location.hash.replace(/^#/, '');
    if (route === 'users') {
      if (!timer) {
        refresh().catch(error => console.error('[user-management]', error));
        timer = window.setInterval(function () {
          if (location.hash.replace(/^#/, '') === 'users') render();
          else { clearInterval(timer); timer = null; }
        }, 700);
      }
    } else if (timer) {
      clearInterval(timer); timer = null; lastRenderKey = '';
    }
  }

  window.addEventListener('hashchange', watch);
  window.setTimeout(watch, 1000);
})();
