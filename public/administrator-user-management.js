(function () {
  'use strict';
  const TOKEN_KEY = 'uniquepos.token';
  const USER_KEY = 'uniquepos.user';
  const ROLES = [
    ['cashier','Cashier'],['sales_cashier','Sales Cashier'],['sales_rep','Sales Representative'],
    ['storekeeper','Storekeeper'],['inventory_manager','Inventory Manager'],['branch_manager','Branch Manager'],
    ['manager','Manager'],['administrator','Administrator']
  ];
  const token = () => localStorage.getItem(TOKEN_KEY) || '';
  const me = () => { try { return JSON.parse(localStorage.getItem(USER_KEY) || '{}'); } catch (_) { return {}; } };
  const esc = v => String(v == null ? '' : v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  async function api(path, options) {
    const o = Object.assign({headers:{}}, options || {});
    o.headers = Object.assign({'Content-Type':'application/json'}, o.headers || {});
    if (token()) o.headers.Authorization = 'Bearer ' + token();
    const r = await fetch(path, o); const t = await r.text(); let b = null;
    try { b = t ? JSON.parse(t) : null; } catch (_) { b = t; }
    if (!r.ok) throw new Error((b && b.error) || ('Request failed (' + r.status + ')'));
    return b;
  }
  function isAdministrator() { return String(me().role || '').toLowerCase() === 'administrator'; }
  function list(v) { return Array.isArray(v) ? v : (v && Array.isArray(v.users) ? v.users : (v && Array.isArray(v.data) ? v.data : [])); }
  async function load() { return list(await api('/api/users')); }
  function roleLabel(r) { const x = ROLES.find(x => x[0] === r); return x ? x[1] : (r || 'User'); }
  function render(users) {
    if (!isAdministrator() || location.hash.replace(/^#/,'') !== 'users') return;
    const root = document.getElementById('viewRoot'); if (!root) return;
    const rows = users.map(u => {
      const active = u.is_active !== false && u.isActive !== false;
      if (String(u.id) === String(me().id || me().user_id)) return `<tr><td><strong>${esc(u.name)}</strong></td><td>${esc(u.email)}</td><td>${esc(roleLabel(u.role))}</td><td>${active ? 'Active' : 'Inactive'}</td><td><span class="muted">Current account</span></td></tr>`;
      return `<tr><td><strong>${esc(u.name || '—')}</strong></td><td>${esc(u.email || '—')}</td><td><span class="badge">${esc(roleLabel(u.role))}</span></td><td>${active ? '<span class="badge badge-success">Active</span>' : '<span class="badge badge-danger">Inactive</span>'}</td><td><div class="table-actions"><button class="btn btn-outline" data-adm-user="edit" data-id="${esc(u.id)}">Edit</button><button class="btn btn-outline" data-adm-user="reset" data-id="${esc(u.id)}">Reset Password</button><button class="btn btn-outline" data-adm-user="toggle" data-id="${esc(u.id)}">${active ? 'Disable' : 'Enable'}</button><button class="btn btn-danger" data-adm-user="delete" data-id="${esc(u.id)}">Delete</button></div></td></tr>`;
    }).join('');
    root.innerHTML = `<div data-administrator-user-management><div class="module-toolbar"><div class="inline-group"><button class="btn btn-primary" data-adm-user="add">Add User</button><button class="btn btn-outline" data-adm-user="reset-all">Reset All Staff Passwords</button><button class="btn btn-outline" data-adm-user="refresh">Refresh</button></div></div><section class="card section-card"><div class="section-head"><div><h3>User Management</h3><p>Administrator controls for staff accounts. No coding or database access is required.</p></div></div><div style="overflow:auto"><table class="data-table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead><tbody>${rows || '<tr><td colspan="5">No users found.</td></tr>'}</tbody></table></div></section></div>`;
  }
  async function refresh() { try { render(await load()); } catch (e) { console.error('[administrator-user-management]', e); } }
  function form(user) {
    const editing = !!user;
    const roleOptions = ROLES.map(r => `<option value="${r[0]}" ${r[0] === (user && user.role) ? 'selected' : ''}>${r[1]}</option>`).join('');
    const body = `<form id="admUserForm"><div style="display:grid;grid-template-columns:1fr 1fr;gap:14px"><label>Full Name<input name="name" value="${esc(user && user.name)}" required></label><label>Email<input name="email" type="email" value="${esc(user && user.email)}" required></label><label>Phone<input name="phone" value="${esc(user && user.phone)}"></label><label>Role<select name="role">${roleOptions}</select></label><label>New Password<input name="password" type="password" placeholder="Leave blank to keep current"></label><label>Active<select name="is_active"><option value="true" ${!user || user.is_active !== false && user.isActive !== false ? 'selected':''}>Active</option><option value="false" ${user && user.is_active === false || user && user.isActive === false ? 'selected':''}>Inactive</option></select></label></div><div style="display:flex;justify-content:flex-end;gap:10px;margin-top:18px"><button type="button" class="btn btn-outline" data-adm-user="close">Cancel</button><button class="btn btn-primary">${editing ? 'Save Changes' : 'Create User'}</button></div></form>`;
    const wrap = document.createElement('div'); wrap.style.cssText='position:fixed;inset:0;background:rgba(15,23,42,.58);z-index:10001;display:flex;align-items:center;justify-content:center;padding:20px';
    wrap.innerHTML=`<div style="background:#fff;border-radius:16px;width:min(720px,100%);padding:22px;max-height:90vh;overflow:auto"><h3>${editing?'Edit User':'Create User'}</h3>${body}</div>`; document.body.appendChild(wrap);
    wrap.querySelector('form').addEventListener('submit', async e => { e.preventDefault(); const fd=new FormData(e.target); const b=Object.fromEntries(fd.entries()); b.is_active=b.is_active==='true'; if(!b.password) delete b.password; try { if(editing) await api('/api/admin/users/'+encodeURIComponent(user.id),{method:'PATCH',body:JSON.stringify(b)}); else { if(!b.password || b.password.length<10) throw new Error('Initial password must contain at least 10 characters.'); await api('/api/users',{method:'POST',body:JSON.stringify(b)}); } wrap.remove(); await refresh(); alert(editing?'User updated successfully.':'User created successfully.'); } catch(err){ alert(err.message); } });
    wrap.addEventListener('click', e => { if(e.target.closest('[data-adm-user="close"]')) wrap.remove(); });
  }
  async function reset(user) { const p = prompt('Enter a new password for ' + user.name + ' (minimum 10 characters):'); if(p === null) return; if(p.length < 10) return alert('Password must contain at least 10 characters.'); try { await api('/api/admin/users/'+encodeURIComponent(user.id)+'/reset-password',{method:'POST',body:JSON.stringify({password:p})}); alert('Password reset successfully.'); } catch(e){ alert(e.message); } }
  async function toggle(user) { const active=user.is_active!==false && user.isActive!==false; if(!confirm((active?'Disable':'Enable')+' user '+user.name+'?')) return; try { await api('/api/admin/users/'+encodeURIComponent(user.id),{method:'PATCH',body:JSON.stringify({is_active:!active})}); await refresh(); } catch(e){ alert(e.message); } }
  async function remove(user) { if(!confirm('Permanently delete '+user.name+'? This cannot be undone.')) return; const reason=prompt('Enter a reason for deletion:'); if(reason===null) return; if(!reason.trim()) return alert('A reason is required.'); try { await api('/api/admin/users/'+encodeURIComponent(user.id),{method:'DELETE',body:JSON.stringify({reason})}); await refresh(); alert('User deleted.'); } catch(e){ alert(e.message); } }
  async function resetAll() { try { const users=await load(); const staff=users.filter(u=>String(u.id)!==String(me().id||me().user_id) && !['super_admin','business_owner'].includes(String(u.role))); if(!staff.length) return alert('No staff users found.'); if(!confirm('Reset passwords for all '+staff.length+' staff users?')) return; const result=await api('/api/admin/users/reset-all',{method:'POST',body:JSON.stringify({include_top_level:false})}); const lines=(result.users||[]).map(u=>u.name+': '+u.temporary_password).join('\n'); alert('Temporary passwords:\n\n'+lines); } catch(e){ alert(e.message); } }
  document.addEventListener('click', async e => { const b=e.target.closest('[data-adm-user]'); if(!b) return; const a=b.getAttribute('data-adm-user'); try { const users=await load(); const u=users.find(x=>String(x.id)===String(b.dataset.id)); if(a==='add') return form(null); if(a==='edit'&&u) return form(u); if(a==='reset'&&u) return reset(u); if(a==='toggle'&&u) return toggle(u); if(a==='delete'&&u) return remove(u); if(a==='reset-all') return resetAll(); if(a==='refresh') return refresh(); } catch(err){ alert(err.message); } });
  function watch(){ if(isAdministrator() && location.hash.replace(/^#/,'')==='users') refresh(); }
  window.addEventListener('hashchange', watch); window.setTimeout(watch, 1200);
})();
