import { Router, type IRouter } from "express";
import { db, salesTable, productsTable, customersTable, suppliersTable, invoicesTable, expensesTable, saleItemsTable } from "@workspace/db";
import { sql, gte, and, type SQL } from "drizzle-orm";
import { branchCondition, getBranchScope } from "../lib/branch-scope";
import { loadStockMap } from "../lib/stock";

const router: IRouter = Router();

/** Combine optional conditions (ignoring undefined) into a single WHERE clause. */
function combine(...conds: (SQL | undefined)[]): SQL | undefined {
  const list = conds.filter((c): c is SQL => c !== undefined);
  return list.length ? and(...list) : undefined;
}

router.get("/dashboard/stats", async (req, res): Promise<void> => {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const salesBranch = branchCondition(salesTable.branchId, req);

  const [todaySales] = await db
    .select({ total: sql<number>`coalesce(sum(${salesTable.total}::numeric), 0)` })
    .from(salesTable)
    .where(combine(gte(salesTable.createdAt, todayStart), salesBranch));

  const [monthlySales] = await db
    .select({ total: sql<number>`coalesce(sum(${salesTable.total}::numeric), 0)` })
    .from(salesTable)
    .where(combine(gte(salesTable.createdAt, monthStart), salesBranch));

  // Real COGS: sum(quantity × cost_price) for all items sold this month
  const [monthlyCogs] = await db
    .select({ total: sql<number>`coalesce(sum(${saleItemsTable.quantity} * ${productsTable.costPrice}::numeric), 0)` })
    .from(saleItemsTable)
    .innerJoin(productsTable, sql`${saleItemsTable.productId} = ${productsTable.id}`)
    .innerJoin(salesTable, sql`${saleItemsTable.saleId} = ${salesTable.id}`)
    .where(combine(gte(salesTable.createdAt, monthStart), salesBranch));

  // Low stock is per-branch — computed from product_stock for the current scope.
  const scope = getBranchScope(req);
  const stockMap = await loadStockMap({ branchId: scope.branchId, all: scope.mode === "all" });
  const prods = await db.select({ id: productsTable.id, minStock: productsTable.minStock }).from(productsTable);
  let lowStockCount = 0;
  for (const pr of prods) {
    const v = stockMap.get(pr.id);
    const cur = v?.cur ?? 0;
    const min = v && v.min != null ? v.min : pr.minStock;
    if (cur <= min) lowStockCount++;
  }

  const [customerBal] = await db
    .select({ total: sql<number>`coalesce(sum(${customersTable.balance}::numeric), 0)` })
    .from(customersTable)
    .where(branchCondition(customersTable.branchId, req));

  const [supplierBal] = await db
    .select({ total: sql<number>`coalesce(sum(${suppliersTable.balance}::numeric), 0)` })
    .from(suppliersTable)
    .where(branchCondition(suppliersTable.branchId, req));

  const [totalProducts] = await db
    .select({ count: sql<number>`count(*)` })
    .from(productsTable);

  const [pendingInvoices] = await db
    .select({ count: sql<number>`count(*)` })
    .from(invoicesTable)
    .where(combine(sql`${invoicesTable.status} in ('draft','sent','partial','overdue')`, branchCondition(invoicesTable.branchId, req)));

  const monthlySalesTotal = Number(monthlySales?.total ?? 0);
  const grossProfitTotal = monthlySalesTotal - Number(monthlyCogs?.total ?? 0);
  res.json({
    today_sales: Number(todaySales?.total ?? 0),
    monthly_sales: monthlySalesTotal,
    gross_profit: grossProfitTotal,
    low_stock_count: lowStockCount,
    customer_balance: Number(customerBal?.total ?? 0),
    supplier_balance: Number(supplierBal?.total ?? 0),
    total_products: Number(totalProducts?.count ?? 0),
    pending_invoices: Number(pendingInvoices?.count ?? 0),
    today_sales_change: 0,
    monthly_sales_change: 0,
    gross_profit_margin: monthlySalesTotal > 0 ? (grossProfitTotal / monthlySalesTotal) * 100 : 0,
  });
});

router.get("/dashboard/recent-transactions", async (req, res): Promise<void> => {
  const sales = await db
    .select()
    .from(salesTable)
    .where(branchCondition(salesTable.branchId, req))
    .orderBy(sql`${salesTable.createdAt} desc`)
    .limit(10);

  const invoices = await db
    .select()
    .from(invoicesTable)
    .where(branchCondition(invoicesTable.branchId, req))
    .orderBy(sql`${invoicesTable.createdAt} desc`)
    .limit(5);

  const combined = [
    ...sales.map((s) => ({
      id: s.id,
      type: "sale" as const,
      reference: s.receiptNumber,
      customer_name: null,
      supplier_name: null,
      amount: Number(s.total),
      date: s.createdAt,
      status: s.status,
    })),
    ...invoices.map((i) => ({
      id: i.id + 10000,
      type: "invoice" as const,
      reference: i.invoiceNumber,
      customer_name: null,
      supplier_name: null,
      amount: Number(i.total),
      date: i.createdAt,
      status: i.status,
    })),
  ]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 10);

  res.json(combined);
});

router.get("/dashboard/sales-chart", async (req, res): Promise<void> => {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const salesBranch = branchCondition(salesTable.branchId, req);

  // Daily revenue
  const revenueRows = await db
    .select({
      date: sql<string>`date(${salesTable.createdAt})`,
      sales: sql<number>`coalesce(sum(${salesTable.total}::numeric), 0)`,
    })
    .from(salesTable)
    .where(combine(gte(salesTable.createdAt, thirtyDaysAgo), salesBranch))
    .groupBy(sql`date(${salesTable.createdAt})`)
    .orderBy(sql`date(${salesTable.createdAt})`);

  // Daily COGS (kept separate to avoid row-multiplication from the join)
  const cogsRows = await db
    .select({
      date: sql<string>`date(${salesTable.createdAt})`,
      cogs: sql<number>`coalesce(sum(${saleItemsTable.quantity} * ${productsTable.costPrice}::numeric), 0)`,
    })
    .from(saleItemsTable)
    .innerJoin(productsTable, sql`${saleItemsTable.productId} = ${productsTable.id}`)
    .innerJoin(salesTable, sql`${saleItemsTable.saleId} = ${salesTable.id}`)
    .where(combine(gte(salesTable.createdAt, thirtyDaysAgo), salesBranch))
    .groupBy(sql`date(${salesTable.createdAt})`)
    .orderBy(sql`date(${salesTable.createdAt})`);

  const cogsMap = Object.fromEntries(cogsRows.map((r) => [r.date, Number(r.cogs)]));

  res.json(
    revenueRows.map((r) => ({
      date: r.date,
      sales: Number(r.sales),
      profit: Number(r.sales) - (cogsMap[r.date] ?? 0),
    }))
  );
});

router.get("/dashboard/top-products", async (req, res): Promise<void> => {
  const salesBranch = branchCondition(salesTable.branchId, req);
  const rows = await db
    .select({
      product_id: saleItemsTable.productId,
      quantity_sold: sql<number>`sum(${saleItemsTable.quantity})`,
      revenue: sql<number>`sum(${saleItemsTable.total}::numeric)`,
    })
    .from(saleItemsTable)
    .innerJoin(salesTable, sql`${saleItemsTable.saleId} = ${salesTable.id}`)
    .where(salesBranch)
    .groupBy(saleItemsTable.productId)
    .orderBy(sql`sum(${saleItemsTable.total}::numeric) desc`)
    .limit(5);

  const withNames = await Promise.all(
    rows.map(async (r) => {
      const [p] = await db
        .select({ productName: productsTable.productName })
        .from(productsTable)
        .where(sql`${productsTable.id} = ${r.product_id}`);
      return {
        product_id: r.product_id,
        product_name: p?.productName ?? "Unknown",
        quantity_sold: Number(r.quantity_sold),
        revenue: Number(r.revenue),
      };
    })
  );

  res.json(withNames);
});

export default router;
