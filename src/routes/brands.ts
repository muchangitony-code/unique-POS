import { Router, type IRouter } from "express";
import { requireRole } from "../lib/permissions";
import { eq } from "drizzle-orm";
import { db, brandsTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/brands", async (_req, res): Promise<void> => {
  const brands = await db.select().from(brandsTable).orderBy(brandsTable.name);
  res.json(brands.map((b) => ({ id: b.id, name: b.name, description: b.description, created_at: b.createdAt })));
});

router.post("/brands", async (req, res): Promise<void> => {
  const { name, description } = req.body;
  if (!name) { res.status(400).json({ error: "Name required" }); return; }
  const [b] = await db.insert(brandsTable).values({ name, description }).returning();
  res.status(201).json({ id: b.id, name: b.name, description: b.description, created_at: b.createdAt });
});

router.patch("/brands/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const { name, description } = req.body;
  const [b] = await db.update(brandsTable).set({ name, description }).where(eq(brandsTable.id, id)).returning();
  if (!b) { res.status(404).json({ error: "Brand not found" }); return; }
  res.json({ id: b.id, name: b.name, description: b.description, created_at: b.createdAt });
});

router.delete("/brands/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  await db.delete(brandsTable).where(eq(brandsTable.id, id));
  res.sendStatus(204);
});

export default router;
