import React, { useRef, useState } from 'react';
import { ArrowLeft, CheckCircle2, FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { useLocation } from 'wouter';
import { customFetch } from '@workspace/api-client-react';

interface ImportJob {
  id: number;
  status?: string;
  total_rows?: number;
  valid_rows?: number;
  invalid_rows?: number;
  created_count?: number;
}

export default function BulkImport() {
  const [, setLocation] = useLocation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [job, setJob] = useState<ImportJob | null>(null);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [done, setDone] = useState(false);

  const upload = async (selected: File) => {
    setFile(selected);
    setJob(null);
    setDone(false);
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', selected, selected.name);
      form.append('source_name', selected.name);
      const data = await customFetch<any>('/products/imports/upload-and-parse', {
        method: 'POST',
        body: form,
      });
      setJob(data.job || null);
      toast.success(`File analysed: ${data.preview?.length ?? data.job?.total_rows ?? 0} rows found`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to analyse the file');
      setFile(null);
    } finally {
      setUploading(false);
    }
  };

  const startImport = async () => {
    if (!job?.id) return;
    setProcessing(true);
    try {
      const data = await customFetch<any>(`/products/imports/${encodeURIComponent(job.id)}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      setJob(data.job || { ...job, status: 'processing' });
      setDone(true);
      toast.success('Bulk product import started');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to start the import');
    } finally {
      setProcessing(false);
    }
  };

  const total = job?.total_rows ?? 0;
  const invalid = job?.invalid_rows ?? 0;
  const valid = job?.valid_rows ?? Math.max(0, total - invalid);

  return (
    <div className="p-6 space-y-6">
      <div>
        <Button variant="ghost" className="px-0 mb-2" onClick={() => setLocation('/products')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Products
        </Button>
        <h1 className="text-2xl font-bold">Bulk Add Products</h1>
        <p className="text-muted-foreground">Import products from CSV, Excel or supported PDF supplier files.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Upload className="h-5 w-5" /> Upload product file</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx,.xls,.pdf"
            className="hidden"
            onChange={e => { const selected = e.target.files?.[0]; if (selected) upload(selected); e.currentTarget.value = ''; }}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="w-full rounded-xl border-2 border-dashed p-10 text-center hover:border-primary hover:bg-muted/30 transition-colors"
          >
            {uploading ? <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" /> : <FileSpreadsheet className="mx-auto h-10 w-10 text-primary" />}
            <div className="mt-3 font-semibold">{uploading ? 'Analysing file…' : file ? file.name : 'Choose CSV, Excel or PDF'}</div>
            <div className="text-sm text-muted-foreground mt-1">The existing bulk-import engine validates and maps the records before creating products.</div>
          </button>

          {job && (
            <div className="space-y-4 rounded-lg border p-4">
              <div className="flex flex-wrap items-center gap-2"><Badge>{job.status || 'draft'}</Badge>{file && <span className="text-sm text-muted-foreground">{file.name}</span>}</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-lg bg-muted/40 p-3"><div className="text-xs text-muted-foreground">Rows</div><div className="text-xl font-bold">{total}</div></div>
                <div className="rounded-lg bg-muted/40 p-3"><div className="text-xs text-muted-foreground">Valid</div><div className="text-xl font-bold">{valid}</div></div>
                <div className="rounded-lg bg-muted/40 p-3"><div className="text-xs text-muted-foreground">Invalid</div><div className="text-xl font-bold">{invalid}</div></div>
                <div className="rounded-lg bg-muted/40 p-3"><div className="text-xs text-muted-foreground">Created</div><div className="text-xl font-bold">{job.created_count ?? 0}</div></div>
              </div>
              {processing && <Progress value={50} />}
              {done && <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-800 flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> Import has been queued for processing.</div>}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => { setFile(null); setJob(null); setDone(false); }}>Choose Another File</Button>
                <Button onClick={startImport} disabled={processing || done || total === 0 || invalid > 0}>
                  <Upload className="mr-2 h-4 w-4" /> {processing ? 'Starting…' : 'Import Products'}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
