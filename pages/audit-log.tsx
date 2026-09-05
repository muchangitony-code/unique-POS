import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RefreshCw, Search, Download, FileDown, FileText, ChevronDown, ChevronRight, GitCompare } from 'lucide-react';

interface AuditEntry {
  id: number;
  created_at: string;
  actor_name: string | null;
  actor_role: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  description: string;
  ip_address: string | null;
  metadata: Record<string, unknown> | null;
}

interface AuditPage {
  data: AuditEntry[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const ACTION_COLORS: Record<string, string> = {
  'auth.login':        'bg-green-100 text-green-800',
  'auth.login_failed': 'bg-red-100 text-red-800',
  'sale.created':      'bg-blue-100 text-blue-800',
  'product.created':   'bg-purple-100 text-purple-800',
  'product.updated':   'bg-yellow-100 text-yellow-800',
  'product.deleted':   'bg-red-100 text-red-800',
  'user.created':      'bg-purple-100 text-purple-800',
  'user.updated':      'bg-yellow-100 text-yellow-800',
  'user.deleted':      'bg-red-100 text-red-800',
  'purchase.created':  'bg-blue-100 text-blue-800',
  'purchase.received': 'bg-green-100 text-green-800',
  'invoice.created':   'bg-blue-100 text-blue-800',
  'invoice.payment':   'bg-green-100 text-green-800',
  'expense.created':   'bg-orange-100 text-orange-800',
  'expense.deleted':   'bg-red-100 text-red-800',
  'stock.received':    'bg-green-100 text-green-800',
  'stock.adjusted':    'bg-yellow-100 text-yellow-800',
  'stock.transferred': 'bg-blue-100 text-blue-800',
  'settings.updated':  'bg-gray-100 text-gray-800',
};

function actionColor(action: string) {
  return ACTION_COLORS[action] ?? 'bg-gray-100 text-gray-700';
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString('en-KE', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return String(v);
}

function labelKey(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function BeforeAfterDiff({ before, after }: { before: Record<string, unknown>; after: Record<string, unknown> }) {
  const allKeys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
  const changedKeys = allKeys.filter(k => {
    const b = formatValue(before[k]);
    const a = formatValue(after[k]);
    return b !== a;
  });

  if (changedKeys.length === 0) {
    return <p className="text-xs text-muted-foreground italic">No field-level changes recorded.</p>;
  }

  return (
    <table className="text-xs w-full border-collapse">
      <thead>
        <tr className="text-muted-foreground">
          <th className="text-left py-1 pr-4 font-medium w-36">Field</th>
          <th className="text-left py-1 pr-4 font-medium">Before</th>
          <th className="text-left py-1 font-medium">After</th>
        </tr>
      </thead>
      <tbody>
        {changedKeys.map(key => (
          <tr key={key} className="border-t border-border/50">
            <td className="py-1 pr-4 text-muted-foreground font-medium whitespace-nowrap">{labelKey(key)}</td>
            <td className="py-1 pr-4 text-red-700 dark:text-red-400 font-mono break-all">{formatValue(before[key])}</td>
            <td className="py-1 text-green-700 dark:text-green-400 font-mono break-all">{formatValue(after[key])}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MetadataPanel({ metadata }: { metadata: Record<string, unknown> }) {
  const before = metadata.before as Record<string, unknown> | undefined;
  const after = metadata.after as Record<string, unknown> | undefined;

  if (before && after) {
    const passwordChanged = metadata.password_changed === true;
    const reference = typeof metadata.reference === 'string' ? metadata.reference : undefined;
    return (
      <div className="mt-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Changes</p>
        <BeforeAfterDiff before={before} after={after} />
        {passwordChanged && (
          <p className="text-xs text-muted-foreground mt-1 italic">Password was also changed.</p>
        )}
        {reference && (
          <p className="text-xs text-muted-foreground mt-1">Reference: <span className="font-mono">{reference}</span></p>
        )}
      </div>
    );
  }

  // Fallback: render raw metadata keys
  const displayKeys = Object.keys(metadata).filter(k => k !== 'before' && k !== 'after');
  if (!displayKeys.length) return null;
  return (
    <div className="mt-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Details</p>
      {displayKeys.map(k => (
        <p key={k} className="text-xs text-muted-foreground">
          <span className="font-medium">{labelKey(k)}:</span>{' '}
          <span className="font-mono">{JSON.stringify(metadata[k])}</span>
        </p>
      ))}
    </div>
  );
}

const ENTITY_FILTERS = ['', 'sale', 'product', 'user', 'purchase', 'invoice', 'expense', 'settings'];

export default function AuditLogPage() {
  const { token } = useAuth();
  const [data, setData] = React.useState<AuditPage | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [page, setPage] = React.useState(1);
  const [actor, setActor] = React.useState('');
  const [entity, setEntity] = React.useState('');
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');
  const [hasChanges, setHasChanges] = React.useState(false);
  const [expanded, setExpanded] = React.useState<Set<number>>(new Set());

  const authHeader = token ? `Bearer ${token}` : '';

  const load = React.useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: '50' });
      if (actor)      params.set('actor', actor);
      if (entity)     params.set('entity', entity);
      if (from)       params.set('from', from);
      if (to)         params.set('to', to + 'T23:59:59');
      if (hasChanges) params.set('hasChanges', '1');
      const res = await fetch(`/api/audit-log?${params}`, { headers: { Authorization: authHeader } });
      if (res.ok) { setData(await res.json()); setPage(p); setExpanded(new Set()); }
    } finally { setLoading(false); }
  }, [actor, entity, from, to, hasChanges, authHeader]);

  React.useEffect(() => { load(1); }, []); // eslint-disable-line

  const toggleExpand = (id: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const hasDiff = (entry: AuditEntry) =>
    entry.metadata && typeof entry.metadata === 'object' &&
    ('before' in entry.metadata || Object.keys(entry.metadata).length > 0);

  const [exporting, setExporting] = React.useState(false);
  const [exportingPdf, setExportingPdf] = React.useState(false);
  const [exportProgress, setExportProgress] = React.useState<{ current: number; total: number } | null>(null);

  const buildExportParams = () => {
    const params = new URLSearchParams();
    if (actor)      params.set('actor', actor);
    if (entity)     params.set('entity', entity);
    if (from)       params.set('from', from);
    if (to)         params.set('to', to + 'T23:59:59');
    if (hasChanges) params.set('hasChanges', '1');
    return params;
  };

  const exportAllCsv = async () => {
    setExporting(true);
    setExportProgress(null);
    try {
      const res = await fetch(`/api/audit-log/export?${buildExportParams()}`, { headers: { Authorization: authHeader } });
      if (!res.ok) { alert('Export failed. Please try again.'); return; }

      const totalRows = parseInt(res.headers.get('X-Total-Rows') ?? '0', 10);
      setExportProgress({ current: 0, total: totalRows });

      // Stream body chunk-by-chunk, counting newlines to track row progress
      const reader = res.body?.getReader();
      const chunks: Uint8Array[] = [];
      let rowsSeen = -1; // start at -1 to skip the header row
      const decoder = new TextDecoder();

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          const text = decoder.decode(value, { stream: true });
          const newlines = (text.match(/\n/g) ?? []).length;
          rowsSeen += newlines;
          setExportProgress({ current: Math.max(0, rowsSeen), total: totalRows });
        }
      }

      const blob = new Blob(chunks as BlobPart[], { type: 'text/csv' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    } finally {
      setExporting(false);
      setExportProgress(null);
    }
  };

  const exportPdf = async () => {
    setExportingPdf(true);
    try {
      const res = await fetch(`/api/audit-log/export-pdf?${buildExportParams()}`, { headers: { Authorization: authHeader } });
      if (!res.ok) { alert('PDF export failed. Please try again.'); return; }
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.pdf`;
      a.click();
      URL.revokeObjectURL(a.href);
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h2 className="text-2xl font-bold tracking-tight">Audit Log</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => load(page)} disabled={loading}>
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={exportAllCsv} disabled={exporting || !data}>
            {exporting
              ? <><RefreshCw className="h-4 w-4 mr-1 animate-spin" /> Exporting…</>
              : <><FileDown className="h-4 w-4 mr-1" /> Export CSV</>
            }
          </Button>

          <Button variant="outline" size="sm" onClick={exportPdf} disabled={exportingPdf || !data}>
            {exportingPdf
              ? <><RefreshCw className="h-4 w-4 mr-1 animate-spin" /> Generating…</>
              : <><FileText className="h-4 w-4 mr-1" /> Export PDF</>
            }
          </Button>
        </div>
      </div>

      {/* CSV export progress */}
      {exportProgress && (
        <div className="rounded-lg border bg-card px-4 py-3 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-foreground">
              {exportProgress.total > 0
                ? `Exported ${exportProgress.current.toLocaleString()} of ${exportProgress.total.toLocaleString()} rows…`
                : 'Downloading…'}
            </span>
            {exportProgress.total > 0 && (
              <span className="text-xs text-muted-foreground">
                {Math.round((exportProgress.current / exportProgress.total) * 100)}%
              </span>
            )}
          </div>
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-150"
              style={{
                width: exportProgress.total > 0
                  ? `${Math.min(100, Math.round((exportProgress.current / exportProgress.total) * 100))}%`
                  : '100%',
                animation: exportProgress.total === 0 ? 'pulse 1.5s ease-in-out infinite' : undefined,
              }}
            />
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-end">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Actor</span>
          <Input placeholder="Search actor…" value={actor} onChange={e => setActor(e.target.value)} className="w-40 h-8 text-sm" />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Entity type</span>
          <Select value={entity} onValueChange={setEntity}>
            <SelectTrigger className="w-36 h-8 text-sm"><SelectValue placeholder="All" /></SelectTrigger>
            <SelectContent>
              {ENTITY_FILTERS.map(e => <SelectItem key={e} value={e}>{e || 'All'}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">From</span>
          <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-36 h-8 text-sm" />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">To</span>
          <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-36 h-8 text-sm" />
        </div>
        <div className="flex flex-col gap-1 self-end">
          <button
            type="button"
            onClick={() => setHasChanges(v => !v)}
            className={`flex items-center gap-1.5 h-8 px-3 rounded-md border text-sm font-medium transition-colors
              ${hasChanges
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background text-foreground border-input hover:bg-muted'
              }`}
            aria-pressed={hasChanges}
          >
            <GitCompare className="h-3.5 w-3.5" />
            Has changes
          </button>
        </div>
        <Button size="sm" onClick={() => load(1)} className="h-8 self-end">
          <Search className="h-4 w-4 mr-1" /> Search
        </Button>
      </div>

      {/* Table */}
      <div className="bg-card border rounded-lg overflow-auto">
        <table className="w-full text-sm text-left min-w-[800px]">
          <thead className="text-xs text-muted-foreground bg-muted/50 uppercase border-b">
            <tr>
              <th className="px-4 py-3 w-8"></th>
              <th className="px-4 py-3 whitespace-nowrap">Time (EAT)</th>
              <th className="px-4 py-3">Actor</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3">IP</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-b">
                  <td colSpan={6} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                </tr>
              ))
            ) : data?.data.length ? (
              data.data.map(entry => (
                <React.Fragment key={entry.id}>
                  <tr
                    className={`border-b transition-colors ${hasDiff(entry) ? 'cursor-pointer hover:bg-muted/40' : 'hover:bg-muted/20'}`}
                    onClick={() => hasDiff(entry) && toggleExpand(entry.id)}
                  >
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {hasDiff(entry) ? (
                        expanded.has(entry.id)
                          ? <ChevronDown className="h-4 w-4" />
                          : <ChevronRight className="h-4 w-4" />
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap font-mono text-xs text-muted-foreground">{formatTime(entry.created_at)}</td>
                    <td className="px-4 py-2.5">
                      <span className="font-medium">{entry.actor_name ?? <span className="text-muted-foreground italic">System</span>}</span>
                      {entry.actor_role && <div className="text-xs text-muted-foreground capitalize">{entry.actor_role.replace(/_/g, ' ')}</div>}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge className={`text-xs font-mono whitespace-nowrap ${actionColor(entry.action)}`} variant="outline">
                        {entry.action}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 max-w-sm text-sm">{entry.description}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{entry.ip_address ?? '—'}</td>
                  </tr>
                  {expanded.has(entry.id) && entry.metadata && (
                    <tr className="bg-muted/30 border-b">
                      <td></td>
                      <td colSpan={5} className="px-4 py-3">
                        <MetadataPanel metadata={entry.metadata as Record<string, unknown>} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))
            ) : (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">No audit entries found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Showing {(data.page - 1) * data.limit + 1}–{Math.min(data.page * data.limit, data.total)} of {data.total} entries</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => load(page - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page >= data.totalPages} onClick={() => load(page + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}
