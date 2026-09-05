import React from 'react';
import {
  useListBranches,
  useCreateBranch,
  useUpdateBranch,
  useDeleteBranch,
  useRequestUploadUrl,
  getListBranchesQueryKey,
  type Branch,
  type BranchInput,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Building2,
  Plus,
  Pencil,
  Trash2,
  Power,
  ImageIcon,
  Upload,
  Loader2,
  X,
} from 'lucide-react';
import { resolveAssetUrl } from '@/lib/company';

// ─── Branch logo upload ──────────────────────────────────────────────────────
function LogoUpload({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const requestUpload = useRequestUploadUrl();
  const [uploading, setUploading] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const previewUrl = value ? resolveAssetUrl(value) : null;

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) { toast.error('Please choose an image file'); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error('Image must be smaller than 5 MB'); return; }
    setUploading(true);
    try {
      const ticket = await requestUpload.mutateAsync({
        data: { name: file.name, size: file.size, content_type: file.type },
      });
      const put = await fetch(ticket.upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      if (!put.ok) throw new Error(`Upload failed (${put.status})`);
      onChange(ticket.object_path);
      toast.success('Logo uploaded');
    } catch (err) {
      toast.error(`Upload failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-2">
      <Label>Branch Logo</Label>
      <div className="flex items-center gap-4">
        <div className="w-20 h-20 rounded-lg border bg-muted/40 flex items-center justify-center overflow-hidden shrink-0">
          {previewUrl ? (
            <img src={previewUrl} alt="Branch logo" className="w-full h-full object-contain" />
          ) : (
            <ImageIcon className="h-7 w-7 text-muted-foreground/50" />
          )}
        </div>
        <div className="space-y-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }}
          />
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => inputRef.current?.click()}>
              {uploading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Upload className="h-4 w-4 mr-1.5" />}
              {value ? 'Replace' : 'Upload'}
            </Button>
            {value && (
              <Button type="button" variant="ghost" size="sm" disabled={uploading} onClick={() => onChange('')}>
                <X className="h-4 w-4 mr-1.5" /> Remove
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground max-w-xs">Falls back to the company logo when empty. PNG or JPG, up to 5 MB.</p>
        </div>
      </div>
    </div>
  );
}

// ─── Field helpers ────────────────────────────────────────────────────────────
const EMPTY: BranchForm = {
  name: '', code: '', address: '', county: '', phone: '', phone2: '', email: '',
  manager: '', kra_pin: '', paybill_number: '', paybill_account: '', till_number: '',
  bank_name: '', bank_account_name: '', bank_account_number: '', logo_url: '',
  receipt_footer: '', invoice_footer: '', quotation_footer: '', is_active: true,
};

interface BranchForm {
  name: string; code: string; address: string; county: string; phone: string;
  phone2: string; email: string; manager: string; kra_pin: string;
  paybill_number: string; paybill_account: string; till_number: string;
  bank_name: string; bank_account_name: string; bank_account_number: string;
  logo_url: string; receipt_footer: string; invoice_footer: string;
  quotation_footer: string; is_active: boolean;
}

function fromBranch(b: Branch): BranchForm {
  return {
    name: b.name ?? '', code: b.code ?? '', address: b.address ?? '', county: b.county ?? '',
    phone: b.phone ?? '', phone2: b.phone2 ?? '', email: b.email ?? '', manager: b.manager ?? '',
    kra_pin: b.kra_pin ?? '', paybill_number: b.paybill_number ?? '', paybill_account: b.paybill_account ?? '',
    till_number: b.till_number ?? '', bank_name: b.bank_name ?? '', bank_account_name: b.bank_account_name ?? '',
    bank_account_number: b.bank_account_number ?? '', logo_url: b.logo_url ?? '',
    receipt_footer: b.receipt_footer ?? '', invoice_footer: b.invoice_footer ?? '',
    quotation_footer: b.quotation_footer ?? '', is_active: b.is_active ?? true,
  };
}

function toInput(f: BranchForm): BranchInput {
  const trim = (s: string) => (s.trim() === '' ? undefined : s.trim());
  return {
    name: f.name.trim(),
    code: f.code.trim(),
    address: trim(f.address),
    county: trim(f.county),
    phone: trim(f.phone),
    phone2: trim(f.phone2),
    email: trim(f.email),
    manager: trim(f.manager),
    kra_pin: trim(f.kra_pin),
    paybill_number: trim(f.paybill_number),
    paybill_account: trim(f.paybill_account),
    till_number: trim(f.till_number),
    bank_name: trim(f.bank_name),
    bank_account_name: trim(f.bank_account_name),
    bank_account_number: trim(f.bank_account_number),
    logo_url: f.logo_url.trim() === '' ? undefined : f.logo_url.trim(),
    receipt_footer: trim(f.receipt_footer),
    invoice_footer: trim(f.invoice_footer),
    quotation_footer: trim(f.quotation_footer),
    is_active: f.is_active,
  };
}

function Text({ label, value, onChange, placeholder, required }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}{required && <span className="text-destructive"> *</span>}</Label>
      <Input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

// ─── Create / Edit dialog ─────────────────────────────────────────────────────
function BranchDialog({ open, branch, onClose }: {
  open: boolean; branch: Branch | null; onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const createBranch = useCreateBranch();
  const updateBranch = useUpdateBranch();
  const [f, setF] = React.useState<BranchForm>(EMPTY);

  React.useEffect(() => {
    setF(branch ? fromBranch(branch) : EMPTY);
  }, [branch, open]);

  const set = (k: keyof BranchForm) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  const pending = createBranch.isPending || updateBranch.isPending;
  const valid = f.name.trim() !== '' && f.code.trim() !== '';

  const handleSave = () => {
    if (!valid) return;
    const data = toInput(f);
    const onSuccess = () => {
      toast.success(branch ? 'Branch updated' : 'Branch created');
      queryClient.invalidateQueries({ queryKey: getListBranchesQueryKey() });
      onClose();
    };
    const onError = (err: Error) => toast.error(`Save failed: ${err.message}`);
    if (branch) updateBranch.mutate({ id: branch.id, data }, { onSuccess, onError });
    else createBranch.mutate({ data }, { onSuccess, onError });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{branch ? `Edit ${branch.name}` : 'New Branch'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 mt-2">
          {/* Identity */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Text label="Branch Name" value={f.name} onChange={set('name')} placeholder="e.g. Nairobi CBD" required />
            <Text label="Branch Code" value={f.code} onChange={set('code')} placeholder="e.g. NBO" required />
          </div>

          <LogoUpload value={f.logo_url} onChange={set('logo_url')} />

          {/* Contact */}
          <div>
            <p className="text-sm font-semibold mb-3">Contact Details</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Text label="Address" value={f.address} onChange={set('address')} placeholder="Street / building" />
              <Text label="County" value={f.county} onChange={set('county')} placeholder="e.g. Nairobi" />
              <Text label="Phone" value={f.phone} onChange={set('phone')} placeholder="+254 …" />
              <Text label="Secondary Phone" value={f.phone2} onChange={set('phone2')} />
              <Text label="Email" value={f.email} onChange={set('email')} placeholder="branch@company.co.ke" />
              <Text label="Branch Manager" value={f.manager} onChange={set('manager')} />
              <Text label="KRA PIN" value={f.kra_pin} onChange={set('kra_pin')} />
            </div>
          </div>

          {/* Payment */}
          <div>
            <p className="text-sm font-semibold mb-3">Payment Details</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Text label="M-Pesa Paybill Number" value={f.paybill_number} onChange={set('paybill_number')} />
              <Text label="Paybill Account" value={f.paybill_account} onChange={set('paybill_account')} />
              <Text label="M-Pesa Till Number" value={f.till_number} onChange={set('till_number')} />
              <Text label="Bank Name" value={f.bank_name} onChange={set('bank_name')} />
              <Text label="Bank Account Name" value={f.bank_account_name} onChange={set('bank_account_name')} />
              <Text label="Bank Account Number" value={f.bank_account_number} onChange={set('bank_account_number')} />
            </div>
          </div>

          {/* Document footers */}
          <div className="space-y-3">
            <p className="text-sm font-semibold">Document Footers</p>
            <div className="space-y-1.5">
              <Label>Receipt Footer</Label>
              <Textarea rows={2} value={f.receipt_footer} onChange={(e) => set('receipt_footer')(e.target.value)} placeholder="Shown at the bottom of receipts" />
            </div>
            <div className="space-y-1.5">
              <Label>Invoice Footer</Label>
              <Textarea rows={2} value={f.invoice_footer} onChange={(e) => set('invoice_footer')(e.target.value)} placeholder="Shown at the bottom of invoices" />
            </div>
            <div className="space-y-1.5">
              <Label>Quotation Footer</Label>
              <Textarea rows={2} value={f.quotation_footer} onChange={(e) => set('quotation_footer')(e.target.value)} placeholder="Shown at the bottom of quotations" />
            </div>
          </div>

          {/* Status */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <p className="text-sm font-medium">Active</p>
              <p className="text-xs text-muted-foreground">Inactive branches are hidden from new transactions</p>
            </div>
            <Switch checked={f.is_active} onCheckedChange={(v) => setF((p) => ({ ...p, is_active: v }))} />
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="button" disabled={!valid || pending} onClick={handleSave}>
            {pending ? 'Saving…' : branch ? 'Save Changes' : 'Create Branch'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Panel ────────────────────────────────────────────────────────────────────
export function BranchesPanel() {
  const { data: branches, isLoading } = useListBranches();
  const queryClient = useQueryClient();
  const updateBranch = useUpdateBranch();
  const deleteBranch = useDeleteBranch();

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Branch | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState<Branch | null>(null);

  const openNew = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (b: Branch) => { setEditing(b); setDialogOpen(true); };

  const toggleActive = (b: Branch) => {
    updateBranch.mutate(
      { id: b.id, data: { name: b.name, code: b.code, is_active: !b.is_active } },
      {
        onSuccess: () => {
          toast.success(b.is_active ? `${b.name} deactivated` : `${b.name} activated`);
          queryClient.invalidateQueries({ queryKey: getListBranchesQueryKey() });
        },
        onError: (err) => toast.error(`Update failed: ${err.message}`),
      }
    );
  };

  const doDelete = (b: Branch) => {
    deleteBranch.mutate(
      { id: b.id },
      {
        onSuccess: () => {
          toast.success(`${b.name} deleted`);
          queryClient.invalidateQueries({ queryKey: getListBranchesQueryKey() });
          setConfirmDelete(null);
        },
        onError: (err) => {
          toast.error(err.message || 'Cannot delete a branch that still owns records — deactivate it instead.');
          setConfirmDelete(null);
        },
      }
    );
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10"><Building2 className="h-5 w-5 text-primary" /></div>
              <div>
                <CardTitle>Branches</CardTitle>
                <CardDescription>Create and manage the branches your business operates from.</CardDescription>
              </div>
            </div>
            <Button onClick={openNew} data-testid="button-add-branch">
              <Plus className="h-4 w-4 mr-1.5" /> Add Branch
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : !branches || branches.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No branches yet. Add your first branch to get started.</p>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground bg-muted/50 uppercase border-b">
                  <tr>
                    <th className="px-4 py-3">Branch</th>
                    <th className="px-4 py-3">Code</th>
                    <th className="px-4 py-3">Contact</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {branches.map((b) => (
                    <tr key={b.id} className="border-b last:border-0 hover:bg-muted/40 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium">{b.name}</div>
                        {b.county && <div className="text-xs text-muted-foreground">{b.county}</div>}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{b.code}</td>
                      <td className="px-4 py-3 text-muted-foreground">{b.phone || b.email || '—'}</td>
                      <td className="px-4 py-3">
                        <Badge variant={b.is_active ? 'secondary' : 'destructive'}>
                          {b.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <Button variant="ghost" size="icon" title="Edit" onClick={() => openEdit(b)}>
                          <Pencil className="w-4 h-4 text-primary" />
                        </Button>
                        <Button variant="ghost" size="icon" title={b.is_active ? 'Deactivate' : 'Activate'} onClick={() => toggleActive(b)}>
                          <Power className={b.is_active ? 'w-4 h-4 text-amber-600' : 'w-4 h-4 text-green-600'} />
                        </Button>
                        <Button variant="ghost" size="icon" title="Delete" onClick={() => setConfirmDelete(b)}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <BranchDialog open={dialogOpen} branch={editing} onClose={() => setDialogOpen(false)} />

      {/* Delete confirmation */}
      <Dialog open={!!confirmDelete} onOpenChange={(v) => { if (!v) setConfirmDelete(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete {confirmDelete?.name}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This permanently removes the branch. Branches that still own records (sales, users, stock)
            cannot be deleted — deactivate them instead. This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button variant="destructive" disabled={deleteBranch.isPending} onClick={() => confirmDelete && doDelete(confirmDelete)}>
              {deleteBranch.isPending ? 'Deleting…' : 'Delete Branch'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
