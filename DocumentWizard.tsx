import React, { useMemo, useState, useCallback } from 'react';
import {
  useGetProducts,
  useGetCustomers,
  useCreateCustomer,
  useCreateQuotation,
  useCreateInvoice,
  useGetSettings,
  type Product,
} from '@workspace/api-client-react';
import { formatCurrency } from '@/lib/format';
import { getApiUrl } from '@/lib/api';
import { computeTotals, lineTotal, type DocLine } from '@/lib/docCalc';
import { useBranding } from '@/contexts/BrandingContext';
import { useBranch } from '@/contexts/BranchContext';
import { brandingForBranch } from '@/lib/company';
import { useBranchLookup } from '@/lib/branchLookup';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Search, Plus, Trash2, User, UserPlus, Users, Barcode, Check, ChevronRight, ChevronLeft, Printer,
} from 'lucide-react';

export type WizardMode = 'quotation' | 'invoice';

interface Props {
  mode: WizardMode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-fill the wizard (used by Duplicate). */
  initial?: Partial<WizardState> | null;
  /** Called after a successful create with the created record. */
  onCreated?: (record: any) => void;
}

interface WizardState {
  customerMode: 'walkin' | 'existing' | 'new';
  customerId: string;
  newCustomer: {
    name: string; company: string; contact_person: string;
    phone: string; email: string; address: string; tax_number: string;
  };
  lines: DocLine[];
  manualDiscount: number;
  notes: string;
  // quotation
  validUntil: string;
  deliveryTime: string;
  warranty: string;
  paymentTerms: string;
  // invoice
  dueDate: string;
}

const emptyNewCustomer = () => ({
  name: '', company: '', contact_person: '', phone: '', email: '', address: '', tax_number: '',
});

function initialState(initial?: Partial<WizardState> | null): WizardState {
  return {
    customerMode: initial?.customerMode ?? 'walkin',
    customerId: initial?.customerId ?? '',
    newCustomer: initial?.newCustomer ?? emptyNewCustomer(),
    lines: initial?.lines ? initial.lines.map((l) => ({ ...l })) : [],
    manualDiscount: initial?.manualDiscount ?? 0,
    notes: initial?.notes ?? '',
    validUntil: initial?.validUntil ?? '',
    deliveryTime: initial?.deliveryTime ?? '',
    warranty: initial?.warranty ?? '',
    paymentTerms: initial?.paymentTerms ?? 'Cash',
    dueDate: initial?.dueDate ?? '',
  };
}

const PAYMENT_TERMS = ['Cash', 'M-Pesa', 'Bank Transfer', 'Credit'];

export function DocumentWizard({ mode, open, onOpenChange, initial, onCreated }: Props) {
  const isQuote = mode === 'quotation';
  const STEPS = isQuote
    ? ['Customer', 'Products', 'Pricing', 'Terms', 'Preview']
    : ['Customer', 'Products', 'Pricing', 'Details', 'Preview'];

  const [step, setStep] = useState(0);
  const [state, setState] = useState<WizardState>(() => initialState(initial));
  const { data: settings } = useGetSettings();
  const prefilledRef = React.useRef(false);

  // Reset whenever the dialog is (re)opened.
  React.useEffect(() => {
    if (open) { setState(initialState(initial)); setStep(0); prefilledRef.current = false; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Apply configured defaults for a fresh document (not a Duplicate) once
  // settings are available. Runs on settings arrival too, so a slow settings
  // load after the modal opens still pre-fills validity/payment terms. Only
  // touches fields still at their default so it never clobbers user edits.
  React.useEffect(() => {
    if (!open || initial || !settings || prefilledRef.current) return;
    prefilledRef.current = true;
    setState((s) => {
      const next = { ...s };
      const validityDays = settings.quotation_validity_days;
      if (isQuote && !next.validUntil && validityDays && validityDays > 0) {
        const d = new Date();
        d.setDate(d.getDate() + validityDays);
        next.validUntil = format(d, 'yyyy-MM-dd');
      }
      const terms = settings.invoice_payment_terms;
      if (terms && next.paymentTerms === 'Cash') next.paymentTerms = terms;
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, settings, initial]);

  const createCustomer = useCreateCustomer();
  const createQuotation = useCreateQuotation();
  const createInvoice = useCreateInvoice();
  const isSaving = createCustomer.isPending || createQuotation.isPending || createInvoice.isPending;

  const totals = useMemo(() => computeTotals(state.lines, state.manualDiscount), [state.lines, state.manualDiscount]);

  const patch = useCallback((p: Partial<WizardState>) => setState((s) => ({ ...s, ...p })), []);

  const canNext = useMemo(() => {
    if (step === 0) {
      if (state.customerMode === 'existing') return !!state.customerId;
      if (state.customerMode === 'new') return state.newCustomer.name.trim().length > 0;
      return true;
    }
    if (step === 1) return state.lines.length > 0 && state.lines.every((l) => l.quantity > 0 && l.unit_price >= 0);
    return true;
  }, [step, state]);

  const customerDisplayName = () => {
    if (state.customerMode === 'walkin') return 'Walk-in Customer';
    if (state.customerMode === 'new') return state.newCustomer.name || 'New Customer';
    return existingName;
  };

  const { data: customersData } = useGetCustomers({ limit: 100 });
  const existingName = useMemo(() => {
    const c = customersData?.data?.find((c) => c.id.toString() === state.customerId);
    return c?.name ?? '';
  }, [customersData, state.customerId]);

  async function handleSubmit(status: 'draft' | 'sent') {
    if (state.lines.length === 0) { toast.error('Add at least one product'); return; }
    try {
      // Resolve customer id (create inline if needed)
      let customerId: number | undefined;
      if (state.customerMode === 'existing' && state.customerId) {
        customerId = parseInt(state.customerId, 10);
      } else if (state.customerMode === 'new' && state.newCustomer.name.trim()) {
        const created = await createCustomer.mutateAsync({
          data: {
            name: state.newCustomer.name.trim(),
            company: state.newCustomer.company || undefined,
            contact_person: state.newCustomer.contact_person || undefined,
            phone: state.newCustomer.phone || undefined,
            email: state.newCustomer.email || undefined,
            address: state.newCustomer.address || undefined,
            tax_number: state.newCustomer.tax_number || undefined,
          },
        });
        customerId = (created as any).id;
      }

      const items = state.lines.map((l) => ({
        product_id: l.product_id,
        description: l.description || undefined,
        unit: l.unit || undefined,
        quantity: l.quantity,
        unit_price: l.unit_price,
        discount: l.discount || 0,
        vat_rate: l.vat_rate ?? 16,
      }));

      let record: any;
      if (isQuote) {
        record = await createQuotation.mutateAsync({
          data: {
            customer_id: customerId,
            items,
            discount_amount: state.manualDiscount || 0,
            notes: state.notes || undefined,
            valid_until: state.validUntil || undefined,
            delivery_time: state.deliveryTime || undefined,
            warranty: state.warranty || undefined,
            payment_terms: state.paymentTerms || undefined,
            status,
          } as any,
        });
        toast.success(status === 'draft' ? 'Quotation saved as draft' : `Quotation ${record.quotation_number} created`);
      } else {
        record = await createInvoice.mutateAsync({
          data: {
            customer_id: customerId,
            items,
            discount_amount: state.manualDiscount || 0,
            notes: state.notes || undefined,
            due_date: state.dueDate || undefined,
            status,
          } as any,
        });
        toast.success(status === 'draft' ? 'Invoice saved as draft' : `Invoice ${record.invoice_number} created`);
      }
      onCreated?.(record);
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save. Please try again.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2">
            {isQuote ? 'New Quotation' : 'Create Invoice'}
          </DialogTitle>
          {/* Stepper */}
          <div className="flex items-center gap-1 mt-3 flex-wrap">
            {STEPS.map((label, i) => (
              <React.Fragment key={label}>
                <button
                  type="button"
                  onClick={() => i < step && setStep(i)}
                  className={`flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-md transition-colors ${
                    i === step ? 'bg-primary text-primary-foreground'
                    : i < step ? 'text-primary hover:bg-primary/10 cursor-pointer' : 'text-muted-foreground'
                  }`}
                >
                  <span className={`flex items-center justify-center w-4 h-4 rounded-full text-[10px] ${
                    i < step ? 'bg-primary text-primary-foreground' : i === step ? 'bg-primary-foreground text-primary' : 'bg-muted'
                  }`}>
                    {i < step ? <Check className="w-2.5 h-2.5" /> : i + 1}
                  </span>
                  {label}
                </button>
                {i < STEPS.length - 1 && <ChevronRight className="w-3 h-3 text-muted-foreground" />}
              </React.Fragment>
            ))}
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 px-6 py-4 overflow-y-auto">
          {step === 0 && <CustomerStep state={state} patch={patch} />}
          {step === 1 && <ProductsStep state={state} patch={patch} />}
          {step === 2 && <PricingStep state={state} patch={patch} totals={totals} />}
          {step === 3 && (isQuote
            ? <QuotationTermsStep state={state} patch={patch} />
            : <InvoiceDetailsStep state={state} patch={patch} totals={totals} />)}
          {step === 4 && <PreviewStep mode={mode} state={state} totals={totals} customerName={customerDisplayName()} />}
        </ScrollArea>

        <DialogFooter className="px-6 py-4 border-t flex-row items-center justify-between gap-2 sm:justify-between">
          <div>
            {step > 0 && (
              <Button type="button" variant="ghost" onClick={() => setStep((s) => s - 1)} disabled={isSaving}>
                <ChevronLeft className="w-4 h-4 mr-1" /> Back
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {step < STEPS.length - 1 ? (
              <Button type="button" onClick={() => setStep((s) => s + 1)} disabled={!canNext}>
                Next <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={() => handleSubmit('draft')} disabled={isSaving}>
                  Save Draft
                </Button>
                <Button type="button" onClick={() => handleSubmit('sent')} disabled={isSaving}>
                  {isSaving ? 'Saving…' : (isQuote ? 'Create Quotation' : 'Create Invoice')}
                </Button>
              </>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Step 1: Customer ──────────────────────────────────────────────────────────
function CustomerStep({ state, patch }: { state: WizardState; patch: (p: Partial<WizardState>) => void }) {
  const [search, setSearch] = useState('');
  const { data: customersData, isLoading } = useGetCustomers({ search: search || undefined, limit: 50 });

  const modes: Array<{ key: WizardState['customerMode']; label: string; icon: React.ReactNode }> = [
    { key: 'walkin', label: 'Walk-in', icon: <Users className="w-4 h-4" /> },
    { key: 'existing', label: 'Existing', icon: <User className="w-4 h-4" /> },
    { key: 'new', label: 'New', icon: <UserPlus className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        {modes.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => patch({ customerMode: m.key })}
            className={`flex items-center justify-center gap-2 py-3 rounded-lg border text-sm font-medium transition-colors ${
              state.customerMode === m.key ? 'border-primary bg-primary/5 text-primary' : 'hover:bg-muted/50'
            }`}
          >
            {m.icon} {m.label}
          </button>
        ))}
      </div>

      {state.customerMode === 'walkin' && (
        <p className="text-sm text-muted-foreground p-4 bg-muted/30 rounded-lg">
          No customer record needed. The document will be addressed to a walk-in customer.
        </p>
      )}

      {state.customerMode === 'existing' && (
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search customers…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="border rounded-lg max-h-64 overflow-y-auto divide-y">
            {isLoading ? (
              <p className="p-3 text-sm text-muted-foreground">Loading…</p>
            ) : (customersData?.data ?? []).length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">No customers found.</p>
            ) : customersData!.data!.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => patch({ customerId: c.id.toString() })}
                className={`w-full text-left px-3 py-2.5 text-sm hover:bg-muted/50 flex items-center justify-between ${
                  state.customerId === c.id.toString() ? 'bg-primary/5' : ''
                }`}
              >
                <div>
                  <p className="font-medium">{c.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {[c.company, c.phone].filter(Boolean).join(' · ') || 'No contact info'}
                  </p>
                </div>
                {state.customerId === c.id.toString() && <Check className="w-4 h-4 text-primary" />}
              </button>
            ))}
          </div>
        </div>
      )}

      {state.customerMode === 'new' && (
        <div className="grid grid-cols-2 gap-3">
          <LabeledInput label="Name *" value={state.newCustomer.name}
            onChange={(v) => patch({ newCustomer: { ...state.newCustomer, name: v } })} />
          <LabeledInput label="Company" value={state.newCustomer.company}
            onChange={(v) => patch({ newCustomer: { ...state.newCustomer, company: v } })} />
          <LabeledInput label="Contact Person" value={state.newCustomer.contact_person}
            onChange={(v) => patch({ newCustomer: { ...state.newCustomer, contact_person: v } })} />
          <LabeledInput label="Phone" value={state.newCustomer.phone}
            onChange={(v) => patch({ newCustomer: { ...state.newCustomer, phone: v } })} />
          <LabeledInput label="Email" value={state.newCustomer.email}
            onChange={(v) => patch({ newCustomer: { ...state.newCustomer, email: v } })} />
          <LabeledInput label="KRA PIN" value={state.newCustomer.tax_number}
            onChange={(v) => patch({ newCustomer: { ...state.newCustomer, tax_number: v } })} />
          <div className="col-span-2">
            <LabeledInput label="Address" value={state.newCustomer.address}
              onChange={(v) => patch({ newCustomer: { ...state.newCustomer, address: v } })} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Step 2: Products ──────────────────────────────────────────────────────────
function ProductsStep({ state, patch }: { state: WizardState; patch: (p: Partial<WizardState>) => void }) {
  const [search, setSearch] = useState('');
  const [barcode, setBarcode] = useState('');
  const { data: productsData, isLoading } = useGetProducts({ search: search || undefined, limit: 30 });

  const addProduct = (p: Product) => {
    const existing = state.lines.find((l) => l.product_id === p.id);
    if (existing) {
      patch({ lines: state.lines.map((l) => l.product_id === p.id ? { ...l, quantity: l.quantity + 1 } : l) });
    } else {
      patch({ lines: [...state.lines, {
        product_id: p.id,
        product_name: p.product_name,
        description: '',
        unit: p.unit ?? '',
        quantity: 1,
        unit_price: p.selling_price,
        discount: 0,
        vat_rate: (p as any).vat_rate ?? 16,
      }] });
    }
  };

  const handleBarcode = async () => {
    const code = barcode.trim();
    if (!code) return;
    setBarcode('');
    try {
      const res = await fetch(`${getApiUrl()}products/barcode/${encodeURIComponent(code)}`, { credentials: 'include' });
      if (res.status === 404) { toast.error(`No product for barcode ${code}`); return; }
      if (!res.ok) { toast.error(`Lookup failed (${res.status})`); return; }
      const product: Product = await res.json();
      addProduct(product);
      toast.success(`Added ${product.product_name}`);
    } catch {
      toast.error('Network error during barcode lookup');
    }
  };

  const updateLine = (idx: number, p: Partial<DocLine>) =>
    patch({ lines: state.lines.map((l, i) => i === idx ? { ...l, ...p } : l) });
  const removeLine = (idx: number) => patch({ lines: state.lines.filter((_, i) => i !== idx) });

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search products by name or code…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="relative w-52">
          <Barcode className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Barcode + Enter" className="pl-9 font-mono" value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleBarcode(); } }} />
        </div>
      </div>

      {search && (
        <div className="border rounded-lg max-h-44 overflow-y-auto divide-y">
          {isLoading ? <p className="p-3 text-sm text-muted-foreground">Loading…</p>
          : (productsData?.data ?? []).length === 0 ? <p className="p-3 text-sm text-muted-foreground">No products found.</p>
          : productsData!.data!.map((p) => (
            <button key={p.id} type="button" onClick={() => addProduct(p)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 flex items-center justify-between">
              <div>
                <p className="font-medium">{p.product_name}</p>
                <p className="text-xs text-muted-foreground">{p.product_code} · {formatCurrency(p.selling_price)}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={p.current_stock > 0 ? 'secondary' : 'destructive'} className="text-[10px]">
                  {p.current_stock} {p.unit}
                </Badge>
                <Plus className="w-4 h-4 text-primary" />
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Selected lines */}
      {state.lines.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground text-sm border border-dashed rounded-lg">
          No products added yet. Search above or scan a barcode.
        </div>
      ) : (
        <div className="space-y-2">
          {state.lines.map((line, idx) => (
            <div key={line.product_id} className="border rounded-lg p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <p className="font-medium text-sm">{line.product_name}</p>
                  <Input
                    placeholder="Description (optional)"
                    className="mt-1 h-7 text-xs"
                    value={line.description ?? ''}
                    onChange={(e) => updateLine(idx, { description: e.target.value })}
                  />
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive shrink-0" onClick={() => removeLine(idx)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
              <div className="grid grid-cols-5 gap-2">
                <MiniField label="Qty">
                  <Input type="number" min={1} className="h-8" value={line.quantity}
                    onChange={(e) => updateLine(idx, { quantity: Math.max(1, parseInt(e.target.value) || 1) })} />
                </MiniField>
                <MiniField label="Unit">
                  <Input className="h-8" value={line.unit ?? ''} onChange={(e) => updateLine(idx, { unit: e.target.value })} />
                </MiniField>
                <MiniField label="Price">
                  <Input type="number" min={0} step="0.01" className="h-8" value={line.unit_price}
                    onChange={(e) => updateLine(idx, { unit_price: parseFloat(e.target.value) || 0 })} />
                </MiniField>
                <MiniField label="Disc %">
                  <Input type="number" min={0} max={100} className="h-8" value={line.discount}
                    onChange={(e) => updateLine(idx, { discount: Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)) })} />
                </MiniField>
                <MiniField label="VAT %">
                  <Input type="number" min={0} className="h-8" value={line.vat_rate}
                    onChange={(e) => updateLine(idx, { vat_rate: Math.max(0, parseFloat(e.target.value) || 0) })} />
                </MiniField>
              </div>
              <div className="text-right text-sm">
                <span className="text-muted-foreground">Line total: </span>
                <span className="font-semibold">{formatCurrency(lineTotal(line))}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Step 3: Pricing ───────────────────────────────────────────────────────────
function PricingStep({ state, patch, totals }: { state: WizardState; patch: (p: Partial<WizardState>) => void; totals: ReturnType<typeof computeTotals> }) {
  return (
    <div className="space-y-4">
      <div className="border rounded-lg divide-y">
        <TotalRow label="Subtotal (excl. VAT)" value={formatCurrency(totals.subtotal)} />
        {totals.lineDiscount > 0 && <TotalRow label="Line discounts" value={`- ${formatCurrency(totals.lineDiscount)}`} />}
        <TotalRow label="VAT" value={formatCurrency(totals.taxAmount)} />
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-sm text-muted-foreground">Manual discount (KES)</span>
          <Input type="number" min={0} step="0.01" className="w-40 h-9 text-right"
            value={state.manualDiscount || ''}
            onChange={(e) => patch({ manualDiscount: Math.max(0, parseFloat(e.target.value) || 0) })} />
        </div>
        <div className="flex items-center justify-between px-4 py-3 bg-primary text-primary-foreground font-bold rounded-b-lg">
          <span>Grand Total</span>
          <span>{formatCurrency(totals.total)}</span>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        VAT is calculated per line on the amount after any line discount. The manual discount is deducted from the grand total.
      </p>
    </div>
  );
}

// ── Step 4a: Quotation terms ─────────────────────────────────────────────────
function QuotationTermsStep({ state, patch }: { state: WizardState; patch: (p: Partial<WizardState>) => void }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Valid Until</label>
        <Input type="date" value={state.validUntil} onChange={(e) => patch({ validUntil: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Payment Terms</label>
        <Select value={state.paymentTerms} onValueChange={(v) => patch({ paymentTerms: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {PAYMENT_TERMS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <LabeledInput label="Delivery Time" value={state.deliveryTime} onChange={(v) => patch({ deliveryTime: v })} placeholder="e.g. 3-5 working days" />
      <LabeledInput label="Warranty" value={state.warranty} onChange={(v) => patch({ warranty: v })} placeholder="e.g. 12 months" />
      <div className="col-span-2 space-y-1.5">
        <label className="text-sm font-medium">Notes</label>
        <Textarea rows={3} value={state.notes} onChange={(e) => patch({ notes: e.target.value })} placeholder="Additional notes for the customer…" />
      </div>
    </div>
  );
}

// ── Step 4b: Invoice details ─────────────────────────────────────────────────
function InvoiceDetailsStep({ state, patch, totals }: { state: WizardState; patch: (p: Partial<WizardState>) => void; totals: ReturnType<typeof computeTotals> }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Due Date</label>
          <Input type="date" value={state.dueDate} onChange={(e) => patch({ dueDate: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Balance Due</label>
          <div className="h-9 flex items-center px-3 rounded-md border bg-muted/40 font-semibold text-destructive">
            {formatCurrency(totals.total)}
          </div>
        </div>
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Notes</label>
        <Textarea rows={3} value={state.notes} onChange={(e) => patch({ notes: e.target.value })} placeholder="Additional notes…" />
      </div>
      <p className="text-xs text-muted-foreground">
        The invoice is created as unpaid — record payments from the invoices list once the customer pays.
      </p>
    </div>
  );
}

// ── Step 5: Preview ───────────────────────────────────────────────────────────
function PreviewStep({ mode, state, totals, customerName }: {
  mode: WizardMode; state: WizardState; totals: ReturnType<typeof computeTotals>; customerName: string;
}) {
  const isQuote = mode === 'quotation';
  const { branding: companyBranding } = useBranding();
  const branchMap = useBranchLookup();
  const { activeBranchId } = useBranch();
  // The document will be owned by the selected branch (super admins) or the
  // user's own branch (single visible branch); otherwise fall back to company.
  const targetBranch =
    activeBranchId != null ? branchMap.get(activeBranchId)
    : branchMap.size === 1 ? [...branchMap.values()][0]
    : undefined;
  const branding = brandingForBranch(companyBranding, targetBranch, isQuote ? 'quotation' : 'invoice');
  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-start gap-3 p-4 rounded-lg bg-primary/5 border border-primary/15">
        <img src={branding.logoUrl} alt={branding.name} className="w-12 h-12 object-contain rounded" />
        <div>
          <p className="font-bold text-primary">{branding.name}</p>
          <p className="text-xs text-muted-foreground">{branding.addressLine}</p>
          <p className="text-xs text-muted-foreground">{branding.phone} · {branding.email}</p>
        </div>
        <div className="ml-auto text-right">
          <p className="font-bold text-lg text-primary">{isQuote ? 'QUOTATION' : 'TAX INVOICE'}</p>
          <p className="text-xs text-muted-foreground">Draft — number assigned on save</p>
          <p className="text-xs text-muted-foreground">{format(new Date(), 'dd MMM yyyy')}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="p-3 bg-muted/30 rounded-lg">
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">{isQuote ? 'Prepared For' : 'Billed To'}</p>
          <p className="font-medium">{customerName}</p>
        </div>
        <div className="p-3 bg-muted/30 rounded-lg">
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">{isQuote ? 'Valid Until' : 'Due Date'}</p>
          <p className="font-medium">
            {isQuote
              ? (state.validUntil ? format(new Date(state.validUntil), 'dd MMM yyyy') : 'Until further notice')
              : (state.dueDate ? format(new Date(state.dueDate), 'dd MMM yyyy') : 'On receipt')}
          </p>
        </div>
      </div>

      <table className="w-full border rounded-lg overflow-hidden text-xs">
        <thead className="bg-primary text-primary-foreground">
          <tr>
            <th className="px-3 py-2 text-left">Item</th>
            <th className="px-3 py-2 text-right">Qty</th>
            <th className="px-3 py-2 text-right">Unit Price</th>
            <th className="px-3 py-2 text-right">VAT</th>
            <th className="px-3 py-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {state.lines.map((l) => (
            <tr key={l.product_id} className="border-t">
              <td className="px-3 py-2">
                {l.product_name}
                {l.description ? <span className="block text-muted-foreground">{l.description}</span> : null}
              </td>
              <td className="px-3 py-2 text-right">{l.quantity} {l.unit}</td>
              <td className="px-3 py-2 text-right">{formatCurrency(l.unit_price)}</td>
              <td className="px-3 py-2 text-right">{l.vat_rate}%</td>
              <td className="px-3 py-2 text-right font-medium">{formatCurrency(lineTotal(l))}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex justify-end">
        <div className="w-64 border rounded-lg overflow-hidden text-sm">
          <div className="flex justify-between px-4 py-2 bg-muted/30 border-b">
            <span className="text-muted-foreground">Subtotal</span><span>{formatCurrency(totals.subtotal)}</span>
          </div>
          <div className="flex justify-between px-4 py-2 border-b">
            <span className="text-muted-foreground">VAT</span><span>{formatCurrency(totals.taxAmount)}</span>
          </div>
          {totals.discountAmount > 0 && (
            <div className="flex justify-between px-4 py-2 border-b">
              <span className="text-muted-foreground">Discount</span><span>- {formatCurrency(totals.discountAmount)}</span>
            </div>
          )}
          <div className="flex justify-between px-4 py-3 bg-primary text-primary-foreground font-bold">
            <span>Total</span><span>{formatCurrency(totals.total)}</span>
          </div>
        </div>
      </div>

      {isQuote && (state.deliveryTime || state.warranty || state.paymentTerms) && (
        <div className="grid grid-cols-3 gap-3 text-xs">
          {state.paymentTerms && <InfoChip label="Payment Terms" value={state.paymentTerms} />}
          {state.deliveryTime && <InfoChip label="Delivery" value={state.deliveryTime} />}
          {state.warranty && <InfoChip label="Warranty" value={state.warranty} />}
        </div>
      )}

      {state.notes && (
        <div className="p-3 bg-muted/30 rounded-lg text-xs">
          <p className="uppercase tracking-wide text-muted-foreground mb-1">Notes</p>
          <p>{state.notes}</p>
        </div>
      )}

      <p className="text-center text-xs text-muted-foreground pt-2">
        {branding.documentFooter || `Thank you for choosing ${branding.name}.`}
      </p>
    </div>
  );
}

// ── Small helpers ─────────────────────────────────────────────────────────────
function LabeledInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">{label}</label>
      <Input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
function MiniField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 text-sm">
      <span className="text-muted-foreground">{label}</span><span>{value}</span>
    </div>
  );
}
function InfoChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-2.5 bg-muted/30 rounded-lg">
      <p className="uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="font-medium mt-0.5">{value}</p>
    </div>
  );
}
