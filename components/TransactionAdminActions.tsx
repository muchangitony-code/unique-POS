import React from 'react';
import { useLocation } from 'wouter';
import { TestTube2, Trash2, ShieldCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

type TransactionType = 'sale' | 'invoice' | 'quotation';
interface TransactionRow {
  id: number;
  type: TransactionType;
  reference: string | null;
  created_at: string;
  total: string | number | null;
  is_test: boolean;
}

const ROUTE_TYPE: Record<string, TransactionType> = {
  '/invoices': 'invoice',
  '/quotations': 'quotation',
  '/pos': 'sale',
};

export function TransactionAdminActions() {
  const [location] = useLocation();
  const { token, user } = useAuth();
  const [rows, setRows] = React.useState<TransactionRow[]>([]);
  const [open, setOpen] = React.useState(true);
  const [busy, setBusy] = React.useState(false);

  const type = Object.entries(ROUTE_TYPE).find(([route]) => location.startsWith(route))?.[1];
  const isAdmin = user?.role === 'administrator' || user?.role === 'super_admin';

  const load = React.useCallback(async () => {
    if (!token || !isAdmin || !type) return;
    try {
      const res = await fetch('/api/admin/test-transactions', { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Unable to load transaction controls');
      const data = await res.json() as TransactionRow[];
      setRows(data.filter(r => r.type === type));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to load transaction controls');
    }
  }, [token, isAdmin, type]);

  React.useEffect(() => {
    if (!type || !isAdmin) return;
    load();
  }, [load, type, isAdmin]);

  if (!type || !isAdmin) return null;

  const post = async (url: string, body: unknown) => {
    setBusy(true);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || 'Operation failed');
      toast.success(payload.message || 'Completed');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Operation failed');
    } finally {
      setBusy(false);
    }
  };

  const markTest = (row: TransactionRow) => {
    post('/api/admin/test-transactions/mark', { transactions: [{ type: row.type, id: row.id }] });
  };

  const deleteTest = (row: TransactionRow) => {
    if (!row.is_test) return;
    if (!window.confirm(`Delete ${row.reference || `${row.type} #${row.id}`} as TEST DATA? This cannot be undone.`)) return;
    post('/api/admin/test-transactions/delete', { transactions: [{ type: row.type, id: row.id }] });
  };

  return (
    <div className="fixed right-5 bottom-5 z-50 w-[420px] max-w-[calc(100vw-24px)] rounded-xl border bg-background shadow-2xl">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div>
          <div className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4 text-primary" /> Test Transaction Controls</div>
          <p className="text-xs text-muted-foreground">Administrator only · {type}s on this screen</p>
        </div>
        <Button size="icon" variant="ghost" onClick={() => setOpen(v => !v)} title={open ? 'Hide controls' : 'Show controls'}>
          {open ? <X className="h-4 w-4" /> : <TestTube2 className="h-4 w-4" />}
        </Button>
      </div>

      {open && (
        <div className="max-h-80 overflow-y-auto p-3 space-y-2">
          {!rows.length && <p className="py-4 text-center text-sm text-muted-foreground">No {type}s found.</p>}
          {rows.map(row => (
            <div key={`${row.type}:${row.id}`} className="flex items-center gap-3 rounded-lg border p-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{row.reference || `${row.type.toUpperCase()} #${row.id}`}</span>
                  {row.is_test ? <Badge variant="secondary">TEST</Badge> : <Badge variant="outline">Production / Unmarked</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">KES {Number(row.total ?? 0).toLocaleString()} · {new Date(row.created_at).toLocaleDateString()}</p>
              </div>
              {!row.is_test ? (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => markTest(row)}>
                  <TestTube2 className="mr-1 h-4 w-4" />Mark as TEST
                </Button>
              ) : (
                <Button size="sm" variant="destructive" disabled={busy} onClick={() => deleteTest(row)}>
                  <Trash2 className="mr-1 h-4 w-4" />Delete TEST
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
