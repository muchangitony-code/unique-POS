'use strict';

// Injects a small, self-contained admin user-management API into the bundled Express app.
function patchUserManagementRoutes(source) {
  if (source.includes('USER_MANAGEMENT_PATCH_V2')) return source;

  const expressMatch = source.match(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*express\(\)/)
    || source.match(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\(0,\s*[A-Za-z_$][\w$]*\.default\)\(\)/);
  if (!expressMatch) throw new Error('User management: Express app not found');
  const appVar = expressMatch[1];

  let listenIndex = source.lastIndexOf(`${appVar}.listen(`);
  if (listenIndex < 0) {
    const aliasRegex = new RegExp(`\\b(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*${appVar}\\s*;`, 'g');
    const aliases = [...source.matchAll(aliasRegex)];
    if (aliases.length) listenIndex = source.lastIndexOf(`${aliases[aliases.length - 1][1]}.listen(`);
  }
  if (listenIndex < 0) throw new Error('User management: application listen point not found');

  const code = [
    '// USER_MANAGEMENT_PATCH_V2',
    '(function installAdminUserManagement(){',
    "  const bcryptAdmin = require('bcryptjs');",
    "  const roles = new Set(['super_admin','business_owner','administrator','branch_manager','inventory_manager','storekeeper','cashier','sales_cashier','sales_rep','manager']);",
    '  const resultRows = value => value && Array.isArray(value.rows) ? value.rows : (Array.isArray(value) ? value : []);',
    '  const userId = req => { const n = Number.parseInt(String(req.params.id || ""), 10); return Number.isInteger(n) && n > 0 ? n : null; };',
    '  const topRole = role => role === "super_admin" || role === "business_owner";',
    '  const isOwner = req => String(req.user?.role || "") === "business_owner";',
    '  const isAdmin = req => ["administrator","business_owner","super_admin"].includes(String(req.user?.role || ""));',
    '  const requireAdmin = (req,res,next) => isAdmin(req) ? next() : res.status(403).json({error:"Administrator access required"});',
    '  const safeUser = u => u ? ({id:u.id,name:u.name,email:u.email,phone:u.phone,role:u.role,branchId:u.branchId ?? u.branch_id ?? null,branch:u.branch ?? null,isActive:u.isActive ?? u.is_active ?? true}) : null;',
    '  async function findUser(id){',
    '    const r = await db.execute(sql`SELECT id,name,email,phone,role,branch_id AS "branchId",branch,is_active AS "isActive" FROM users WHERE id=${id} LIMIT 1`);',
    '    return resultRows(r)[0] || null;',
    '  }',
    '  function generatedPassword(){ const chars="ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%"; const bytes=require("node:crypto").randomBytes(16); let out=""; for(const b of bytes) out += chars[b % chars.length]; return out; }',
    '',
    `  ${appVar}.get('/api/admin/users', requireAuth, requireAdmin, async (req,res) => {`,
    '    try {',
    '      const r = await db.execute(sql`SELECT id,name,email,phone,role,branch_id AS "branchId",branch,is_active AS "isActive" FROM users ORDER BY name ASC, id ASC`);',
    '      return res.json({users:resultRows(r).map(safeUser)});',
    '    } catch(error) { console.error("[admin/users] list failed",error); return res.status(500).json({error:"Unable to load users"}); }',
    '  });',
    '',
    `  ${appVar}.post('/api/admin/users', requireAuth, requireAdmin, async (req,res) => {`,
    '    try {',
    '      const b=req.body && typeof req.body === "object" ? req.body : {};',
    '      const name=String(b.name || "").trim(), email=String(b.email || "").trim().toLowerCase(), phone=String(b.phone || "").trim();',
    '      const role=String(b.role || "cashier").trim();',
    '      const password=String(b.password || "");',
    '      const branchId=b.branch_id == null || b.branch_id === "" ? null : Number.parseInt(String(b.branch_id),10);',
    '      if(!name || !email) return res.status(400).json({error:"Name and email are required"});',
    '      if(!roles.has(role)) return res.status(400).json({error:"Invalid user role"});',
    '      if(password.length < 10) return res.status(400).json({error:"Password must contain at least 10 characters"});',
    '      if(["super_admin","business_owner"].includes(role) && !isOwner(req)) return res.status(403).json({error:"Only Business Owner can create a top-level administrator"});',
    '      const duplicate=await db.execute(sql`SELECT id FROM users WHERE lower(email)=lower(${email}) LIMIT 1`);',
    '      if(resultRows(duplicate).length) return res.status(409).json({error:"Another user already uses that email address"});',
    '      const hash=await bcryptAdmin.hash(password,12);',
    '      const created=await db.execute(sql`INSERT INTO users (name,email,phone,role,branch_id,is_active,password_hash,password_changed_at,failed_login_attempts) VALUES (${name},${email},${phone || null},${role},${branchId || null},true,${hash},now(),0) RETURNING id,name,email,phone,role,branch_id AS "branchId",is_active AS "isActive"`);',
    '      const user=resultRows(created)[0];',
    '      if(typeof logAudit === "function") await logAudit(req,{action:"user.created",entityType:"user",entityId:user.id,description:"Created user",metadata:{role}});',
    '      return res.status(201).json({user:safeUser(user)});',
    '    } catch(error) { console.error("[admin/users] create failed",error); return res.status(500).json({error:"Unable to create user"}); }',
    '  });',
    '',
    `  ${appVar}.patch('/api/admin/users/:id', requireAuth, requireAdmin, async (req,res) => {`,
    '    try {',
    '      const id=userId(req); if(!id) return res.status(400).json({error:"Valid user id is required"});',
    '      const target=await findUser(id); if(!target) return res.status(404).json({error:"User not found"});',
    '      const b=req.body && typeof req.body === "object" ? req.body : {};',
    '      const name=b.name == null ? target.name : String(b.name).trim();',
    '      const email=b.email == null ? target.email : String(b.email).trim().toLowerCase();',
    '      const phone=b.phone == null ? target.phone : String(b.phone).trim();',
    '      const role=b.role == null ? target.role : String(b.role).trim();',
    '      const active=b.is_active == null ? Boolean(target.isActive) : Boolean(b.is_active);',
    '      const branchId=b.branch_id == null || b.branch_id === "" ? (b.branch_id == null ? target.branchId : null) : Number.parseInt(String(b.branch_id),10);',
    '      if(!name || !email) return res.status(400).json({error:"Name and email are required"});',
    '      if(!roles.has(role)) return res.status(400).json({error:"Invalid user role"});',
    '      if(id === Number(req.user?.userId || req.user?.id) && (!active || role !== target.role)) return res.status(400).json({error:"You cannot disable or change your own role"});',
    '      if(topRole(target.role) && !isOwner(req) && (role !== target.role || !active)) return res.status(403).json({error:"Only Business Owner can change a top-level administrator"});',
    '      if(topRole(role) && !isOwner(req) && role !== target.role) return res.status(403).json({error:"Only Business Owner can assign a top-level administrator role"});',
    '      const duplicate=await db.execute(sql`SELECT id FROM users WHERE lower(email)=lower(${email}) AND id<>${id} LIMIT 1`);',
    '      if(resultRows(duplicate).length) return res.status(409).json({error:"Another user already uses that email address"});',
    '      const updated=await db.execute(sql`UPDATE users SET name=${name},email=${email},phone=${phone || null},role=${role},branch_id=${branchId || null},is_active=${active} WHERE id=${id} RETURNING id,name,email,phone,role,branch_id AS "branchId",is_active AS "isActive"`);',
    '      const user=resultRows(updated)[0];',
    '      if(typeof logAudit === "function") await logAudit(req,{action:"user.updated",entityType:"user",entityId:id,description:"Updated user",metadata:{role,active}});',
    '      return res.json({user:safeUser(user)});',
    '    } catch(error) { console.error("[admin/users] update failed",error); return res.status(500).json({error:"Unable to update user"}); }',
    '  });',
    '',
    `  ${appVar}.post('/api/admin/users/:id/reset-password', requireAuth, requireAdmin, async (req,res) => {`,
    '    try {',
    '      const id=userId(req); if(!id) return res.status(400).json({error:"Valid user id is required"});',
    '      const target=await findUser(id); if(!target) return res.status(404).json({error:"User not found"});',
    '      if(topRole(target.role) && !isOwner(req)) return res.status(403).json({error:"Only Business Owner can reset a top-level administrator password"});',
    '      const password=String(req.body?.password || generatedPassword()); if(password.length < 10) return res.status(400).json({error:"Password must contain at least 10 characters"});',
    '      const hash=await bcryptAdmin.hash(password,12);',
    '      await db.execute(sql`UPDATE users SET password_hash=${hash},password_changed_at=now(),failed_login_attempts=0,locked_until=NULL WHERE id=${id}`);',
    '      if(typeof logAudit === "function") await logAudit(req,{action:"user.password_reset",entityType:"user",entityId:id,description:"Reset user password",metadata:{}});',
    '      return res.json({success:true,temporaryPassword:password});',
    '    } catch(error) { console.error("[admin/users] reset failed",error); return res.status(500).json({error:"Unable to reset password"}); }',
    '  });',
    '',
    `  ${appVar}.post('/api/admin/users/reset-all', requireAuth, requireAdmin, async (req,res) => {`,
    '    try {',
    '      const r=await db.execute(sql`SELECT id,name,role FROM users WHERE is_active=true AND role NOT IN (\'super_admin\',\'business_owner\') ORDER BY name`);',
    '      const users=resultRows(r), output=[];',
    '      for(const u of users){ const password=generatedPassword(); const hash=await bcryptAdmin.hash(password,12); await db.execute(sql`UPDATE users SET password_hash=${hash},password_changed_at=now(),failed_login_attempts=0,locked_until=NULL WHERE id=${u.id}`); output.push({id:u.id,name:u.name,temporaryPassword:password}); }',
    '      if(typeof logAudit === "function") await logAudit(req,{action:"user.passwords_reset_all",entityType:"user",description:"Reset all staff passwords",metadata:{count:output.length}});',
    '      return res.json({users:output});',
    '    } catch(error) { console.error("[admin/users] reset-all failed",error); return res.status(500).json({error:"Unable to reset staff passwords"}); }',
    '  });',
    '',
    `  ${appVar}.delete('/api/admin/users/:id', requireAuth, requireAdmin, async (req,res) => {`,
    '    try {',
    '      const id=userId(req); if(!id) return res.status(400).json({error:"Valid user id is required"});',
    '      const target=await findUser(id); if(!target) return res.status(404).json({error:"User not found"});',
    '      if(id === Number(req.user?.userId || req.user?.id)) return res.status(400).json({error:"You cannot delete your own account"});',
    '      if(topRole(target.role) && !isOwner(req)) return res.status(403).json({error:"Only Business Owner can delete a top-level administrator"});',
    '      await db.execute(sql`DELETE FROM users WHERE id=${id}`);',
    '      if(typeof logAudit === "function") await logAudit(req,{action:"user.deleted",entityType:"user",entityId:id,description:"Deleted user",metadata:{reason:String(req.body?.reason || "")}});',
    '      return res.sendStatus(204);',
    '    } catch(error) { console.error("[admin/users] delete failed",error); return res.status(500).json({error:"Unable to delete user"}); }',
    '  });',
    '})();',
    ''
  ].join('\n');

  return source.slice(0, listenIndex) + code + source.slice(listenIndex);
}

module.exports = { patchUserManagementRoutes };