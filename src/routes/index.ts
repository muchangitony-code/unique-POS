import { Router } from "express";
import { requireRole } from "../lib/permissions";
import healthRouter from "./health";
import authRouter from "./auth";
import dashboardRouter from "./dashboard";
import categoriesRouter from "./categories";
import brandsRouter from "./brands";
import productsRouter from "./products";
import productsImportRouter from "./products-import";
import inventoryRouter from "./inventory";
import purchasesRouter from "./purchases";
import customersRouter from "./customers";
import suppliersRouter from "./suppliers";
import quotationsRouter from "./quotations";
import invoicesRouter from "./invoices";
import expensesRouter from "./expenses";
import posRouter from "./pos";
import usersRouter from "./users";
import settingsRouter from "./settings";
import reportsRouter from "./reports";
import adminRouter from "./admin";
import backupsRouter from "./backups";
import auditLogRouter from "./audit-log";
import notificationsRouter from "./notifications";
import storageRouter from "./storage";
import branchesRouter from "./branches";
import securityRouter from "./security";

const router = Router();

// ─── Public / auth ───────────────────────────────────────────────────────────
router.use(healthRouter);
router.use(authRouter);
// Storage: object serving is public (branding images on login/print), the
// upload URL route is gated per-route by requireSuperAdmin inside the router.
router.use(storageRouter);

// ─── Role guards (path-prefixed so they only run for matching routes) ─────────
// Administrator only
router.use("/admin",     requireRole("administrator"));
router.use("/users",     requireRole("administrator"));
// NOTE: /settings is intentionally NOT blanket-guarded here — GET /settings must
// be readable by all authenticated users so documents (receipts/invoices) can
// render the latest payment details. Write guards are applied per-route in settings.ts.
router.use("/expenses",  requireRole("administrator"));
router.use("/audit-log", requireRole("administrator"));
router.use("/security",  requireRole("administrator"));

// Administrator + Manager
router.use("/reports", requireRole("administrator", "manager"));

// Administrator + Manager + Storekeeper
router.use("/products",   requireRole("administrator", "manager", "storekeeper"));
router.use("/inventory",  requireRole("administrator", "manager", "storekeeper"));
router.use("/purchases",  requireRole("administrator", "manager", "storekeeper"));
router.use("/suppliers",  requireRole("administrator", "manager", "storekeeper"));
router.use("/brands",     requireRole("administrator", "manager", "storekeeper"));
router.use("/categories", requireRole("administrator", "manager", "storekeeper"));

// Administrator + Manager + Sales/Cashier
router.use("/customers",  requireRole("administrator", "manager", "sales_cashier"));
router.use("/quotations", requireRole("administrator", "manager", "sales_cashier"));
router.use("/invoices",   requireRole("administrator", "manager", "sales_cashier"));

// Administrator + Sales/Cashier
router.use("/pos", requireRole("administrator", "sales_cashier"));

// ─── Route routers ────────────────────────────────────────────────────────────
router.use("/notifications", requireRole("administrator"));
router.use(auditLogRouter);
router.use(notificationsRouter);
router.use(adminRouter);
router.use(backupsRouter);
router.use(dashboardRouter);
router.use(categoriesRouter);
router.use(brandsRouter);
router.use(productsRouter);
router.use(productsImportRouter);
router.use(inventoryRouter);
router.use(purchasesRouter);
router.use(customersRouter);
router.use(suppliersRouter);
router.use(quotationsRouter);
router.use(invoicesRouter);
router.use(expensesRouter);
router.use(posRouter);
router.use(usersRouter);
router.use(settingsRouter);
router.use(reportsRouter);
// Branches: readable by any authenticated user (to know their own branch);
// create/update/delete are gated by requireSuperAdmin inside the router.
router.use(branchesRouter);
router.use(securityRouter);

export default router;

