(function () {
  'use strict';
  const TOKEN_KEY='uniquepos.token', USER_KEY='uniquepos.user';
  const ROLES=[['cashier','Cashier'],['sales_cashier','Sales Cashier'],['sales_rep','Sales Representative'],['storekeeper','Storekeeper'],['inventory_manager','Inventory Manager'],['branch_manager','Branch Manager'],['manager','Manager'],['administrator','Administrator']];
  const token=()=>localStorage.getItem(TOKEN_KEY)||'';
  const me=()=>{try{return JSON.parse(localStorage.getItem(USER_KEY)||'{}')}catch(_){return {}}};
  const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;').replace(/'/g,'&#39;');
  async function api(path,opt={}){const o={...opt,headers:{'Content-Type':'application/json',...(opt.headers||{})}};if(token())o.headers.Authorization='Bearer '+token();const r=await fetch(path,o);const t=await r.text();let b=null;try{b=t?JSON.parse(t):null}catch(_){b=t}if(!r.ok)throw new Error(b?.error||`Request failed (${r.status})`);return b}
  function allowed(){return ['administrator','business_owner','super_admin'].includes(String(me().role||'').toLowerCase())}
  function usersFrom(v){return Array.isArray(v)?v:(Array.isArray(v?.users)?v.users:[])}
  function roleLabel(r){return ROLES.find(x=>x[0]===r)?.[1]||r||'User'}
  let cache=[];
  async function load(){const b=await api('/api/admin/users');cache=usersFrom(b);return cache}
  function render(users){if(!allowed()||location.hash.replace(/^#/,'')!=='users')return;const root=document.getElementById('viewRoot');if(!root)return;const rows=users.map(u=>{const active=u.isActive!==false&&u.is_active!==false;const self=String(u.id)===String(me().id||me().user_id);return `<tr><td><strong>${esc(u.name||'—')}</strong><div class="muted">${esc(u.phone||'')}</div></td><td>${esc(u.email||'—')}</td><td><span class="badge">${esc(roleLabel(u.role))}</span></td><td>${active?'<span class="badge badge-success">Active</span>':'<span class="badge badge-danger">Inactive</span>'}</td><td>${self?'<span class="muted">Current account</span>':`<div class="table-actions"><button class="btn btn-outline" data-user-action="edit" data-id="${esc(u.id)}">Edit</button><button class="btn btn-outline" data-user-action="password" data-id="${esc(u.id)}">Change Password</button><button class="btn btn-outline" data-user-action="toggle" data-id="${esc(u.id)}">${active?'Disable':'Enable'}</button><button class="btn btn-danger" data-user-action="delete" data-id="${esc(u.id)}">Delete</button></div>`}</td></tr>`}).join('');root.innerHTML=`<div class="user-admin-module"><div class="module-toolbar"><div><h2 style="margin:0">User Management</h2><p class="muted" style="margin:4px 0 0">Manage staff accounts without coding or database access.</p></div><div class="inline-group"><button class="btn btn-primary" data-user-action="add">+ Add User</button><button class="btn btn-outline" data-user-action="reset-all">Reset All Staff Passwords</button><button class="btn btn-outline" data-user-action="refresh">Refresh</button></div></div><section class="card section-card"><div style="overflow:auto"><table class="data-table"><thead><tr><th>User</th><th>Email</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead><tbody>${rows||'<tr><td colspan="5">No users found.</td></tr>'}</tbody></table></div></section></div>`}
  function modal(title,html,onSubmit){const wrap=document.createElement('div');wrap.style.cssText='position:fixed;inset:0;background:rgba(15,23,42,.60);z-index:10001;display:flex;align-items:center;justify-content:center;padding:20px';wrap.innerHTML=`<div style="background:#fff;border-radius:16px;width:min(680px,100%);padding:24px;max-height:90vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,.25)"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px"><h3 style="margin:0">${esc(title)}</h3><button type="button" class="btn btn-outline" data-close>Close</button></div>${html}</div>`;document.body.appendChild(wrap);wrap.querySelector('[data-close]').onclick=()=>wrap.remove();wrap.querySelector('form')?.addEventListener('submit',async e=>{e.preventDefault();await onSubmit(new FormData(e.target),wrap)});return wrap}
  function userForm(user=null){const editing=!!user;const opts=ROLES.map(r=>`<option value="${r[0]}" ${r[0]===(user?.role||'cashier')?'selected':''}>${r[1]}</option>`).join('');modal(editing?'Edit User':'Add User',`<form><div style="display:grid;grid-template-columns:1fr 1fr;gap:14px"><label>Full Name<input name="name" value="${esc(user?.name)}" required></label><label>Email<input name="email" type="email" value="${esc(user?.email)}" required></label><label>Phone<input name="phone" value="${esc(user?.phone)}"></label><label>Role<select name="role">${opts}</select></label><label>${editing?'New Password (optional)':'Password'}<input name="password" type="password" ${editing?'placeholder="Leave blank to keep current"':'required minlength="10"'}></label><label>Status<select name="is_active"><option value="true" ${(user?.isActive??user?.is_active??true)?'selected':''}>Active</option><option value="false" ${!(user?.isActive??user?.is_active??true)?'selected':''}>Inactive</option></select></label></div><div style="display:flex;justify-content:flex-end;margin-top:20px"><button class="btn btn-primary">${editing?'Save Changes':'Create User'}</button></div></form>`,async(fd,wrap)=>{const b=Object.fromEntries(fd.entries());b.is_active=b.is_active==='true';if(!b.password)delete b.password;try{if(editing)await api('/api/admin/users/'+encodeURIComponent(user.id),{method:'PATCH',body:JSON.stringify(b)});else await api('/api/admin/users',{method:'POST',body:JSON.stringify(b)});wrap.remove();await refresh();alert(editing?'User updated successfully.':'User created successfully.')}catch(e){alert(e.message)}})}
  async function changePassword(u){modal('Change Password for '+u.name,`<form><label>New Password<input name="password" type="password" minlength="10" required autofocus></label><p class="muted">Minimum 10 characters. The password is stored securely and is never displayed in the user list.</p><div style="display:flex;justify-content:flex-end;margin-top:20px"><button class="btn btn-primary">Change Password</button></div></form>`,async(fd,wrap)=>{try{await api('/api/admin/users/'+encodeURIComponent(u.id)+'/reset-password',{method:'POST',body:JSON.stringify({password:fd.get('password')})});wrap.remove();alert('Password changed successfully.')}catch(e){alert(e.message)}})}
  async function toggle(u){const active=u.isActive!==false&&u.is_active!==false;if(!confirm(`${active?'Disable':'Enable'} ${u.name}?`))return;try{await api('/api/admin/users/'+u.id,{method:'PATCH',body:JSON.stringify({is_active:!active})});await refresh()}catch(e){alert(e.message)}}
  async function remove(u){if(!confirm(`Delete ${u.name}? This cannot be undone.`))return;const reason=prompt('Reason for deletion (required):');if(!reason?.trim())return;try{await api('/api/admin/users/'+u.id,{method:'DELETE',body:JSON.stringify({reason})});await refresh();alert('User deleted successfully.')}catch(e){alert(e.message)}}
  async function resetAll(){const staff=cache.filter(u=>!['super_admin','business_owner'].includes(u.role)&&String(u.id)!==String(me().id||me().user_id));if(!staff.length)return alert('No eligible staff users found.');if(!confirm(`Generate new temporary passwords for ${staff.length} staff users?`))return;try{const r=await api('/api/admin/users/reset-all',{method:'POST'});const text=(r.users||[]).map(x=>`${x.name}: ${x.temporaryPassword}`).join('\n');alert('Temporary passwords — save these securely:\n\n'+text)}catch(e){alert(e.message)}}
  async function refresh(){try{render(await load())}catch(e){const root=document.getElementById('viewRoot');if(root)root.innerHTML=`<div class="card section-card"><h3>Unable to load User Management</h3><p>${esc(e.message)}</p><button class="btn btn-primary" data-user-action="refresh">Try Again</button></div>`}}

  function documentDeleteAllowed() {
    return ['business_owner','super_admin'].includes(String(me().role||'').toLowerCase());
  }

  function documentDeleteButton(type, id) {
    return `<button type="button" class="btn btn-danger" data-document-delete="${esc(type)}" data-id="${esc(id)}"><i class="fa-solid fa-trash"></i> Delete</button>`;
  }

  function injectDocumentDeleteButtons() {
    if (!documentDeleteAllowed()) return;
    const route = location.hash.replace(/^#/,'').split('?')[0];
    if (route === 'quotations') {
      document.querySelectorAll('[data-action="convert-quotation"]').forEach(button => {
        if (button.parentElement?.querySelector(`[data-document-delete="quotation"][data-id="${CSS.escape(button.dataset.id || '')}"]`)) return;
        const row = button.closest('tr');
        if (row && /\bconverted\b/i.test(row.textContent || '')) return;
        button.insertAdjacentHTML('afterend', documentDeleteButton('quotation', button.dataset.id));
      });
    }
    if (route === 'invoices') {
      document.querySelectorAll('[data-action="record-invoice-payment"]').forEach(button => {
        if (button.parentElement?.querySelector(`[data-document-delete="invoice"][data-id="${CSS.escape(button.dataset.id || '')}"]`)) return;
        const row = button.closest('tr');
        if (row && /\b(partial|paid)\b/i.test(row.textContent || '')) return;
        button.insertAdjacentHTML('afterend', documentDeleteButton('invoice', button.dataset.id));
      });
    }
  }

  async function deleteDocument(type, id, button) {
    if (!documentDeleteAllowed()) {
      alert('Only Super Admin or Business Owner can delete documents.');
      return;
    }
    const label = type === 'quotation' ? 'quotation' : 'invoice';
    if (!confirm(`Permanently delete this ${label}? This cannot be undone.`)) return;
    const reason = prompt(`Reason for deleting this ${label} (required):`);
    if (!reason || !reason.trim()) return;
    button.disabled = true;
    try {
      await api(`/api/${type === 'quotation' ? 'quotations' : 'invoices'}/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        body: JSON.stringify({ reason: reason.trim() })
      });
      const row = button.closest('tr');
      if (row) row.remove();
      alert(`${label.charAt(0).toUpperCase()+label.slice(1)} deleted successfully.`);
      window.dispatchEvent(new Event('hashchange'));
    } catch (e) {
      button.disabled = false;
      alert(e.message || `Unable to delete ${label}.`);
    }
  }

  document.addEventListener('click',async e=>{
    const b=e.target.closest('[data-user-action]');
    if(b){const a=b.dataset.userAction;if(a==='add')return userForm();if(a==='refresh')return refresh();if(a==='reset-all')return resetAll();const u=cache.find(x=>String(x.id)===String(b.dataset.id));if(!u)return;if(a==='edit')return userForm(u);if(a==='password')return changePassword(u);if(a==='toggle')return toggle(u);if(a==='delete')return remove(u)}
    const doc=e.target.closest('[data-document-delete]');
    if(doc)return deleteDocument(doc.dataset.documentDelete,doc.dataset.id,doc);
  });

  const observer = new MutationObserver(() => injectDocumentDeleteButtons());
  observer.observe(document.body, { childList: true, subtree: true });

  function watch(){
    if(allowed()&&location.hash.replace(/^#/,'')==='users')refresh();
    setTimeout(injectDocumentDeleteButtons, 50);
    setTimeout(injectDocumentDeleteButtons, 400);
  }
  window.addEventListener('hashchange',watch);setTimeout(watch,800);
})();
