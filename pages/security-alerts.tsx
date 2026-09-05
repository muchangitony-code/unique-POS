import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ShieldAlert,
  AlertTriangle,
  Info,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  RefreshCw,
  Search,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface AlertNotification {
  id: number;
  created_at: string;
  title: string;
  body: string;
  severity: 'info' | 'warning' | 'critical';
  rule_id: string;
  audit_log_id: number | null;
  read_at: string | null;
}

interface AlertsPage {
  data: AlertNotification[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  rules: string[];
}

function SeverityBadge({ severity }: { severity: string }) {
  if (severity === 'critical') {
    return (
      <Badge className="gap-1 bg-destructive/10 text-destructive border-destructive/30 hover:bg-destructive/20">
        <ShieldAlert className="h-3 w-3" />
        Critical
      </Badge>
    );
  }
  if (severity === 'warning') {
    return (
      <Badge className="gap-1 bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100">
        <AlertTriangle className="h-3 w-3" />
        Warning
      </Badge>
    );
  }
  return (
    <Badge className="gap-1 bg-blue-50 text-blue-700 border-blue-300 hover:bg-blue-100">
      <Info className="h-3 w-3" />
      Info
    </Badge>
  );
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-KE', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

const PAGE_SIZES = [10, 25, 50, 100];

export default function SecurityAlertsPage() {
  const { token } = useAuth();

  const [page, setPage] = React.useState(1);
  const [limit, setLimit] = React.useState(25);
  const [severity, setSeverity] = React.useState<string>('');
  const [ruleId, setRuleId] = React.useState<string>('');
  const [dateFrom, setDateFrom] = React.useState('');
  const [dateTo, setDateTo] = React.useState('');
  // Pending state for search bar
  const [searchInput, setSearchInput] = React.useState('');

  const authHeader = React.useMemo<Record<string, string>>(() => {
    const h: Record<string, string> = {};
    if (token) h['Authorization'] = `Bearer ${token}`;
    return h;
  }, [token]);

  const params = React.useMemo(() => {
    const p = new URLSearchParams();
    p.set('page', String(page));
    p.set('limit', String(limit));
    if (severity)  p.set('severity', severity);
    if (ruleId)    p.set('rule_id', ruleId);
    if (dateFrom)  p.set('date_from', dateFrom);
    if (dateTo)    p.set('date_to', dateTo);
    return p.toString();
  }, [page, limit, severity, ruleId, dateFrom, dateTo]);

  const { data, isLoading, isFetching, refetch } = useQuery<AlertsPage>({
    queryKey: ['security-alerts', params],
    queryFn: async () => {
      const res = await fetch(`/api/notifications/all?${params}`, { headers: authHeader });
      if (!res.ok) throw new Error('Failed to load alerts');
      return res.json();
    },
    placeholderData: (prev) => prev,
  });

  function applyFilter() {
    setPage(1);
  }

  function clearFilters() {
    setSeverity('');
    setRuleId('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  }

  const hasFilters = !!(severity || ruleId || dateFrom || dateTo);

  const alerts = data?.data ?? [];
  const totalPages = data?.totalPages ?? 1;
  const total = data?.total ?? 0;
  const rules = data?.rules ?? [];

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Security Alerts</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Full history of security rule triggers and admin notifications
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={cn('h-4 w-4 mr-2', isFetching && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="rounded-lg border bg-card p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Severity */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Severity</label>
            <Select value={severity || 'all'} onValueChange={(v) => { setSeverity(v === 'all' ? '' : v); setPage(1); }}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="All severities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All severities</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
                <SelectItem value="info">Info</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Rule */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Alert Rule</label>
            <Select value={ruleId || 'all'} onValueChange={(v) => { setRuleId(v === 'all' ? '' : v); setPage(1); }}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="All rules" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All rules</SelectItem>
                {rules.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Date from */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">From date</label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              className="h-9"
            />
          </div>

          {/* Date to */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">To date</label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              className="h-9"
            />
          </div>
        </div>

        {hasFilters && (
          <div className="mt-3 flex justify-end">
            <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground">
              Clear filters
            </Button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-card overflow-hidden">
        {/* Table header summary */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b bg-muted/30">
          <span className="text-sm text-muted-foreground">
            {isLoading ? 'Loading…' : `${total.toLocaleString()} alert${total !== 1 ? 's' : ''}`}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Rows per page</span>
            <Select value={String(limit)} onValueChange={(v) => { setLimit(Number(v)); setPage(1); }}>
              <SelectTrigger className="h-7 w-16 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZES.map((s) => (
                  <SelectItem key={s} value={String(s)}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/20">
                <th className="text-left font-medium text-muted-foreground px-4 py-3 w-28">Severity</th>
                <th className="text-left font-medium text-muted-foreground px-4 py-3">Title / Body</th>
                <th className="text-left font-medium text-muted-foreground px-4 py-3 hidden md:table-cell">Rule</th>
                <th className="text-left font-medium text-muted-foreground px-4 py-3 hidden lg:table-cell w-44">Timestamp</th>
                <th className="text-left font-medium text-muted-foreground px-4 py-3 w-24">Audit Log</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    <td className="px-4 py-3"><Skeleton className="h-5 w-20" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-5 w-full" /></td>
                    <td className="px-4 py-3 hidden md:table-cell"><Skeleton className="h-5 w-32" /></td>
                    <td className="px-4 py-3 hidden lg:table-cell"><Skeleton className="h-5 w-36" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-5 w-16" /></td>
                  </tr>
                ))
              ) : alerts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-16 text-center text-muted-foreground">
                    <Search className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="font-medium">No alerts found</p>
                    {hasFilters && (
                      <p className="text-xs mt-1 opacity-70">
                        Try adjusting the filters above
                      </p>
                    )}
                  </td>
                </tr>
              ) : (
                alerts.map((alert) => (
                  <tr
                    key={alert.id}
                    className={cn(
                      'transition-colors hover:bg-muted/40',
                      !alert.read_at && 'bg-muted/20'
                    )}
                  >
                    <td className="px-4 py-3">
                      <SeverityBadge severity={alert.severity} />
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <p className={cn('font-medium leading-tight', !alert.read_at ? 'text-foreground' : 'text-muted-foreground')}>
                        {alert.title}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
                        {alert.body}
                      </p>
                      {/* Show rule + timestamp inline on small screens */}
                      <p className="text-[10px] text-muted-foreground/60 mt-1 md:hidden">
                        {alert.rule_id} · {formatDateTime(alert.created_at)}
                      </p>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                        {alert.rule_id}
                      </code>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-xs text-muted-foreground whitespace-nowrap">
                      {formatDateTime(alert.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      {alert.audit_log_id != null ? (
                        <Link href={`/audit-log?id=${alert.audit_log_id}`}>
                          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-primary">
                            <ExternalLink className="h-3 w-3" />
                            #{ alert.audit_log_id}
                          </Button>
                        </Link>
                      ) : (
                        <span className="text-xs text-muted-foreground/50">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t px-4 py-3 bg-muted/10">
            <span className="text-xs text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              {/* Page number pills — show up to 5 around current page */}
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((n) => n === 1 || n === totalPages || Math.abs(n - page) <= 2)
                .reduce<(number | 'ellipsis')[]>((acc, n, idx, arr) => {
                  if (idx > 0 && n - (arr[idx - 1] as number) > 1) acc.push('ellipsis');
                  acc.push(n);
                  return acc;
                }, [])
                .map((item, idx) =>
                  item === 'ellipsis' ? (
                    <span key={`e-${idx}`} className="px-1 text-muted-foreground text-xs">…</span>
                  ) : (
                    <Button
                      key={item}
                      variant={item === page ? 'default' : 'outline'}
                      size="icon"
                      className="h-7 w-7 text-xs"
                      onClick={() => setPage(item as number)}
                    >
                      {item}
                    </Button>
                  )
                )}
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
