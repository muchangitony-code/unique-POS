import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Database, Trash2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

interface TransactionRow {
  id: number;
  type: 'sale' | 'invoice' | 'quotation';
  reference: string | null;
  created_at: string;
  total: string | number | null;
  branch_id: number | null;
  is_test: boolean;
}

const TYPES = [
  { value: 'sale', label: 'Sales' },
  { value: 'invoice', label: 'Invoices' },
  { value: 'quotation', label: 'Quotations' },
] as const;

export default function TransactionCleanup() {
  const { token, user } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [selected, setSelected] = React.useState<string[]>([]);
  const [confirmation, setConfirmation] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  const headers = React.useMemo(() => token ? { Authorization: `Bearer ${token}` } : {}, [token]);
  const { data, isLoading, error } = useQuery<TransactionRow[]>({
    queryKey: ['admin-transaction-cleanup'],
    queryFn: async () => {
      const res = await fetch('/api/admin/test-transactions', { headers });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Unable to load transactions');
      return res.json();
    },
    enabled: !!token,
  });

  if (user && user.role !== 'administrator' && user.role !== 'super_admin') {
    setLocation('/access-denied');
    return null;
  }

  const rows = data ?? [];
  const allTest = rows.filter(r => r.is_test);
  const allIds = allTest.map(r => `${r.type}:${r.id}`);

  const toggle = (key: string) => setSelected(s => s.includes(key) ? s.filter(x => x !== key) : [...s, key]);
  const selectAllTest = () => setSelected(selected.length === allIds.length ? [] : allIds);

  const post = async (url: string, body: unknown) => {
    setBusy(true);
    try {
      const res = await fetch(url, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || 'Operation failed');
      toast.success(payload.message || 'Completed');
      setSelected([]);
      setConfirmation('');
      await queryClient.invalidateQueries({ queryKey: ['admin-transaction-cleanup'] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Operation failed');
    } finally {
      setBusy(false);
    }
  };

  const markSelected = () => {
    if (!selected.length) return toast.error('Select at least one transaction.');
    post('/api/admin/test-transactions/mark', {
      transactions: selected.map(k => { const [type, id] = k.split(':'); return { type, id: Number(id) }; }),
    });
  };

  const deleteSelected = () => {
    if (!selected.length) return toast.error('Select test transactions to delete.');
    if (selected.some(k => !allIds.includes(k))) return toast.error('Only transactions already marked as test data can be deleted.');
    if (confirmation !== 'DELETE TEST DATA') return toast.error('Type DELETE TEST DATA to confirm.');
    post('/api/admin/test-transactions/delete', {
      transactions: selected.map(k => { const [type, id] = k.split(':'); return { type, id: Number(id) }; }),
    });
  };

  const deleteAll = () => {
    if (user?.role !== 'super_admin') return toast.error('Super Admin approval is required for bulk deletion.');
    if (!allTest.length) return toast.error('There is no marked test data to delete.');
    if (confirmation !== 'DELETE ALL TEST DATA') return toast.error('Type DELETE ALL TEST DATA to confirm.');
    post('/api/admin/test-transactions/delete-all', { confirmation: 'DELETE ALL TEST DATA' });
  };

  return (
    <div className="container mx-auto max-w-6xl p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Test Transaction Cleanup</h1>
          <p className="text-muted-foreground">Safely remove transactions created during POS testing without touching products, customers, users, branding or settings.</p>
        </div>
        <Button variant="outline" onClick={() => setLocation('/settings')}>Back to Settings</Button>
      </div>

      <Card className="border-amber-300">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5" /> Destructive operation</CardTitle>
          <CardDescription>Only transactions explicitly marked as test data can be deleted. Bulk deletion is restricted to Super Admin.</CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Database className="h-5 w-5" /> Transactions</CardTitle>
          <CardDescription>{rows.length} transaction(s) loaded; {allTest.length} currently marked as test data.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={selectAllTest} disabled={!allTest.length}>{selected.length === allIds.length ? 'Clear selection' : 'Select all test data'}</Button>
            <Button variant="outline" onClick={markSelected} disabled={busy || !selected.length}>Mark selected as test</Button>
            <Button variant="destructive" onClick={deleteSelected} disabled={busy || !selected.length}><Trash2 className="h-4 w-4 mr-2" />Delete selected test data</Button>
            {user?.role === 'super_admin' && <Button variant="destructive" onClick={deleteAll} disabled={busy || !allTest.length}>Delete ALL test data</Button>}
          </div>

          <div className="rounded-md border divide-y">
            {isLoading && <div className="p-6 text-muted-foreground">Loading transactions…</div>}
            {error && <div className="p-6 text-destructive">{error instanceof Error ? error.message : 'Unable to load transactions.'}</div>}
            {!isLoading && !error && !rows.length && <div className="p-6 text-muted-foreground">No sales, invoices or quotations found.</div>}
            {rows.map(row => {
              const key = `${row.type}:${row.id}`;
              return <div key={key} className="flex items-center gap-3 p-3">
                <Checkbox checked={selected.includes(key)} onCheckedChange={() => toggle(key)} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2"><span className="font-medium">{row.reference || `${row.type.toUpperCase()} #${row.id}`}</span>{row.is_test && <Badge variant="secondary">TEST</Badge>}</div>
                  <div className="text-xs text-muted-foreground">{row.type} · {new Date(row.created_at).toLocaleString()} · {row.total == null ? '' : `KES ${Number(row.total).toLocaleString()}`}</div>
                </div>
              </div>;
            })}
          </div>

          <div className="flex flex-col gap-2 max-w-xl">
            <label className="text-sm font-medium">Confirmation</label>
            <input className="h-10 rounded-md border bg-background px-3 text-sm" value={confirmation} onChange={e => setConfirmation(e.target.value)} placeholder="Type DELETE TEST DATA or DELETE ALL TEST DATA" />
            <p className="text-xs text-muted-foreground flex items-center gap-1"><ShieldCheck className="h-3 w-3" />Deletion is audited with the acting user, scope and affected transaction IDs.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
