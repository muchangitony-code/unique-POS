import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Database, Trash2, ShieldCheck, TestTube2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

interface TransactionRow { id: number; type: 'sale' | 'invoice' | 'quotation'; reference: string | null; created_at: string; total: string | number | null; branch_id: number | null; is_test: boolean; }

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
    queryFn: async () => { const res = await fetch('/api/admin/test-transactions', { headers }); if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Unable to load transactions'); return res.json(); },
    enabled: !!token,
  });
  React.useEffect(() => { if (user && user.role !== 'administrator' && user.role !== 'super_admin') setLocation('/access-denied'); }, [user, setLocation]);

  const rows = data ?? [];
  const allTest = rows.filter(r => r.is_test);
  const allRows = rows.map(r => `${r.type}:${r.id}`);
  const selectedTest = selected.filter(k => allTest.some(r => `${r.type}:${r.id}` === k));
  const toggle = (key: string) => setSelected(s => s.includes(key) ? s.filter(x => x !== key) : [...s, key]);
  const selectAllRows = () => setSelected(selected.length === allRows.length ? [] : allRows);
  const selectAllTest = () => { const ids = allTest.map(r => `${r.type}:${r.id}`); setSelected(selectedTest.length === ids.length ? [] : ids); };
  const post = async (url: string, body: unknown) => {
    setBusy(true);
    try { const res = await fetch(url, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const payload = await res.json().catch(() => ({})); if (!res.ok) throw new Error(payload.error || 'Operation failed'); toast.success(payload.message || 'Completed'); setSelected([]); setConfirmation(''); await queryClient.invalidateQueries({ queryKey: ['admin-transaction-cleanup'] }); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Operation failed'); } finally { setBusy(false); }
  };
  const refsFrom = (keys: string[]) => keys.map(k => { const [type, id] = k.split(':'); return { type, id: Number(id) }; });
  const markSelected = () => { if (!selected.length) return toast.error('Select one or more transactions to mark as TEST.'); post('/api/admin/test-transactions/mark', { transactions: refsFrom(selected) }); };
  const markOne = (row: TransactionRow) => { if (!row.is_test) post('/api/admin/test-transactions/mark', { transactions: [{ type: row.type, id: row.id }] }); };
  const deleteSelected = () => { if (!selected.length) return toast.error('Select TEST transactions to delete.'); const testKeys = new Set(allTest.map(r => `${r.type}:${r.id}`)); if (selected.some(k => !testKeys.has(k))) return toast.error('Only transactions marked as TEST can be deleted.'); if (confirmation !== 'DELETE TEST DATA') return toast.error('Type DELETE TEST DATA to confirm.'); post('/api/admin/test-transactions/delete', { transactions: refsFrom(selected) }); };
  const deleteAll = () => { if (user?.role !== 'super_admin') return toast.error('Super Admin approval is required for bulk deletion.'); if (!allTest.length) return toast.error('There is no marked TEST data to delete.'); if (confirmation !== 'DELETE ALL TEST DATA') return toast.error('Type DELETE ALL TEST DATA to confirm.'); post('/api/admin/test-transactions/delete-all', { confirmation: 'DELETE ALL TEST DATA' }); };

  return <div className="container mx-auto max-w-6xl p-6 space-y-6">
    <div className="flex items-center justify-between gap-4"><div><h1 className="text-2xl font-bold">Test Transaction Cleanup</h1><p className="text-muted-foreground">First mark transactions as TEST. Only TEST transactions can be deleted.</p></div><Button variant="outline" onClick={() => setLocation('/settings')}>Back to Settings</Button></div>
    <Card className="border-amber-300"><CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5" /> Test-data safety</CardTitle><CardDescription>Marking a transaction as TEST does not delete or alter it. It only makes it eligible for cleanup. Production transactions remain protected until explicitly marked.</CardDescription></CardHeader></Card>
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><Database className="h-5 w-5" /> Sales, invoices & quotations</CardTitle><CardDescription>{rows.length} transaction(s) loaded; <strong>{allTest.length}</strong> currently marked as TEST.</CardDescription></CardHeader><CardContent className="space-y-4">
      <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={selectAllRows} disabled={!rows.length}>{selected.length === allRows.length ? 'Clear selection' : 'Select all transactions'}</Button><Button variant="outline" onClick={markSelected} disabled={busy || !selected.length}><TestTube2 className="h-4 w-4 mr-2" />Mark selected as TEST</Button><Button variant="outline" onClick={selectAllTest} disabled={!allTest.length}>{selectedTest.length === allTest.length ? 'Clear TEST selection' : 'Select all TEST data'}</Button><Button variant="destructive" onClick={deleteSelected} disabled={busy || !selected.length}><Trash2 className="h-4 w-4 mr-2" />Delete selected TEST data</Button>{user?.role === 'super_admin' && <Button variant="destructive" onClick={deleteAll} disabled={busy || !allTest.length}>Delete ALL TEST data</Button>}</div>
      <div className="rounded-md border divide-y"><div className="grid grid-cols-[auto_1fr_auto] gap-3 p-3 text-xs font-semibold text-muted-foreground bg-muted/30"><span>SELECT</span><span>TRANSACTION</span><span>ACTION</span></div>{isLoading && <div className="p-6 text-muted-foreground">Loading transactions…</div>}{error && <div className="p-6 text-destructive">{error instanceof Error ? error.message : 'Unable to load transactions.'}</div>}{!isLoading && !error && !rows.length && <div className="p-6 text-muted-foreground">No sales, invoices or quotations found.</div>}{rows.map(row => { const key = `${row.type}:${row.id}`; return <div key={key} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 p-3"><Checkbox checked={selected.includes(key)} onCheckedChange={() => toggle(key)} /><div className="min-w-0"><div className="flex items-center gap-2 flex-wrap"><span className="font-medium">{row.reference || `${row.type.toUpperCase()} #${row.id}`}</span><Badge variant="outline" className="capitalize">{row.type}</Badge>{row.is_test ? <Badge variant="secondary">TEST</Badge> : <Badge variant="outline">Production / Unmarked</Badge>}</div><div className="text-xs text-muted-foreground">{new Date(row.created_at).toLocaleString()} · {row.total == null ? '' : `KES ${Number(row.total).toLocaleString()}`}</div></div>{!row.is_test ? <Button size="sm" variant="outline" onClick={() => markOne(row)} disabled={busy} className="shrink-0"><TestTube2 className="h-4 w-4 mr-1" />Mark as TEST</Button> : <span className="text-xs text-muted-foreground">Eligible for cleanup</span>}</div>; })}</div>
      <div className="flex flex-col gap-2 max-w-xl"><label className="text-sm font-medium">Deletion confirmation</label><input className="h-10 rounded-md border bg-background px-3 text-sm" value={confirmation} onChange={e => setConfirmation(e.target.value)} placeholder="DELETE TEST DATA or DELETE ALL TEST DATA" /><p className="text-xs text-muted-foreground flex items-center gap-1"><ShieldCheck className="h-3 w-3" />Deletion is audited with the acting user, scope and affected transaction IDs.</p></div>
    </CardContent></Card>
  </div>;
}
