import React, { useState, useEffect } from 'react';
import { 
  useGetSalesSummaryReport,
  useGetProfitLossReport,
  useGetInventoryValuationReport,
  useGetBranchComparisonReport,
  getGetBranchComparisonReportQueryKey
} from '@workspace/api-client-react';
import { formatCurrency } from '@/lib/format';
import { format, subDays } from 'date-fns';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Calendar, Printer } from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { COMPANY } from '@/lib/company';
import { useAuth } from '@/contexts/AuthContext';
import { isSuperAdmin } from '@/lib/permissions';

// Inject print-specific styles once on mount
const PRINT_CSS = `
  @media print {
    @page { margin: 12mm; size: A4 landscape; }
    body > * { visibility: hidden; }
    #reports-print-root, #reports-print-root * { visibility: visible; }
    #reports-print-root {
      position: fixed; inset: 0; background: white;
      z-index: 9999; padding: 24px 32px; overflow: visible;
    }
    .reports-print-hide { display: none !important; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
  @media screen {
    .reports-print-only { display: none; }
  }
`;

export default function Reports() {
  const [dateRange] = useState({
    from: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
    to: format(new Date(), 'yyyy-MM-dd'),
  });

  const { user } = useAuth();
  const isSuper = isSuperAdmin(user?.role);

  const { data: salesReport, isLoading: salesLoading } = useGetSalesSummaryReport({ from: dateRange.from, to: dateRange.to });
  const { data: plReport,    isLoading: plLoading    } = useGetProfitLossReport({ from: dateRange.from, to: dateRange.to });
  const { data: inventoryReport, isLoading: invLoading } = useGetInventoryValuationReport();
  const { data: comparison, isLoading: comparisonLoading } = useGetBranchComparisonReport(
    { from: dateRange.from, to: dateRange.to },
    { query: { enabled: isSuper, queryKey: getGetBranchComparisonReportQueryKey({ from: dateRange.from, to: dateRange.to }) } },
  );

  const comparisonRows = comparison?.branches ?? [];
  const comparisonTotals = comparisonRows.reduce(
    (acc, r) => ({
      sales: acc.sales + r.sales,
      transactions: acc.transactions + r.transactions,
      gross_profit: acc.gross_profit + r.gross_profit,
      expenses: acc.expenses + r.expenses,
      net_profit: acc.net_profit + r.net_profit,
      stock_cost_value: acc.stock_cost_value + r.stock_cost_value,
    }),
    { sales: 0, transactions: 0, gross_profit: 0, expenses: 0, net_profit: 0, stock_cost_value: 0 },
  );

  const COLORS = [
    'hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))',
    'hsl(var(--chart-4))', 'hsl(var(--chart-5))',
  ];

  // Inject print CSS via a <style> tag in <head> to avoid JSX template-literal parse issues
  useEffect(() => {
    const el = document.createElement('style');
    el.id = 'reports-print-css';
    el.textContent = PRINT_CSS;
    document.head.appendChild(el);
    return () => { document.head.removeChild(el); };
  }, []);

  const generatedDate = format(new Date(), 'dd MMM yyyy');

  return (
    <div id="reports-print-root" className="p-6 h-full flex flex-col space-y-6">

      {/* Print-only company header */}
      <div className="reports-print-only" style={{ borderBottom: '3px solid #1B4DA5', paddingBottom: 16, marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <img
              src={`${import.meta.env.BASE_URL}logo.jpg`}
              alt="Logo"
              style={{ width: 64, height: 64, objectFit: 'contain' }}
            />
            <div>
              <p style={{ fontWeight: 700, fontSize: 17, color: '#0D2A5E' }}>{COMPANY.name}</p>
              <p style={{ fontSize: 11, color: '#6B7280' }}>{COMPANY.address}, {COMPANY.city}</p>
              <p style={{ fontSize: 11, color: '#6B7280' }}>{COMPANY.phone} · {COMPANY.email}</p>
              <p style={{ fontSize: 11, color: '#6B7280' }}>KRA PIN: {COMPANY.kraPin}</p>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontWeight: 700, fontSize: 18, color: '#0D2A5E' }}>BUSINESS REPORTS</p>
            <p style={{ fontSize: 11, color: '#6B7280' }}>Generated: {generatedDate}</p>
            <p style={{ fontSize: 11, color: '#6B7280' }}>Period: Last 30 Days</p>
          </div>
        </div>
        <div style={{ height: 3, background: 'linear-gradient(90deg,#F5A500,#1B4DA5)', borderRadius: 2, marginTop: 16 }} />
      </div>

      {/* Screen header */}
      <div className="flex justify-between items-center reports-print-hide">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-primary">Business Reports</h2>
          <p className="text-muted-foreground flex items-center gap-2 mt-1">
            <Calendar className="w-4 h-4" />
            {' '}Last 30 Days ({format(new Date(dateRange.from), 'MMM d')} – {format(new Date(dateRange.to), 'MMM d, yyyy')})
          </p>
        </div>
        <Button variant="outline" onClick={() => window.print()}>
          <Printer className="w-4 h-4 mr-2" /> Export PDF
        </Button>
      </div>

      <Tabs defaultValue="sales" className="flex-1 flex flex-col">
        <TabsList className={`grid w-full ${isSuper ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'} md:w-auto md:inline-grid reports-print-hide`}>
          <TabsTrigger value="sales">Sales &amp; Revenue</TabsTrigger>
          <TabsTrigger value="pl">Profit &amp; Loss</TabsTrigger>
          <TabsTrigger value="inventory">Inventory Value</TabsTrigger>
          {isSuper && <TabsTrigger value="comparison">Branch Comparison</TabsTrigger>}
        </TabsList>

        <div className="mt-6 flex-1">
          <TabsContent value="sales" className="m-0 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Total Sales</CardTitle>
                </CardHeader>
                <CardContent>
                  {salesLoading
                    ? <Skeleton className="h-8 w-32" />
                    : <div className="text-3xl font-bold text-primary">{formatCurrency(salesReport?.total_sales || 0)}</div>}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Transactions</CardTitle>
                </CardHeader>
                <CardContent>
                  {salesLoading
                    ? <Skeleton className="h-8 w-16" />
                    : <div className="text-3xl font-bold">{salesReport?.total_transactions || 0}</div>}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Avg. Order Value</CardTitle>
                </CardHeader>
                <CardContent>
                  {salesLoading
                    ? <Skeleton className="h-8 w-24" />
                    : <div className="text-3xl font-bold">{formatCurrency(salesReport?.average_order_value || 0)}</div>}
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Card className="lg:col-span-2">
                <CardHeader><CardTitle>Daily Revenue</CardTitle></CardHeader>
                <CardContent className="h-[300px]">
                  {salesLoading ? <Skeleton className="h-full w-full" /> : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={salesReport?.daily_breakdown || []}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                        <XAxis dataKey="date" tickFormatter={(v) => format(new Date(v), 'dd MMM')} fontSize={12} stroke="hsl(var(--muted-foreground))" />
                        <YAxis fontSize={12} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `${v / 1000}k`} />
                        <RechartsTooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '8px' }} />
                        <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>By Payment Method</CardTitle></CardHeader>
                <CardContent className="h-[300px]">
                  {salesLoading ? <Skeleton className="h-full w-full" /> : (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={salesReport?.by_payment_method || []} dataKey="amount" nameKey="method" cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5}>
                          {salesReport?.by_payment_method?.map((_entry, index) => (
                            <Cell key={index} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <RechartsTooltip formatter={(v: number) => formatCurrency(v)} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                  <div className="grid grid-cols-2 gap-2 mt-4">
                    {salesReport?.by_payment_method?.map((m, i) => (
                      <div key={m.method} className="flex items-center text-xs">
                        <span className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                        <span className="capitalize">{m.method.replace('_', ' ')}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="pl" className="m-0 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Revenue</CardTitle>
                </CardHeader>
                <CardContent>
                  {plLoading ? <Skeleton className="h-8 w-full" /> : <div className="text-2xl font-bold">{formatCurrency(plReport?.revenue || 0)}</div>}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Cost of Goods (COGS)</CardTitle>
                </CardHeader>
                <CardContent>
                  {plLoading ? <Skeleton className="h-8 w-full" /> : <div className="text-2xl font-bold text-destructive">-{formatCurrency(plReport?.cost_of_goods || 0)}</div>}
                </CardContent>
              </Card>
              <Card className="bg-primary/5 border-primary/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-primary">Gross Profit</CardTitle>
                </CardHeader>
                <CardContent>
                  {plLoading ? <Skeleton className="h-8 w-full" /> : (
                    <div>
                      <div className="text-2xl font-bold text-primary">{formatCurrency(plReport?.gross_profit || 0)}</div>
                      <p className="text-xs text-muted-foreground mt-1">{plReport?.gross_profit_margin}% Margin</p>
                    </div>
                  )}
                </CardContent>
              </Card>
              <Card className="bg-chart-2/5 border-chart-2/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-chart-2">Net Profit</CardTitle>
                </CardHeader>
                <CardContent>
                  {plLoading ? <Skeleton className="h-8 w-full" /> : (
                    <div>
                      <div className="text-2xl font-bold text-chart-2">{formatCurrency(plReport?.net_profit || 0)}</div>
                      <p className="text-xs text-muted-foreground mt-1">After {formatCurrency(plReport?.expenses || 0)} expenses</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="inventory" className="m-0">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Total Cost Value</CardTitle>
                </CardHeader>
                <CardContent>
                  {invLoading ? <Skeleton className="h-8 w-full" /> : <div className="text-2xl font-bold">{formatCurrency(inventoryReport?.total_cost_value || 0)}</div>}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Total Retail Value</CardTitle>
                </CardHeader>
                <CardContent>
                  {invLoading ? <Skeleton className="h-8 w-full" /> : <div className="text-2xl font-bold text-primary">{formatCurrency(inventoryReport?.total_selling_value || 0)}</div>}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Potential Profit</CardTitle>
                </CardHeader>
                <CardContent>
                  {invLoading ? <Skeleton className="h-8 w-full" /> : <div className="text-2xl font-bold text-chart-2">{formatCurrency(inventoryReport?.potential_profit || 0)}</div>}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {isSuper && (
            <TabsContent value="comparison" className="m-0 space-y-4">
              {comparisonLoading ? (
                <Skeleton className="h-[400px] w-full" />
              ) : comparisonRows.length === 0 ? (
                <div className="text-center text-muted-foreground py-12">No branches to compare</div>
              ) : (
                <>
                  <Card>
                    <CardHeader><CardTitle>Net Profit &amp; Sales by Branch</CardTitle></CardHeader>
                    <CardContent className="h-[320px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={comparisonRows}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                          <XAxis dataKey="branch_name" fontSize={12} stroke="hsl(var(--muted-foreground))" />
                          <YAxis fontSize={12} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `${v / 1000}k`} />
                          <RechartsTooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '8px' }} />
                          <Legend />
                          <Bar dataKey="sales" name="Sales" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="net_profit" name="Net Profit" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader><CardTitle>Branch Metrics</CardTitle></CardHeader>
                    <CardContent>
                      <div className="relative w-full overflow-auto">
                        <table className="w-full caption-bottom text-sm">
                          <thead className="[&_tr]:border-b border-border">
                            <tr>
                              <th className="h-10 px-3 text-left align-middle font-medium text-muted-foreground">Branch</th>
                              <th className="h-10 px-3 text-right align-middle font-medium text-muted-foreground">Sales</th>
                              <th className="h-10 px-3 text-right align-middle font-medium text-muted-foreground">Txns</th>
                              <th className="h-10 px-3 text-right align-middle font-medium text-muted-foreground">Gross Profit</th>
                              <th className="h-10 px-3 text-right align-middle font-medium text-muted-foreground">Expenses</th>
                              <th className="h-10 px-3 text-right align-middle font-medium text-muted-foreground">Net Profit</th>
                              <th className="h-10 px-3 text-right align-middle font-medium text-muted-foreground">Stock Value</th>
                            </tr>
                          </thead>
                          <tbody className="[&_tr:last-child]:border-0">
                            {comparisonRows.map((r) => (
                              <tr key={r.branch_id} className="border-b border-border transition-colors hover:bg-muted/50">
                                <td className="p-3 align-middle font-medium">
                                  {r.branch_name} <span className="text-xs text-muted-foreground">({r.branch_code})</span>
                                </td>
                                <td className="p-3 align-middle text-right">{formatCurrency(r.sales)}</td>
                                <td className="p-3 align-middle text-right">{r.transactions}</td>
                                <td className="p-3 align-middle text-right">{formatCurrency(r.gross_profit)}</td>
                                <td className="p-3 align-middle text-right text-destructive">-{formatCurrency(r.expenses)}</td>
                                <td className={`p-3 align-middle text-right font-semibold ${r.net_profit >= 0 ? 'text-chart-2' : 'text-destructive'}`}>{formatCurrency(r.net_profit)}</td>
                                <td className="p-3 align-middle text-right">{formatCurrency(r.stock_cost_value)}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="border-t-2 border-border font-bold bg-muted/30">
                              <td className="p-3 align-middle">All Branches</td>
                              <td className="p-3 align-middle text-right">{formatCurrency(comparisonTotals.sales)}</td>
                              <td className="p-3 align-middle text-right">{comparisonTotals.transactions}</td>
                              <td className="p-3 align-middle text-right">{formatCurrency(comparisonTotals.gross_profit)}</td>
                              <td className="p-3 align-middle text-right text-destructive">-{formatCurrency(comparisonTotals.expenses)}</td>
                              <td className={`p-3 align-middle text-right ${comparisonTotals.net_profit >= 0 ? 'text-chart-2' : 'text-destructive'}`}>{formatCurrency(comparisonTotals.net_profit)}</td>
                              <td className="p-3 align-middle text-right">{formatCurrency(comparisonTotals.stock_cost_value)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}
            </TabsContent>
          )}
        </div>
      </Tabs>
    </div>
  );
}
