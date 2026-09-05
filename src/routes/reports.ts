import { Router, type IRouter } from "express";
import { requireSuperAdmin } from "../lib/permissions";
import { db, salesTable, expensesTable, saleItemsTable, productsTable, categoriesTable, branchesTable, productStockTable } from "@workspace/db";
import { sql, gte, lte, and, eq, type SQL } from "drizzle-orm";
import { branchCondition, getBranchScope } from "../lib/branch-scope";
import { loadStockMap } from "../lib/stock";

const router: IRouter = Router();

/** Combine optional conditions (ignoring undefined) into a single WHERE clause. */
function combine(...conds: (SQL | undefined)[]): SQL | undefined {
  const list = conds.filter((c): c is SQL => c !== undefined);
  return list.length ? and(...list) : undefined;
}

router.get("/reports/sales-summary", async (req, res): Promise<void> => {
  const { from, to } = req.query as Record<string, string>;
  if (!from || !to) { res.status(400).json({ error: "from and to dates required" }); return; }
  const fromDate = new Date(from);
  const toDate = new Date(to);
  toDate.setHours(23, 59, 59);
  const salesBranch = branchCondition(salesTable.branchId, req);

  const [totals] = await db
    .select({
      total: sql<number>`coalesce(sum(${salesTable.total}::numeric), 0)`,
      count: sql<number>`count(*)`,
    })
    .from(salesTable)
    .where(combine(gte(salesTable.createdAt, fromDate), lte(salesTable.createdAt, toDate), salesBranch));

  const totalSales = Number(totals?.total ?? 0);
  const totalTransactions = Number(totals?.count ?? 0);

  const daily = await db
    .select({
      date: sql<string>`date(${salesTable.createdAt})`,
      total: sql<number>`coalesce(sum(${salesTable.total}::numeric), 0)`,
      count: sql<number>`count(*)`,
    })
    .from(salesTable)
    .where(combine(gte(salesTable.createdAt, fromDate), lte(salesTable.createdAt, toDate), salesBranch))
    .groupBy(sql`date(${salesTable.createdAt})`)
    .orderBy(sql`date(${salesTable.createdAt})`);

  // Compute payment method breakdown from actual data
  const byMethod = await db
    .select({
      method: salesTable.paymentMethod,
      amount: sql<number>`coalesce(sum(${salesTable.total}::numeric), 0)`,
      count: sql<number>`count(*)`,
    })
    .from(salesTable)
    .where(combine(gte(salesTable.createdAt, fromDate), lte(salesTable.createdAt, toDate), salesBranch))
    .groupBy(salesTable.paymentMethod);

  res.json({
    total_sales: totalSales,
    total_transactions: totalTransactions,
    average_order_value: totalTransactions > 0 ? totalSales / totalTransactions : 0,
    by_payment_method: byMethod.map((m) => ({ method: m.method, amount: Number(m.amount), count: Number(m.count) })),
    daily_breakdown: daily.map((d) => ({ date: d.date, total: Number(d.total), count: Number(d.count) })),
  });
});

router.get("/reports/profit-loss", async (req, res): Promise<void> => {
  const { from, to } = req.query as Record<string, string>;
  if (!from || !to) { res.status(400).json({ error: "from and to dates required" }); return; }
  const fromDate = new Date(from);
  const toDate = new Date(to);
  toDate.setHours(23, 59, 59);
  const salesBranch = branchCondition(salesTable.branchId, req);
  const expenseBranch = branchCondition(expensesTable.branchId, req);

  const [salesTotals] = await db
    .select({ total: sql<number>`coalesce(sum(${salesTable.total}::numeric), 0)` })
    .from(salesTable)
    .where(combine(gte(salesTable.createdAt, fromDate), lte(salesTable.createdAt, toDate), salesBranch));

  // Real COGS: sum(quantity × cost_price) for all items sold in the period
  const [cogsTotals] = await db
    .select({ total: sql<number>`coalesce(sum(${saleItemsTable.quantity} * ${productsTable.costPrice}::numeric), 0)` })
    .from(saleItemsTable)
    .innerJoin(productsTable, sql`${saleItemsTable.productId} = ${productsTable.id}`)
    .innerJoin(salesTable, sql`${saleItemsTable.saleId} = ${salesTable.id}`)
    .where(combine(gte(salesTable.createdAt, fromDate), lte(salesTable.createdAt, toDate), salesBranch));

  const [expenseTotals] = await db
    .select({ total: sql<number>`coalesce(sum(${expensesTable.amount}::numeric), 0)` })
    .from(expensesTable)
    .where(combine(gte(expensesTable.createdAt, fromDate), lte(expensesTable.createdAt, toDate), expenseBranch));

  const expenseByCategory = await db
    .select({
      category: expensesTable.category,
      amount: sql<number>`sum(${expensesTable.amount}::numeric)`,
    })
    .from(expensesTable)
    .where(combine(gte(expensesTable.createdAt, fromDate), lte(expensesTable.createdAt, toDate), expenseBranch))
    .groupBy(expensesTable.category);

  const revenue = Number(salesTotals?.total ?? 0);
  const cogs = Number(cogsTotals?.total ?? 0);
  const grossProfit = revenue - cogs;
  const expenses = Number(expenseTotals?.total ?? 0);
  const netProfit = grossProfit - expenses;

  res.json({
    revenue,
    cost_of_goods: cogs,
    gross_profit: grossProfit,
    gross_profit_margin: revenue > 0 ? (grossProfit / revenue) * 100 : 0,
    expenses,
    net_profit: netProfit,
    net_profit_margin: revenue > 0 ? (netProfit / revenue) * 100 : 0,
    expense_breakdown: expenseByCategory.map((e) => ({ category: e.category, amount: Number(e.amount) })),
  });
});

router.get("/reports/inventory-valuation", async (req, res): Promise<void> => {
  const products = await db.select().from(productsTable).orderBy(productsTable.productName);
  const categories = await db.select().from(categoriesTable);
  const catMap = Object.fromEntries(categories.map((c) => [c.id, c.name]));
  const scope = getBranchScope(req);
  const stockMap = await loadStockMap({ branchId: scope.branchId, all: scope.mode === "all" });
  let totalCostValue = 0;
  let totalSellingValue = 0;
  const items = products.map((p) => {
    const v = stockMap.get(p.id);
    const currentStock = v?.cur ?? 0;
    const minStock = v && v.min != null ? v.min : p.minStock;
    const costValue = currentStock * Number(p.costPrice);
    const sellingValue = currentStock * Number(p.sellingPrice);
    totalCostValue += costValue;
    totalSellingValue += sellingValue;
    return {
      product_id: p.id, product_name: p.productName, product_code: p.productCode,
      category_name: p.categoryId ? catMap[p.categoryId] : null,
      current_stock: currentStock, min_stock: minStock,
      cost_value: costValue, selling_value: sellingValue,
      status: currentStock === 0 ? "out_of_stock" : currentStock <= minStock ? "low" : "ok",
    };
  });
  res.json({ total_cost_value: totalCostValue, total_selling_value: totalSellingValue, potential_profit: totalSellingValue - totalCostValue, items });
});

/**
 * Branch comparison — super admins only. Ignores the active branch scope on
 * purpose: it always reports every active branch side by side so the whole
 * company can be compared on key metrics for the selected period.
 * Stock value is a point-in-time snapshot (like inventory-valuation); the
 * money metrics are filtered to [from, to].
 */
router.get("/reports/branch-comparison", requireSuperAdmin, async (req, res): Promise<void> => {
  const { from, to } = req.query as Record<string, string>;
  if (!from || !to) { res.status(400).json({ error: "from and to dates required" }); return; }
  const fromDate = new Date(from);
  const toDate = new Date(to);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    res.status(400).json({ error: "from and to must be valid dates" });
    return;
  }
  toDate.setHours(23, 59, 59);

  const branches = await db
    .select({ id: branchesTable.id, name: branchesTable.name, code: branchesTable.code })
    .from(branchesTable)
    .where(eq(branchesTable.isActive, true))
    .orderBy(branchesTable.name);

  // Sales total + transaction count per branch
  const salesRows = await db
    .select({
      branchId: salesTable.branchId,
      total: sql<number>`coalesce(sum(${salesTable.total}::numeric), 0)`,
      count: sql<number>`count(*)`,
    })
    .from(salesTable)
    .where(and(gte(salesTable.createdAt, fromDate), lte(salesTable.createdAt, toDate)))
    .groupBy(salesTable.branchId);

  // COGS per branch (kept separate to avoid row-multiplication from the join)
  const cogsRows = await db
    .select({
      branchId: salesTable.branchId,
      cogs: sql<number>`coalesce(sum(${saleItemsTable.quantity} * ${productsTable.costPrice}::numeric), 0)`,
    })
    .from(saleItemsTable)
    .innerJoin(productsTable, sql`${saleItemsTable.productId} = ${productsTable.id}`)
    .innerJoin(salesTable, sql`${saleItemsTable.saleId} = ${salesTable.id}`)
    .where(and(gte(salesTable.createdAt, fromDate), lte(salesTable.createdAt, toDate)))
    .groupBy(salesTable.branchId);

  // Expenses per branch
  const expenseRows = await db
    .select({
      branchId: expensesTable.branchId,
      total: sql<number>`coalesce(sum(${expensesTable.amount}::numeric), 0)`,
    })
    .from(expensesTable)
    .where(and(gte(expensesTable.createdAt, fromDate), lte(expensesTable.createdAt, toDate)))
    .groupBy(expensesTable.branchId);

  // Current stock value per branch (point-in-time snapshot)
  const stockRows = await db
    .select({
      branchId: productStockTable.branchId,
      costValue: sql<number>`coalesce(sum(${productStockTable.currentStock} * ${productsTable.costPrice}::numeric), 0)`,
      sellingValue: sql<number>`coalesce(sum(${productStockTable.currentStock} * ${productsTable.sellingPrice}::numeric), 0)`,
    })
    .from(productStockTable)
    .innerJoin(productsTable, sql`${productStockTable.productId} = ${productsTable.id}`)
    .groupBy(productStockTable.branchId);

  const salesMap = new Map(salesRows.map((r) => [r.branchId, r]));
  const cogsMap = new Map(cogsRows.map((r) => [r.branchId, Number(r.cogs)]));
  const expenseMap = new Map(expenseRows.map((r) => [r.branchId, Number(r.total)]));
  const stockMap = new Map(stockRows.map((r) => [r.branchId, r]));

  const rows = branches.map((b) => {
    const s = salesMap.get(b.id);
    const sales = Number(s?.total ?? 0);
    const transactions = Number(s?.count ?? 0);
    const cogs = cogsMap.get(b.id) ?? 0;
    const grossProfit = sales - cogs;
    const expenses = expenseMap.get(b.id) ?? 0;
    const netProfit = grossProfit - expenses;
    const stk = stockMap.get(b.id);
    return {
      branch_id: b.id,
      branch_name: b.name,
      branch_code: b.code,
      sales,
      transactions,
      cost_of_goods: cogs,
      gross_profit: grossProfit,
      gross_profit_margin: sales > 0 ? (grossProfit / sales) * 100 : 0,
      expenses,
      net_profit: netProfit,
      stock_cost_value: Number(stk?.costValue ?? 0),
      stock_selling_value: Number(stk?.sellingValue ?? 0),
    };
  });

  res.json({ branches: rows });
});

export default router;
