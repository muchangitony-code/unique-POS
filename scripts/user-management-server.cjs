'use strict';

/**
 * Build-time patch for the bundled Express server.
 *
 * Adds a protected administrative API for editing, disabling, deleting and
 * resetting POS users without requiring database or source-code access.
 * The patch is applied to index.runtime.cjs by scripts/build.cjs; index.cjs
 * remains the canonical generated application bundle.
 */

function patchUserManagementRoutes(source) {
  if (source.includes('USER_MANAGEMENT_PATCH_V1')) return source;

  const expressMatch = source.match(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*express\(\)/);
  if (!expressMatch) throw new Error('User management patch: could not locate Express application variable');
  const appVar = expressMatch[1];
  const listenMarker = `${appVar}.listen(`;
  const listenIndex = source.lastIndexOf(listenMarker);
  if (listenIndex < 0) throw new Error(`User management patch: could not locate ${listenMarker}`);

  const injected = String.raw`
// USER_MANAGEMENT_PATCH_V1
(function installNoCodeUserManagement() {
  const bcryptUserAdmin = require('bcryptjs');
  const allowedUserRoles = new Set([
    'super_admin', 'business_owner', 'branch_manager', 'inventory_manager',
    'storekeeper', 'cashier', 'sales_cashier', 'sales_rep', 'manager', 'administrator'
  ]);

  function userAdminRows(result) {
    return result?.rows ?? result ?? [];
  }

  function userAdminId(req) {
    const value = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = Number.parseInt(String(value), 10);
    return Number.isFinite(id) && id > 0 ? id : null;
  }

  function userAdminTopRole(role) {
    return role === 'super_admin' || role === 'business_owner';
  }

  function userAdminIsOwner(req) {
    return req.user?.role === 'business_owner';
  }

  function userAdminCanAccess(req, res, next) {
    const role = String(req.user?.role || '');
    if (allowedUserRoles.has(role)) return next();
    return res.status(403).json({ error: 'Only an administrator can manage users' });
  }

  function userAdminRandomPassword() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
    const bytes = require('node:crypto').randomBytes(16);
    let out = '';
    for (let i = 0; i < bytes.length; i++) out += alphabet[bytes[i] % alphabet.length];
    return out;
  }

  async function getManagedUser(id) {
    const result = await db.execute(sql`
      SELECT id, name, email, phone, role,
             branch_id AS "branchId", branch,
             is_active AS "isActive",
             password_changed_at AS "passwordChangedAt",
             failed_login_attempts AS "failedLoginAttempts",
             locked_until AS "lockedUntil"
      FROM users WHERE id = ${id} LIMIT 1
    `);
    return userAdminRows(result)[0] ?? null;
  }

  async function countActiveTopAdmins(excludeId = null) {
    const result = await db.execute(sql`
      SELECT count(*)::int AS count
      FROM users
      WHERE is_active = true
        AND role IN ('super_admin', 'business_owner')
        ${excludeId ? sql`AND id <> ${excludeId}` : sql``}
    `);
    return Number(userAdminRows(result)[0]?.count ?? 0);
  }

  function validateManagedRole(role) {
    const value = String(role || '').trim();
    if (!allowedUserRoles.has(value)) return null;
    return value;
  }

  ${appVar}.use('/api/admin/users', requireAuth, userAdminCanAccess);

  ${appVar}.patch('/api/admin/users/:id', async (req, res) => {
    try {
      const id = userAdminId(req);
      if (!id) return res.status(400).json({ error: 'Valid user id is required' });
      const target = await getManagedUser(id);
      if (!target) return res.status(404).json({ error: 'User not found' });

      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const name = body.name == null ? target.name : String(body.name).trim();
      const email = body.email == null ? target.email : String(body.email).trim().toLowerCase();
      const phone = body.phone == null ? target.phone : String(body.phone).trim();
      const role = body.role == null ? target.role : validateManagedRole(body.role);
      const branchId = body.branch_id === '' || body.branch_id == null
        ? (body.branch_id == null ? target.branchId : null)
        : Number.parseInt(String(body.branch_id), 10);
      const isActive = body.is_active == null ? Boolean(target.isActive) : Boolean(body.is_active);

      if (!name || !email) return res.status(400).json({ error: 'Name and email are required' });
      if (!role) return res.status(400).json({ error: 'Invalid user role' });
      if (body.branch_id != null && body.branch_id !== '' && !Number.isFinite(branchId)) {
        return res.status(400).json({ error: 'Invalid branch id' });
      }
      if (target.id === req.user?.userId && (!isActive || role !== target.role)) {
        return res.status(400).json({ error: 'You cannot disable or change your own role from User Management' });
      }
      if (userAdminTopRole(target.role) && !userAdminIsOwner(req) && (role !== target.role || !isActive)) {
        return res.status(403).json({ error: 'Only Business Owner can change or deactivate a top-level administrator' });
      }
      if (userAdminTopRole(role) && !userAdminIsOwner(req) && role !== target.role) {
        return res.status(403).json({ error: 'Only Business Owner can assign a top-level administrator role' });
      }
      if (target.role !== role && userAdminTopRole(target.role) && await countActiveTopAdmins(target.id) < 1) {
        return res.status(409).json({ error: 'At least one active top-level administrator must remain' });
      }
      if (target.isActive && !isActive && userAdminTopRole(target.role) && await countActiveTopAdmins(target.id) < 1) {
        return res.status(409).json({ error: 'Cannot deactivate the last active top-level administrator' });
      }

      const duplicate = await db.execute(sql`
        SELECT id FROM users
        WHERE lower(email) = lower(${email}) AND id <> ${id}
        LIMIT 1
      `);
      if (userAdminRows(duplicate).length) return res.status(409).json({ error: 'Another user already uses that email address' });

      const result = await db.execute(sql`
        UPDATE users
        SET name = ${name},
            email = ${email},
            phone = ${phone || null},
            role = ${role},
            branch_id = ${branchId || null},
            is_active = ${isActive}
        WHERE id = ${id}
        RETURNING id, name, email, phone, role,
                  branch_id AS "branchId", branch,
                  is_active AS "isActive",
                  password_changed_at AS "passwordChangedAt"
      `);
      const updated = userAdminRows(result)[0];
      await logAudit(req, {
        action: 'user.updated',
        entityType: 'user',
        entityId: id,
        description: `Updated user "${target.name}" (${target.email})`,
        metadata: { before: target, after: updated }
      });
      return res.json(updated);
    } catch (error) {
      console.error('[admin/users] update failed', error);
      return res.status(500).json({ error: 'Unable to update user' });
    }
  });

  ${appVar}.post('/api/admin/users/:id/reset-password', async (req, res) => {
    try {
      const id = userAdminId(req);
      if (!id) return res.status(400).json({ error: 'Valid user id is required' });
      const target = await getManagedUser(id);
      if (!target) return res.status(404).json({ error: 'User not found' });
      if (target.id === req.user?.userId) return res.status(400).json({ error: 'Use your own password-change flow for your account' });
      if (userAdminTopRole(target.role) && !userAdminIsOwner(req)) {
        return res.status(403).json({ error: 'Only Business Owner can reset a top-level administrator password' });
      }

      const supplied = String(req.body?.password || '').trim();
      const temporaryPassword = supplied || userAdminRandomPassword();
      if (temporaryPassword.length < 10) return res.status(400).json({ error: 'Password must contain at least 10 characters' });
      const passwordHash = await bcryptUserAdmin.hash(temporaryPassword, 12);
      await db.execute(sql`
        UPDATE users
        SET password_hash = ${passwordHash},
            password_changed_at = now(),
            failed_login_attempts = 0,
            locked_until = NULL
        WHERE id = ${id}
      `);
      await logAudit(req, {
        action: 'user.password_reset',
        entityType: 'user',
        entityId: id,
        description: `Reset password for user "${target.name}" (${target.email})`,
        metadata: { generated: !supplied }
      });
      return res.json({ success: true, user_id: id, temporary_password: temporaryPassword });
    } catch (error) {
      console.error('[admin/users] password reset failed', error);
      return res.status(500).json({ error: 'Unable to reset user password' });
    }
  });

  ${appVar}.post('/api/admin/users/reset-all', async (req, res) => {
    try {
      const includeTopLevel = Boolean(req.body?.include_top_level) && userAdminIsOwner(req);
      const result = await db.execute(sql`
        SELECT id, name, email, role
        FROM users
        WHERE id <> ${req.user?.userId ?? 0}
          AND is_active = true
          ${includeTopLevel ? sql`` : sql`AND role NOT IN ('super_admin', 'business_owner')`}
        ORDER BY name, id
      `);
      const targets = userAdminRows(result);
      const reset = [];
      for (const target of targets) {
        const temporaryPassword = userAdminRandomPassword();
        const passwordHash = await bcryptUserAdmin.hash(temporaryPassword, 12);
        await db.execute(sql`
          UPDATE users
          SET password_hash = ${passwordHash},
              password_changed_at = now(),
              failed_login_attempts = 0,
              locked_until = NULL
          WHERE id = ${target.id}
        `);
        reset.push({ id: target.id, name: target.name, email: target.email, role: target.role, temporary_password: temporaryPassword });
        await logAudit(req, {
          action: 'user.password_reset',
          entityType: 'user',
          entityId: target.id,
          description: `Reset password during bulk staff password reset for "${target.name}" (${target.email})`,
          metadata: { generated: true, bulk: true }
        });
      }
      return res.json({ success: true, count: reset.length, users: reset });
    } catch (error) {
      console.error('[admin/users] bulk password reset failed', error);
      return res.status(500).json({ error: 'Unable to reset staff passwords' });
    }
  });

  ${appVar}.delete('/api/admin/users/:id', async (req, res) => {
    try {
      const id = userAdminId(req);
      if (!id) return res.status(400).json({ error: 'Valid user id is required' });
      const target = await getManagedUser(id);
      if (!target) return res.status(404).json({ error: 'User not found' });
      if (target.id === req.user?.userId) return res.status(400).json({ error: 'You cannot delete your own account from User Management' });
      if (userAdminTopRole(target.role) && !userAdminIsOwner(req)) {
        return res.status(403).json({ error: 'Only Business Owner can delete a top-level administrator' });
      }
      if (userAdminTopRole(target.role) && await countActiveTopAdmins(target.id) < 1) {
        return res.status(409).json({ error: 'Cannot delete the last active top-level administrator' });
      }
      const { reason } = req.body || {};
      await db.execute(sql`DELETE FROM users WHERE id = ${id}`);
      await logAudit(req, {
        action: 'user.deleted',
        entityType: 'user',
        entityId: id,
        description: `Deleted user "${target.name}" (${target.email})${reason ? ` — Reason: ${String(reason).trim()}` : ''}`,
        metadata: { reason: reason || null }
      });
      return res.sendStatus(204);
    } catch (error) {
      console.error('[admin/users] delete failed', error);
      return res.status(500).json({ error: 'Unable to delete user' });
    }
  });
})();

`;

  return source.slice(0, listenIndex) + injected + source.slice(listenIndex);
}

module.exports = { patchUserManagementRoutes };