import React, { useEffect, useState } from 'react';
import { customFetch } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { formatCurrency } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

interface SaleItem {
  id: number;
  product_id: number;
  product_name: string;
  quantity: number;
  unit_price: number;
}

interface Sale {
  id: number;
  receipt_number: string;
  total: number;
  status: string;
  created_at: string;
  items: SaleItem[];
}

export function ReturnsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Sale | null>(null);
  const [quantities, setQuantities] = useState<Record<number, string>>({});
  const [reason, setReason] = useState('');
  const [refundMethod, setRefundMethod] = useState('cash');
  const [submitting, setSubmitting] = useState(false);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    if (!open) { setSelected(null); setQuantities({}); setReason(''); setFilter(''); return; }
    setLoading(true);
    customFetch<{ data: Sale[] }>('/pos/sales?limit=50')
      .then((res) => setSales((res.data ?? []).filter((s) => s.status !== 'void' && s.status !== 'refunded')))
      .catch(() => toast.error('Failed to load recent sales'))
      .finally(() => setLoading(false));
  }, [open]);

  const filteredSales = sales.filter((s) => !filter.trim() || s.receipt_number.toLowerCase().includes(filter.trim().toLowerCase()));

  const returnLines = selected
    ? selected.items
        .map((item) => ({ item, qty: parseInt(quantities[item.id] || '0', 10) || 0 }))
        .filter((l) => l.qty > 0)
    : [];
  const refundTotal = returnLines.reduce((sum, l) => sum + l.qty * l.item.unit_price, 0);
  const invalid = selected ? selected.items.some((item) => (parseInt(quantities[item.id] || '0', 10) || 0) > item.quantity) : false;

  const submit = async () => {
    if (!selected || returnLines.length === 0) return;
    setSubmitting(true);
    try {
      await customFetch('/pos/returns', {
        method: 'POST',
        body: JSON.stringify({
          sale_id: selected.id,
          items: returnLines.map((l) => ({ sale_item_id: l.item.id, quantity: l.qty })),
          reason: reason || undefined,
          refund_method: refundMethod,
        }),
      });
      toast.success(`Return recorded — refund ${formatCurrency(refundTotal)}`);
      onOpenChange(false);
      queryClient.invalidateQueries();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to record return');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{selected ? `Return items — ${selected.receipt_number}` : 'Process a Return'}</DialogTitle>
        </DialogHeader>
        {!selected ? (
          <div className="space-y-3">
            <Input placeholder="Search by receipt number…" value={filter} onChange={(e) => setFilter(e.target.value)} />
            <ScrollArea className="h-72 border rounded-md">
              {loading ? (
                <div className="p-4 text-sm text-muted-foreground">Loading recent sales…</div>
              ) : filteredSales.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground">No matching sales found.</div>
              ) : (
                filteredSales.map((s) => (
                  <button
                    key={s.id}
                    className="w-full flex items-center justify-between px-4 py-2 text-sm hover:bg-muted/60 border-b text-left"
                    onClick={() => { setSelected(s); setQuantities({}); }}
                  >
                    <span className="font-medium">{s.receipt_number}</span>
                    <span className="text-muted-foreground">{new Date(s.created_at).toLocaleString()}</span>
                    <span className="font-medium">{formatCurrency(s.total)}</span>
                  </button>
                ))
              )}
            </ScrollArea>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="border rounded-md divide-y">
              {selected.items.map((item) => (
                <div key={item.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <div className="flex-1">
                    <div className="font-medium">{item.product_name}</div>
                    <div className="text-xs text-muted-foreground">Sold: {item.quantity} × {formatCurrency(item.unit_price)}</div>
                  </div>
                  <Input
                    type="number"
                    min="0"
                    max={item.quantity}
                    className="w-20"
                    placeholder="0"
                    value={quantities[item.id] ?? ''}
                    onChange={(e) => setQuantities((q) => ({ ...q, [item.id]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium">Refund method</label>
                <Select value={refundMethod} onValueChange={setRefundMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="mpesa">M-Pesa</SelectItem>
                    <SelectItem value="store_credit">Store Credit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Reason (optional)</label>
                <Input placeholder="e.g. faulty item" value={reason} onChange={(e) => setReason(e.target.value)} />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="text-sm">Refund total: <span className="font-semibold">{formatCurrency(refundTotal)}</span></div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setSelected(null)}>Back</Button>
                <Button disabled={submitting || returnLines.length === 0 || invalid} onClick={submit}>
                  {submitting ? 'Processing…' : 'Process Return'}
                </Button>
              </div>
            </div>
            {invalid && <div className="text-xs text-destructive">Return quantity cannot exceed the quantity sold.</div>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
