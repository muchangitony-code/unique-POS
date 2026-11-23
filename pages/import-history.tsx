import React, { useEffect, useState } from 'react';
import { ArrowLeft, RefreshCw, History, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { useLocation } from 'wouter';
import { customFetch } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface ImportJob { id: number; file_name?: string; source_name?: string; status?: string; total_rows?: number; processed_rows?: number; valid_rows?: number; invalid_rows?: number; created_count?: number; updated_count?: number; skipped_rows?: number; error_count?: number; last_error?: string | null; created_at?: string; summary?: Record<string, unknown>; }
const ACTIVE = new Set(['queued', 'processing']);

export default function ImportHistory() {
  const [, setLocation] = useLocation();
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [selected, setSelected] = useState<ImportJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pageError, setPageError] = useState('');

  const loadHistory = async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const result = await customFetch<any>('/products/imports');
      const list: ImportJob[] = result.data || [];
      setJobs(list); setPageError('');
      const id = selected?.id ?? (list.some(job => job.id === 14) ? 14 : list[0]?.id);
      if (id) { const detail = await customFetch<any>('/products/imports/' + id); if (detail.job) setSelected(detail.job); }
    } catch (err) { setPageError(err instanceof Error ? err.message : 'Unable to load import history'); }
    finally { if (!quiet) setLoading(false); }
  };
  const loadJob = async (id: number) => {
    setSelected(jobs.find(job => job.id === id) || null);
    try { const detail = await customFetch<any>('/products/imports/' + id); if (detail.job) setSelected(detail.job); }
    catch (err) { setPageError(err instanceof Error ? err.message : 'Unable to load import details'); }
  };
  useEffect(() => { void loadHistory(); }, []);
  const active = jobs.some(job => ACTIVE.has(String(job.status || '').toLowerCase())) || ACTIVE.has(String(selected?.status || '').toLowerCase());
  useEffect(() => { if (!active) return; const timer = window.setInterval(() => { void loadHistory(true); }, 2000); return () => window.clearInterval(timer); }, [active, selected?.id]);
  const refresh = async () => { setRefreshing(true); await loadHistory(true); setRefreshing(false); };
  const summary = selected?.summary || {};
  const stockProducts = Number(summary.opening_stock_products ?? 0), stockUnits = Number(summary.opening_stock_units ?? 0);
  const status = String(selected?.status || '').toLowerCase();

  return <div className='p-6 space-y-6'>
    <div className='flex flex-wrap items-start justify-between gap-3'><div><Button variant='ghost' className='px-0 mb-2' onClick={() => setLocation('/products')}><ArrowLeft className='mr-2 h-4 w-4' />Back to Products</Button><h1 className='text-2xl font-bold'>Import History</h1><p className='text-muted-foreground'>Review bulk imports, processing results and server errors.</p></div><div className='flex gap-2'><Button variant='outline' onClick={refresh} disabled={refreshing}><RefreshCw className={refreshing ? 'mr-2 h-4 w-4 animate-spin' : 'mr-2 h-4 w-4'} />Refresh</Button><Button onClick={() => setLocation('/products/bulk-import')}><History className='mr-2 h-4 w-4' />New Import</Button></div></div>
    {pageError && <div className='rounded-md border border-destructive/40 p-3 text-sm text-destructive'>{pageError}</div>}
    <Card><CardHeader><CardTitle>Recent import jobs</CardTitle></CardHeader><CardContent>
      {loading ? <div className='flex items-center gap-2 text-muted-foreground'><Loader2 className='h-4 w-4 animate-spin' />Loading import history…</div> : jobs.length === 0 ? <p className='text-sm text-muted-foreground'>No import jobs found.</p> :
        <div className='overflow-x-auto'><table className='w-full text-sm'><thead><tr className='border-b text-left'><th className='p-2'>Job</th><th className='p-2'>File</th><th className='p-2'>Status</th><th className='p-2'>Created</th><th className='p-2'>Failed</th><th className='p-2'>Date</th><th className='p-2'></th></tr></thead><tbody>
          {jobs.map(job => <tr key={job.id} className='border-b'><td className='p-2 font-medium'>#{job.id}</td><td className='p-2'>{job.file_name || job.source_name || 'Upload'}</td><td className='p-2'><Badge variant={job.status === 'failed' ? 'destructive' : job.status === 'completed' ? 'default' : 'secondary'}>{job.status || 'unknown'}</Badge></td><td className='p-2'>{job.created_count ?? 0}</td><td className='p-2'>{job.error_count ?? 0}</td><td className='p-2'>{job.created_at ? new Date(job.created_at).toLocaleString() : '—'}</td><td className='p-2'><Button size='sm' variant='outline' onClick={() => loadJob(job.id)}>View</Button></td></tr>)}
        </tbody></table></div>}
    </CardContent></Card>
    {selected && <Card><CardHeader><CardTitle className='flex items-center gap-2'>Import job #{selected.id}<Badge variant={status === 'failed' ? 'destructive' : status === 'completed' ? 'default' : 'secondary'}>{status || 'unknown'}</Badge></CardTitle></CardHeader><CardContent className='space-y-4'>
      <div className='grid grid-cols-2 md:grid-cols-4 gap-3'><div className='rounded-lg bg-muted/40 p-3'><div className='text-xs text-muted-foreground'>Rows</div><div className='text-xl font-bold'>{selected.total_rows ?? 0}</div></div><div className='rounded-lg bg-muted/40 p-3'><div className='text-xs text-muted-foreground'>Processed</div><div className='text-xl font-bold'>{selected.processed_rows ?? 0}</div></div><div className='rounded-lg bg-muted/40 p-3'><div className='text-xs text-muted-foreground'>Created</div><div className='text-xl font-bold'>{selected.created_count ?? 0}</div></div><div className='rounded-lg bg-muted/40 p-3'><div className='text-xs text-muted-foreground'>Skipped</div><div className='text-xl font-bold'>{selected.skipped_rows ?? 0}</div></div></div>
      {ACTIVE.has(status) && <p className='text-sm text-muted-foreground flex items-center gap-2'><Loader2 className='h-4 w-4 animate-spin' />The server is processing this job. Status refreshes automatically.</p>}
      {status === 'completed' && <div className='rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800'><CheckCircle2 className='inline mr-2 h-4 w-4' />Completed: {selected.created_count ?? 0} products created, {selected.updated_count ?? 0} updated, {selected.skipped_rows ?? 0} skipped. Opening stock: {stockProducts} products / {stockUnits.toLocaleString()} units.</div>}
      {status === 'failed' && <div className='rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm'><div className='font-semibold text-destructive flex items-center gap-2'><AlertCircle className='h-4 w-4' />Import failed</div><p className='mt-1'>{selected.last_error || 'No server error message was recorded.'}</p></div>}
      {selected.id === 14 && <p className='text-xs text-muted-foreground'>This is the previously submitted Unique Solar inventory import job.</p>}
    </CardContent></Card>}
  </div>;
}