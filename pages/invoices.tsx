import React from 'react';
import { 
  useGetInvoices, 
  useRecordInvoicePayment,
} from '@workspace/api-client-react';
import { formatCurrency } from '@/lib/format';
import { format } from 'date-fns';
import { Plus, Search, DollarSign, Printer, Eye, Mail, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { getGetInvoicesQueryKey } from '@workspace/api-client-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useGetSettings } from '@workspace/api-client-react';
import { printInvoice, toPaymentDetails, type PrintInvoice } from '@/lib/printDoc';
import { getBranding, brandingForBranch } from '@/lib/company';
import { useBranchLookup } from '@/lib/branchLookup';
import { DocumentWizard } from '@/components/documents/DocumentWizard';
import { emailDocumentUrl, whatsappDocumentUrl } from '@/lib/docShare';

// Normalise invoice from API into our PrintInvoice shape
function toPrintInvoice(invoice: any): PrintInvoice {
  return {
    invoice_number:  invoice.invoice_number,
    customer_name:   invoice.customer_name,
    created_at:      invoice.created_at,
    due_date:        invoice.due_date,
    status:          invoice.status,
    notes:           invoice.notes,
    items:           (invoice.items ?? []).map((it: any) => ({
      product_name: it.product_name,
      quantity:     it.quantity,
      unit_price:   it.unit_price,
      discount:     it.discount ?? 0,
      vat_rate:     it.vat_rate ?? 16,
      total:        it.total,
    })),
    subtotal:       invoice.subtotal ?? 0,
    tax_amount:     invoice.tax_amount ?? 0,
    discount_amount: invoice.discount_amount ?? 0,
    total:          invoice.total,
    amount_paid:    invoice.amount_paid ?? 0,
    balance_due:    invoice.balance_due ?? invoice.total,
  };
}

export default function Invoices() {
  const [search, setSearch] = React.useState('');
  const [paymentInvoiceId, setPaymentInvoiceId] = React.useState<number | null>(null);
  const [paymentAmount, setPaymentAmount] = React.useState('');
  const [paymentMethod, setPaymentMethod] = React.useState('bank_transfer');
  const [viewInvoice, setViewInvoice] = React.useState<any>(null);
  const [wizardOpen, setWizardOpen] = React.useState(false);

  const { data: invoices, isLoading } = useGetInvoices({});
  const { data: settings } = useGetSettings();
  const payment = toPaymentDetails(settings);
  const branchMap = useBranchLookup();
  const viewBranding = viewInvoice
    ? brandingForBranch(getBranding(), branchMap.get(viewInvoice.branch_id), 'invoice')
    : getBranding();
  const recordPayment = useRecordInvoicePayment();
  const queryClient = useQueryClient();

  const filtered = React.useMemo(() => {
    const q = search.toLowerCase();
    return invoices?.data?.filter(
      (inv) =>
        inv.invoice_number?.toLowerCase().includes(q) ||
        (inv.customer_name ?? '').toLowerCase().includes(q)
    ) ?? [];
  }, [invoices, search]);

  const handleRecordPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentInvoiceId) return;
    recordPayment.mutate(
      { id: paymentInvoiceId, data: { amount: parseFloat(paymentAmount), method: paymentMethod as any } },
      {
        onSuccess: () => {
          toast.success('Payment recorded successfully');
          queryClient.invalidateQueries({ queryKey: getGetInvoicesQueryKey() });
          setPaymentInvoiceId(null);
          setPaymentAmount('');
        },
      }
    );
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'paid':    return 'outline';
      case 'partial': return 'default';
      case 'overdue': return 'destructive';
      default:        return 'secondary';
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search invoices..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button onClick={() => setWizardOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Create Invoice
        </Button>
      </div>

      <DocumentWizard
        mode="invoice"
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        onCreated={() => queryClient.invalidateQueries({ queryKey: getGetInvoicesQueryKey() })}
      />

      <div className="bg-card border rounded-lg overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-muted-foreground bg-muted/50 uppercase border-b">
            <tr>
              <th className="px-4 py-3">Invoice #</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Due Date</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3 text-right">Balance Due</th>
              <th className="px-4 py-3 text-center">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b">
                  <td colSpan={8} className="p-4"><Skeleton className="h-6 w-full" /></td>
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-8 text-center text-muted-foreground">
                  {search ? 'No invoices match your search.' : 'No invoices found.'}
                </td>
              </tr>
            ) : (
              filtered.map((invoice) => (
                <tr key={invoice.id} className="border-b hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-3 font-medium text-primary">{invoice.invoice_number}</td>
                  <td className="px-4 py-3">{invoice.customer_name || 'Walk-in'}</td>
                  <td className="px-4 py-3">{format(new Date(invoice.created_at), 'dd MMM yyyy')}</td>
                  <td className="px-4 py-3">
                    {invoice.due_date ? format(new Date(invoice.due_date), 'dd MMM yyyy') : '-'}
                  </td>
                  <td className="px-4 py-3 text-right">{formatCurrency(invoice.total)}</td>
                  <td className="px-4 py-3 text-right font-medium text-destructive">
                    {formatCurrency(invoice.balance_due)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge
                      variant={statusColor(invoice.status)}
                      className={invoice.status === 'paid' ? 'border-green-500 text-green-600 bg-green-50' : ''}
                    >
                      {invoice.status.toUpperCase()}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Preview & Print"
                        onClick={() => setViewInvoice(invoice)}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Print Invoice"
                        onClick={() => printInvoice({ ...toPrintInvoice(invoice), payment }, branchMap.get((invoice as { branch_id?: number }).branch_id ?? -1))}
                      >
                        <Printer className="w-4 h-4" />
                      </Button>
                      {invoice.balance_due > 0 && invoice.status !== 'cancelled' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setPaymentInvoiceId(invoice.id);
                            setPaymentAmount(invoice.balance_due.toString());
                          }}
                        >
                          <DollarSign className="w-4 h-4 text-green-600" />
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

      {/* Invoice Preview Dialog */}
      <Dialog open={!!viewInvoice} onOpenChange={() => setViewInvoice(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Invoice — {viewInvoice?.invoice_number}</span>
              <div className="flex items-center gap-2 mr-6">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => window.open(emailDocumentUrl({
                    kind: 'Invoice', number: viewInvoice.invoice_number,
                    customerName: viewInvoice.customer_name, total: viewInvoice.total,
                  }), '_blank')}
                >
                  <Mail className="w-4 h-4 mr-1.5" /> Email
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => window.open(whatsappDocumentUrl({
                    kind: 'Invoice', number: viewInvoice.invoice_number,
                    customerName: viewInvoice.customer_name, total: viewInvoice.total,
                  }), '_blank')}
                >
                  <MessageCircle className="w-4 h-4 mr-1.5" /> WhatsApp
                </Button>
                <Button
                  size="sm"
                  onClick={() => printInvoice({ ...toPrintInvoice(viewInvoice), payment }, branchMap.get(viewInvoice.branch_id))}
                >
                  <Printer className="w-4 h-4 mr-1.5" /> Print / PDF
                </Button>
              </div>
            </DialogTitle>
          </DialogHeader>
          {viewInvoice && (
            <div className="space-y-4 text-sm">
              {/* Company header preview */}
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
                  <p className="text-xs text-muted-foreground">KRA PIN: {viewBranding.kraPin}</p>
                </div>
                <div className="ml-auto text-right">
                  <p className="font-bold text-lg text-primary">TAX INVOICE</p>
                  <p className="text-xs text-muted-foreground">{viewInvoice.invoice_number}</p>
                  <p className="text-xs text-muted-foreground">{format(new Date(viewInvoice.created_at), 'dd MMM yyyy')}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-muted/30 rounded-lg">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Billed To</p>
                  <p className="font-medium">{viewInvoice.customer_name || 'Walk-in Customer'}</p>
                </div>
                <div className="p-3 bg-muted/30 rounded-lg">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Details</p>
                  <p className="font-medium">{viewInvoice.invoice_number}</p>
                  <p className="text-xs text-muted-foreground">
                    {viewInvoice.due_date ? `Due: ${format(new Date(viewInvoice.due_date), 'dd MMM yyyy')}` : 'No due date'}
                  </p>
                </div>
              </div>

              {/* Items */}
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
                  {(viewInvoice.items ?? []).map((it: any, i: number) => (
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

              {/* Totals */}
              <div className="flex justify-end">
                <div className="w-64 border rounded-lg overflow-hidden text-sm">
                  <div className="flex justify-between px-4 py-2 bg-muted/30 border-b">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>{formatCurrency(viewInvoice.subtotal)}</span>
                  </div>
                  {viewInvoice.amount_paid > 0 && (
                    <div className="flex justify-between px-4 py-2 border-b">
                      <span className="text-muted-foreground">Paid</span>
                      <span className="text-green-600">- {formatCurrency(viewInvoice.amount_paid)}</span>
                    </div>
                  )}
                  <div className="flex justify-between px-4 py-3 bg-primary text-primary-foreground font-bold">
                    <span>Balance Due</span>
                    <span>{formatCurrency(viewInvoice.balance_due)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Record Payment Dialog */}
      <Dialog open={!!paymentInvoiceId} onOpenChange={() => setPaymentInvoiceId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleRecordPayment} className="space-y-4 pt-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Amount to Pay (KES)</label>
              <Input
                type="number"
                step="0.01"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Payment Method</label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="mpesa">M-Pesa</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end pt-4">
              <Button type="button" variant="outline" className="mr-2" onClick={() => setPaymentInvoiceId(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={recordPayment.isPending}>
                Record Payment
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
