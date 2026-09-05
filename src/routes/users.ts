import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { hashPassword } from "../lib/auth";
import { requireRole } from "../lib/permissions";
import { getDefaultBranchId } from "../lib/branch-scope";
import { logAudit } from "../lib/audit";

const router: IRouter = Router();

function fmt(u: typeof usersTable.$inferSelect) {
  return { id: u.id, name: u.name, email: u.email, role: u.role, branch: u.branch, branch_id: u.branchId, phone: u.phone, is_active: u.isActive, created_at: u.createdAt };
}

router.get("/users", async (_req, res): Promise<void> => {
  const users = await db.select().from(usersTable).orderBy(usersTable.name);
  res.json(users.map(fmt));
});

router.post("/users", async (req, res): Promise<void> => {
  const { name, email, password, role, branch, branch_id, phone } = req.body;
  if (!name || !email || !password || !role) { res.status(400).json({ error: "name, email, password and role required" }); return; }
  const actorRole = (req as { user?: { role?: string } }).user?.role;
  if (role === "super_admin" && actorRole !== "super_admin") { res.status(403).json({ error: "Only a super admin can create super admin accounts" }); return; }
  const passwordHash = await hashPassword(password);
  const branchId = branch_id != null ? Number(branch_id) : await getDefaultBranchId();
  const [u] = await db.insert(usersTable).values({ name, email, passwordHash, role, branch, branchId, phone }).returning();
  await logAudit(req, { action: "user.created", entityType: "user", entityId: u.id, description: `Created user "${u.name}" (${u.email}) with role ${u.role}` });
  res.status(201).json(fmt(u));
});

router.get("/users/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [u] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!u) { res.status(404).json({ error: "User not found" }); return; }
  res.json(fmt(u));
});

router.patch("/users/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const { name, email, role, branch, branch_id, phone, is_active, password } = req.body;
  const [before] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!before) { res.status(404).json({ error: "User not found" }); return; }
  const actorRole = (req as { user?: { role?: string } }).user?.role;
  if (actorRole !== "super_admin" && (role === "super_admin" || before.role === "super_admin")) {
    res.status(403).json({ error: "Only a super admin can manage super admin accounts" }); return;
  }
  const updateData: Record<string, unknown> = {};
  if (name !== undefined) updateData.name = name;
  if (email !== undefined) updateData.email = email;
  if (role !== undefined) updateData.role = role;
  if (branch !== undefined) updateData.branch = branch;
  if (branch_id !== undefined) updateData.branchId = branch_id != null ? Number(branch_id) : null;
  if (phone !== undefined) updateData.phone = phone;
  if (is_active !== undefined) updateData.isActive = is_active;
  if (password) updateData.passwordHash = await hashPassword(password);
  const [u] = await db.update(usersTable).set(updateData).where(eq(usersTable.id, id)).returning();
  if (!u) { res.status(404).json({ error: "User not found" }); return; }
  const changes = Object.keys(updateData).filter(k => k !== "passwordHash");
  const beforeSnap = fmt(before);
  const afterSnap = fmt(u);
  const passwordChanged = !!password;
  await logAudit(req, { action: "user.updated", entityType: "user", entityId: u.id, description: `Updated user "${u.name}" — changed: ${changes.join(", ") || "password"}`, metadata: { before: beforeSnap, after: afterSnap, password_changed: passwordChanged } });
  res.json(afterSnap);
});

router.delete("/users/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [u] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  await db.delete(usersTable).where(eq(usersTable.id, id));
  await logAudit(req, { action: "user.deleted", entityType: "user", entityId: id, description: `Deleted user "${u?.name ?? id}" (${u?.email ?? ""})` });
  res.sendStatus(204);
});

export default router;
