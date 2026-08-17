'use strict';

/**
 * Build-time patch for the bundled Express server.
 * Adds protected administrative routes to the runtime bundle.
 */
function patchUserManagementRoutes(source) {
  if (source.includes('USER_MANAGEMENT_PATCH_V1')) return source;

  const expressMatch = source.match(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*express\(\)/);
  if (!expressMatch) throw new Error('User management patch: could not locate Express application variable');
  const appVar = expressMatch[1];
  const listenMarker = `${appVar}.listen(`;
  const listenIndex = source.lastIndexOf(listenMarker);
  if (listenIndex < 0) throw new Error(`User management patch: could not locate ${listenMarker}`);

  // Keep the injected server code as an ordinary string. This deliberately
  // avoids nested template-literal parsing errors in this build-time patch.
  const injected = [
    '// USER_MANAGEMENT_PATCH_V1',
    '(function installNoCodeUserManagement() {',
    "  const bcryptUserAdmin = require('bcryptjs');",
    "  const allowedUserRoles = new Set(['super_admin','business_owner','branch_manager','inventory_manager','storekeeper','cashier','sales_cashier','sales_rep','manager','administrator']);",
    '  function rows(result) { return result?.rows ?? result ?? []; }',
    '  function idOf(req) { const n = Number.parseInt(String(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id), 10); return Number.isFinite(n) && n > 0 ? n : null; }',
    "  function topRole(role) { return role === 'super_admin' || role === 'business_owner'; }",
    "  function owner(req) { return req.user?.role === 'business_owner'; }",
    "  function canAccess(req, res, next) { const role = String(req.user?.role || ''); if (allowedUserRoles.has(role)) return next(); return res.status(403).json({ error: 'Only an administrator can manage users' }); }",
    "  function randomPassword() { const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%'; const bytes = require('node:crypto').randomBytes(16); let out = ''; for (const b of bytes) out += alphabet[b % alphabet.length]; return out; }",
    '  async function getUser(id) {',
    '    const result = await db.execute(sql`SELECT id, name, email, phone, role, branch_id AS "branchId", branch, is_active AS "isActive", password_changed_at AS "passwordChangedAt", failed_login_attempts AS "failedLoginAttempts", locked_until AS "lockedUntil" FROM users WHERE id = ${id} LIMIT 1`);',
    '    return rows(result)[0] ?? null;',
    '  }',
    '  async function countTop(excludeId) {',
    '    const result = await db.execute(sql`SELECT count(*)::int AS count FROM users WHERE is_active = true AND role IN (\'super_admin\',\'business_owner\') ${excludeId ? sql`AND id <> ${excludeId}` : sql``}`);',
    '    return Number(rows(result)[0]?.count ?? 0);',
    '  }',
    "  function validRole(role) { const value = String(role || '').trim(); return allowedUserRoles.has(value) ? value : null; }",
    "  ${APPVAR}.use('/api/admin/users', requireAuth, canAccess);",
    "  ${APPVAR}.patch('/api/admin/users/:id', async (req, res) => {",
    '    try {',
    '      const id = idOf(req); if (!id) return res.status(400).json({ error: \'Valid user id is required\' });',
    '      const target = await getUser(id); if (!target) return res.status(404).json({ error: \'User not found\' });',
    '      const body = req.body && typeof req.body === \'object\' ? req.body : {};',
    '      const name = body.name == null ? target.name : String(body.name).trim();',
    '      const email = body.email == null ? target.email : String(body.email).trim().toLowerCase();',
    '      const phone = body.phone == null ? target.phone : String(body.phone).trim();',
    '      const role = body.role == null ? target.role : validRole(body.role);',
    '      const branchId = body.branch_id === \'\' || body.branch_id == null ? (body.branch_id == null ? target.branchId : null) : Number.parseInt(String(body.branch_id), 10);',
    '      const active = body.is_active == null ? Boolean(target.isActive) : Boolean(body.is_active);',
    '      if (!name || !email) return res.status(400).json({ error: \'Name and email are required\' });',
    '      if (!role) return res.status(400).json({ error: \'Invalid user role\' });',
    '      if (body.branch_id != null && body.branch_id !== \'\' && !Number.isFinite(branchId)) return res.status(400).json({ error: \'Invalid branch id\' });',
    '      if (target.id === req.user?.userId && (!active || role !== target.role)) return res.status(400).json({ error: \'You cannot disable or change your own role\' });',
    '      if (topRole(target.role) && !owner(req) && (role !== target.role || !active)) return res.status(403).json({ error: \'Only Business Owner can change a top-level administrator\' });',
    '      if (topRole(role) && !owner(req) && role !== target.role) return res.status(403).json({ error: \'Only Business Owner can assign a top-level administrator role\' });',
    '      if (target.isActive && !active && topRole(target.role) && await countTop(target.id) < 1) return res.status(409).json({ error: \'Cannot deactivate the last active top-level administrator\' });',
    '      const duplicate = await db.execute(sql`SELECT id FROM users WHERE lower(email) = lower(${email}) AND id <> ${id} LIMIT 1`);',
    '      if (rows(duplicate).length) return res.status(409).json({ error: \'Another user already uses that email address\' });',
    '      const result = await db.execute(sql`UPDATE users SET name=${name}, email=${email}, phone=${phone || null}, role=${role}, branch_id=${branchId || null}, is_active=${active} WHERE id=${id} RETURNING id,name,email,phone,role,branch_id AS "branchId",branch,is_active AS "isActive"`);',
    "      const updated = rows(result)[0]; await logAudit(req, { action:'user.updated', entityType:'user', entityId:id, description:'Updated user', metadata:{ before:target, after:updated } });",
    '      return res.json(updated);',
    '    } catch (error) { console.error(\'[admin/users] update failed\', error); return res.status(500).json({ error: \'Unable to update user\' }); }',
    '  });',
    "  ${APPVAR}.post('/api/admin/users/:id/reset-password', async (req, res) => {",
    '    try {',
    '      const id = idOf(req); if (!id) return res.status(400).json({ error: \'Valid user id is required\' });',
    '      const target = await getUser(id); if (!target) return res.status(404).json({ error: \'User not found\' });',
    '      if (target.id === req.user?.userId) return res.status(400).json({ error: \'Use your own password-change flow for your account\' });',
    '      if (topRole(target.role) && !owner(req)) return res.status(403).json({ error: \'Only Business Owner can reset a top-level administrator password\' });',
    "      const password = String(req.body?.password || randomPassword()).trim(); if (password.length < 10) return res.status(400).json({ error: 'Password must contain at least 10 characters' });",
    '      const hash = await bcryptUserAdmin.hash(password, 12);',
    '      await db.execute(sql`UPDATE users SET password_hash=${hash}, password_changed_at=now(), failed_login_attempts=0, locked_until=NULL WHERE id=${id}`);',
    "      await logAudit(req, { action:'user.password_reset', entityType:'user', entityId:id, description:'Reset user password', metadata:{ generated: !req.body?.password } });",
    '      return res.json({ success:true, user_id:id, temporary_password:password });',
    '    } catch (error) { console.error(\'[admin/users] password reset failed\', error); return res.status(500).json({ error: \'Unable to reset user password\' }); }',
    '  });',
    "  ${APPVAR}.delete('/api/admin/users/:id', async (req, res) => {",
    '    try {',
    '      const id = idOf(req); if (!id) return res.status(400).json({ error: \'Valid user id is required\' });',
    '      const target = await getUser(id); if (!target) return res.status(404).json({ error: \'User not found\' });',
    '      if (target.id === req.user?.userId) return res.status(400).json({ error: \'You cannot delete your own account\' });',
    '      if (topRole(target.role) && !owner(req)) return res.status(403).json({ error: \'Only Business Owner can delete a top-level administrator\' });',
    '      if (topRole(target.role) && await countTop(target.id) < 1) return res.status(409).json({ error: \'Cannot delete the last active top-level administrator\' });',
    '      const reason = String(req.body?.reason || \'\').trim();',
    '      await db.execute(sql`DELETE FROM users WHERE id=${id}`);',
    "      await logAudit(req, { action:'user.deleted', entityType:'user', entityId:id, description:'Deleted user' + (reason ? ' — Reason: ' + reason : ''), metadata:{ reason } });",
    '      return res.sendStatus(204);',
    '    } catch (error) { console.error(\'[admin/users] delete failed\', error); return res.status(500).json({ error: \'Unable to delete user\' }); }',
    '  });',
    '})();',
    ''
  ].join('\n').replaceAll('${APPVAR}', appVar);

  return source.slice(0, listenIndex) + injected + source.slice(listenIndex);
}

module.exports = { patchUserManagementRoutes };
