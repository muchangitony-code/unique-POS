import React, { useState } from 'react';
import { 
  useGetQuotations, 
  useConvertQuotationToInvoice,
} from '@workspace/api-client-react';
import { formatCurrency } from '@/lib/format';
import { format } from 'date-fns';
import { Plus, Search, FileOutput, Printer, Eye, Copy, Mail, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { getGetQuotationsQueryKey } from '@workspace/api-client-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useGetSettings } from '@workspace/api-client-react';
import { printQuotation, toPaymentDetails, type PrintQuotation } from '@/lib/printDoc';
import { getBranding, brandingForBranch } from '@/lib/company';
import { useBranchLookup } from '@/lib/branchLookup';
import { DocumentWizard } from '@/components/documents/DocumentWizard';
import { emailDocumentUrl, whatsappDocumentUrl } from '@/lib/docShare';

function toPrintQuotation(q: any): PrintQuotation {
  return {
    quotation_number: q.quotation_number,
    customer_name:    q.customer_name,
    created_at:       q.created_at,
    valid_until:      q.valid_until,
    status:           q.status,
    notes:            q.notes,
    items: (q.items ?? []).map((it: any) => ({
      product_name: it.product_name,
      quantity:     it.quantity,
      unit_price:   it.unit_price,
      discount:     it.discount ?? 0,
      vat_rate:     it.vat_rate ?? 16,
      total:        it.total,
    })),
    subtotal: q.subtotal ?? 0,
    total:    q.total,
  };
}

function toWizardInitial(q: any) {
  return {
    customerMode: (q.customer_id ? 'existing' : 'walkin') as 'existing' | 'walkin',
    customerId: q.customer_id ? String(q.customer_id) : '',
    lines: (q.items ?? []).map((it: any) => ({
      product_id: it.product_id,
      product_name: it.product_name,
      description: it.description ?? '',
      unit: it.unit ?? '',
      quantity: it.quantity,
      unit_price: it.unit_price,
      discount: it.discount ?? 0,
      vat_rate: it.vat_rate ?? 16,
    })),
    notes: q.notes ?? '',
    validUntil: q.valid_until ?? '',
    deliveryTime: q.delivery_time ?? '',
    warranty: q.warranty ?? '',
    paymentTerms: q.payment_terms ?? 'Cash',
  };
}

export default function Quotations() {
  const [search, setSearch] = useState('');
  const [viewQuotation, setViewQuotation] = useState<any>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardInitial, setWizardInitial] = useState<any>(null);
  const { data: quotations, isLoading } = useGetQuotations({});
  const { data: settings } = useGetSettings();
  const payment = toPaymentDetails(settings);
  const branchMap = useBranchLookup();
  const viewBranding = viewQuotation
    ? brandingForBranch(getBranding(), branchMap.get(viewQuotation.branch_id), 'quotation')
    : getBranding();
  const convertQuotation = useConvertQuotationToInvoice();
  const queryClient = useQueryClient();

  const filtered = React.useMemo(() => {
    const q = search.toLowerCase();
    return quotations?.data?.filter(
      (qt) =>
        qt.quotation_number?.toLowerCase().includes(q) ||
        (qt.customer_name ?? '').toLowerCase().includes(q)
    ) ?? [];
  }, [quotations, search]);

  const handleConvert = (id: number) => {
    if (confirm('Convert this quotation to a real invoice?')) {
      convertQuotation.mutate({ id }, {
        onSuccess: () => {
          toast.success('Converted to invoice successfully');
          queryClient.invalidateQueries({ queryKey: getGetQuotationsQueryKey() });
        },
      });
    }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'accepted':  return 'default';
      case 'converted': return 'outline';
      case 'rejected':
      case 'expired':   return 'destructive';
      default:          return 'secondary';
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search quotations..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button onClick={() => { setWizardInitial(null); setWizardOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" /> New Quotation
        </Button>
      </div>

      <DocumentWizard
        mode="quotation"
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        initial={wizardInitial}
        onCreated={() => queryClient.invalidateQueries({ queryKey: getGetQuotationsQueryKey() })}
      />

      <div className="bg-card border rounded-lg overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-muted-foreground bg-muted/50 uppercase border-b">
            <tr>
              <th className="px-4 py-3">Quote #</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Valid Until</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3 text-center">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b">
                  <td colSpan={7} className="p-4"><Skeleton className="h-6 w-full" /></td>
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-muted-foreground">
                  {search ? 'No quotations match your search.' : 'No quotations found.'}
                </td>
              </tr>
            ) : (
              filtered.map((quote) => (
                <tr key={quote.id} className="border-b hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-3 font-medium text-primary">{quote.quotation_number}</td>
                  <td className="px-4 py-3">{quote.customer_name || 'Walk-in'}</td>
                  <td className="px-4 py-3">{format(new Date(quote.created_at), 'dd MMM yyyy')}</td>
                  <td className="px-4 py-3">
                    {quote.valid_until ? format(new Date(quote.valid_until), 'dd MMM yyyy') : '-'}
                  </td>
                  <td className="px-4 py-3 text-right font-medium">{formatCurrency(quote.total)}</td>
                  <td className="px-4 py-3 text-center">
                    <Badge
                      variant={statusColor(quote.status)}
                      className={quote.status === 'converted' ? 'border-green-500 text-green-600 bg-green-50' : ''}
                    >
                      {quote.status.toUpperCase()}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" size="sm" title="Preview" onClick={() => setViewQuotation(quote)}>
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Duplicate"
                        onClick={() => { setWizardInitial(toWizardInitial(quote)); setWizardOpen(true); }}
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Print Quotation"
                        onClick={() => printQuotation({ ...toPrintQuotation(quote), payment }, branchMap.get((quote as { branch_id?: number }).branch_id ?? -1))}
                      >
                        <Printer className="w-4 h-4" />
                      </Button>
                      {quote.status !== 'converted' && quote.status !== 'rejected' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Convert to Invoice"
                          onClick={() => handleConvert(quote.id)}
                          className="text-primary"
                        >
                          <FileOutput className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Quotation Preview Dialog */}
      <Dialog open={!!viewQuotation} onOpenChange={() => setViewQuotation(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Quotation — {viewQuotation?.quotation_number}</span>
              <div className="flex items-center gap-2 mr-6">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => window.open(emailDocumentUrl({
                    kind: 'Quotation', number: viewQuotation.quotation_number,
                    customerName: viewQuotation.customer_name, total: viewQuotation.total,
                  }), '_blank')}
                >
                  <Mail className="w-4 h-4 mr-1.5" /> Email
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => window.open(whatsappDocumentUrl({
                    kind: 'Quotation', number: viewQuotation.quotation_number,
                    customerName: viewQuotation.customer_name, total: viewQuotation.total,
                  }), '_blank')}
                >
                  <MessageCircle className="w-4 h-4 mr-1.5" /> WhatsApp
                </Button>
                <Button
                  size="sm"
                  onClick={() => printQuotation({ ...toPrintQuotation(viewQuotation), payment }, branchMap.get(viewQuotation.branch_id))}
                >
                  <Printer className="w-4 h-4 mr-1.5" /> Print / PDF
                </Button>
              </div>
            </DialogTitle>
          </DialogHeader>
          {viewQuotation && (
            <div className="space-y-4 text-sm">
              {/* Header preview */}
              <div className="flex items-start gap-3 p-4 rounded-lg bg-primary/5 border border-primary/15">
                <img
                  src={viewBranding.logoUrl}
                  alt="Logo"
                  className="w-12 h-12 object-contain rounded"
                />
                <div>
                  <p className="font-bold text-primary">{viewBranding.name}</p>
                  <p className="text-xs text-muted-foreground">{viewBranding.addressLine}</p>
                  <p className="text-xs text-muted-foreground">{viewBranding.phone} · {viewBranding.email}</p>
                </div>
                <div className="ml-auto text-right">
                  <p className="font-bold text-lg text-primary">QUOTATION</p>
                  <p className="text-xs text-muted-foreground">{viewQuotation.quotation_number}</p>
                  <p className="text-xs text-muted-foreground">{format(new Date(viewQuotation.created_at), 'dd MMM yyyy')}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-muted/30 rounded-lg">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Prepared For</p>
                  <p className="font-medium">{viewQuotation.customer_name || 'Valued Customer'}</p>
                </div>
                <div className="p-3 bg-muted/30 rounded-lg">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Valid Until</p>
                  <p className="font-medium">
                    {viewQuotation.valid_until
                      ? format(new Date(viewQuotation.valid_until), 'dd MMM yyyy')
                      : 'Until further notice'}
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
                  {(viewQuotation.items ?? []).map((it: any, i: number) => (
                    <tr key={i} className="border-t">
                      <td className="px-3 py-2">{it.product_name}</td>
                      <td className="px-3 py-2 text-right">{it.quantity}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(it.unit_price)}</td>
                      <td className="px-3 py-2 text-right">{it.vat_rate}%</td>
                      <td className="px-3 py-2 text-right font-medium">{formatCurrency(it.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="flex justify-end">
                <div className="w-56 border rounded-lg overflow-hidden text-sm">
                  <div className="flex justify-between px-4 py-2 bg-muted/30 border-b">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>{formatCurrency(viewQuotation.subtotal)}</span>
                  </div>
                  <div className="flex justify-between px-4 py-3 bg-primary text-primary-foreground font-bold">
                    <span>Total</span>
                    <span>{formatCurrency(viewQuotation.total)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
