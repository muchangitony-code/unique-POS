import React from 'react';
import { 
  useGetDashboardStats, 
  useGetRecentTransactions, 
  useGetSalesChart, 
  useGetTopProducts,
  useGetBackupStatus,
  getGetBackupStatusQueryKey,
  getGetDashboardStatsQueryKey,
  getGetRecentTransactionsQueryKey,
  getGetSalesChartQueryKey,
  getGetTopProductsQueryKey,
} from '@workspace/api-client-react';
import { useAuth } from '@/contexts/AuthContext';
import { 
  Banknote, 
  TrendingUp, 
  AlertTriangle, 
  Package, 
  Users, 
  Truck, 
  FileWarning, 
  Activity,
  DatabaseBackup,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { 
  Area, 
  AreaChart, 
  CartesianGrid, 
  ResponsiveContainer, 
  Tooltip as RechartsTooltip, 
  XAxis, 
  YAxis 
} from 'recharts';
import { formatCurrency } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { format, formatDistanceToNow } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useLocation } from 'wouter';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const ADMIN_ROLES = new Set(['super_admin', 'business_owner']);

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const isAdmin = !!user && ADMIN_ROLES.has(user.role);

  const { data: stats, isLoading: statsLoading } = useGetDashboardStats({ query: { queryKey: getGetDashboardStatsQueryKey(), refetchInterval: 30000 } });
  const { data: recentTransactions, isLoading: transactionsLoading } = useGetRecentTransactions({ query: { queryKey: getGetRecentTransactionsQueryKey(), refetchInterval: 30000 } });
  const { data: salesChart, isLoading: chartLoading } = useGetSalesChart({ query: { queryKey: getGetSalesChartQueryKey(), refetchInterval: 60000 } });
  const { data: topProducts, isLoading: productsLoading } = useGetTopProducts({ query: { queryKey: getGetTopProductsQueryKey(), refetchInterval: 60000 } });
  const { data: backupStatus, isLoading: backupLoading, isError: backupError } = useGetBackupStatus({
    query: { enabled: isAdmin, queryKey: getGetBackupStatusQueryKey() },
  });

  const renderStatCard = (title: string, value: string | number, icon: React.ElementType, change?: number, loading?: boolean) => (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        {React.createElement(icon, { className: "h-4 w-4 text-muted-foreground" })}
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-1/2 mt-1" />
        ) : (
          <>
            <div className="text-2xl font-bold" data-testid={`stat-${title.toLowerCase().replace(/ /g, '-')}`}>{value}</div>
            {change !== undefined && (
              <p className={`text-xs mt-1 ${change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {change >= 0 ? '+' : ''}{change}% from last month
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="p-6 space-y-6">
      {/* Stat Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {renderStatCard("Today's Sales", stats ? formatCurrency(stats.today_sales) : 0, Banknote, stats?.today_sales_change, statsLoading)}
        {renderStatCard("Monthly Sales", stats ? formatCurrency(stats.monthly_sales) : 0, TrendingUp, stats?.monthly_sales_change, statsLoading)}
        {renderStatCard("Gross Profit", stats ? formatCurrency(stats.gross_profit) : 0, Activity, stats?.gross_profit_margin, statsLoading)}
        {renderStatCard("Total Products", stats?.total_products ?? 0, Package, undefined, statsLoading)}
        
        {renderStatCard("Customer Balance", stats ? formatCurrency(stats.customer_balance) : 0, Users, undefined, statsLoading)}
        {renderStatCard("Supplier Balance", stats ? formatCurrency(stats.supplier_balance) : 0, Truck, undefined, statsLoading)}
        {renderStatCard("Low Stock Items", stats?.low_stock_count ?? 0, AlertTriangle, undefined, statsLoading)}
        {renderStatCard("Pending Invoices", stats?.pending_invoices ?? 0, FileWarning, undefined, statsLoading)}
      </div>

      {/* Backup Health Card — admin only */}
      {isAdmin && (
        <Card
          className="cursor-pointer hover:bg-muted/30 transition-colors"
          onClick={() => setLocation('/settings?tab=backups')}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Last Backup</CardTitle>
            <DatabaseBackup className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {backupLoading ? (
              <Skeleton className="h-8 w-2/3 mt-1" />
            ) : backupError ? (
              <div className="flex items-center gap-2">
                <XCircle className="h-5 w-5 text-muted-foreground shrink-0" />
                <p className="text-sm text-muted-foreground">Could not load backup status</p>
              </div>
            ) : !backupStatus?.hasBackup ? (
              <div className="flex items-center gap-2">
                <XCircle className="h-5 w-5 text-destructive shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-destructive">No backups found</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Go to Settings → Database Backups to run one</p>
                </div>
              </div>
            ) : backupStatus.stale ? (
              <div className="flex items-center gap-2">
                <XCircle className="h-5 w-5 text-amber-500 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                    {backupStatus.latest!.filename}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatDistanceToNow(new Date(backupStatus.latest!.createdAt), { addSuffix: true })} · {formatBytes(backupStatus.latest!.size)} · <span className="text-amber-500 font-medium">Overdue — last backup &gt;48 h ago</span>
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                <div>
                  <p className="text-sm font-semibold">
                    {backupStatus.latest!.filename}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatDistanceToNow(new Date(backupStatus.latest!.createdAt), { addSuffix: true })} · {formatBytes(backupStatus.latest!.size)}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-7">
        {/* Chart */}
        <Card className="md:col-span-4">
          <CardHeader>
            <CardTitle>Sales & Profit Overview (30 Days)</CardTitle>
          </CardHeader>
          <CardContent className="h-[350px]">
            {chartLoading ? (
              <Skeleton className="h-full w-full" />
            ) : salesChart && salesChart.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={salesChart}>
                  <defs>
                    <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="date" 
                    tickFormatter={(val) => format(new Date(val), 'dd MMM')}
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis 
                    tickFormatter={(val) => `KES ${val / 1000}k`}
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                  />
                  <RechartsTooltip 
                    formatter={(value: number) => formatCurrency(value)}
                    labelFormatter={(label) => format(new Date(label), 'dd MMM yyyy')}
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
                  />
                  <Area type="monotone" dataKey="sales" stroke="hsl(var(--primary))" fillOpacity={1} fill="url(#colorSales)" name="Sales" />
                  <Area type="monotone" dataKey="profit" stroke="hsl(var(--chart-2))" fillOpacity={1} fill="url(#colorProfit)" name="Profit" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground">No data available</div>
            )}
          </CardContent>
        </Card>

        {/* Top Products */}
        <Card className="md:col-span-3">
          <CardHeader>
            <CardTitle>Top Products</CardTitle>
          </CardHeader>
          <CardContent>
            {productsLoading ? (
              <div className="space-y-4">
                {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : (
              <ScrollArea className="h-[300px]">
                <div className="space-y-4 pr-4">
                  {topProducts?.map((product) => (
                    <div key={product.product_id} className="flex items-center justify-between">
                      <div className="flex flex-col overflow-hidden">
                        <span className="text-sm font-medium truncate" title={product.product_name}>{product.product_name}</span>
                        <span className="text-xs text-muted-foreground">{product.quantity_sold} units sold</span>
                      </div>
                      <span className="text-sm font-semibold shrink-0 ml-4">{formatCurrency(product.revenue)}</span>
                    </div>
                  ))}
                  {topProducts?.length === 0 && (
                    <div className="text-center text-muted-foreground text-sm mt-4">No top products</div>
                  )}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Transactions */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          {transactionsLoading ? (
            <div className="space-y-4">
              {[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : (
            <div className="relative w-full overflow-auto">
              <table className="w-full caption-bottom text-sm">
                <thead className="[&_tr]:border-b border-border">
                  <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                    <th className="h-10 px-4 text-left align-middle font-medium text-muted-foreground">Type</th>
                    <th className="h-10 px-4 text-left align-middle font-medium text-muted-foreground">Reference</th>
                    <th className="h-10 px-4 text-left align-middle font-medium text-muted-foreground">Date</th>
                    <th className="h-10 px-4 text-left align-middle font-medium text-muted-foreground">Amount</th>
                    <th className="h-10 px-4 text-left align-middle font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody className="[&_tr:last-child]:border-0">
                  {recentTransactions?.map((tx) => (
                    <tr key={`${tx.type}-${tx.id}`} className="border-b border-border transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                      <td className="p-4 align-middle">
                        <Badge variant={tx.type === 'sale' ? 'default' : tx.type === 'expense' ? 'destructive' : 'secondary'} className="capitalize">
                          {tx.type}
                        </Badge>
                      </td>
                      <td className="p-4 align-middle font-medium">{tx.reference}</td>
                      <td className="p-4 align-middle">{format(new Date(tx.date), 'dd MMM yyyy')}</td>
                      <td className="p-4 align-middle">{formatCurrency(tx.amount)}</td>
                      <td className="p-4 align-middle">
                        <Badge variant="outline" className="capitalize">{tx.status}</Badge>
                      </td>
                    </tr>
                  ))}
                  {recentTransactions?.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-4 text-center text-muted-foreground">No recent transactions</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
