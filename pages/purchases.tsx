import React, { useState } from 'react';
import { 
  useGetPurchases, 
  useCreatePurchase, 
  useReceivePurchase,
  useGetSuppliers,
  useGetProducts,
  PurchaseStatus
} from '@workspace/api-client-react';
import { formatCurrency } from '@/lib/format';
import { format } from 'date-fns';
import { Plus, Search, CheckCircle2, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { getGetPurchasesQueryKey } from '@workspace/api-client-react';

export default function Purchases() {
  const [search, setSearch] = useState('');
  const { data: purchases, isLoading } = useGetPurchases({});
  const receivePurchase = useReceivePurchase();
  const queryClient = useQueryClient();

  const handleReceive = (id: number) => {
    if (confirm('Mark this purchase order as fully received?')) {
      receivePurchase.mutate({ id }, {
        onSuccess: () => {
          toast.success("Purchase marked as received");
          queryClient.invalidateQueries({ queryKey: getGetPurchasesQueryKey() });
        }
      });
    }
  };

  const statusColor = (status: string) => {
    switch(status) {
      case 'draft': return 'secondary';
      case 'ordered': return 'default';
      case 'received': return 'outline';
      case 'partial': return 'secondary';
      case 'cancelled': return 'destructive';
      default: return 'secondary';
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search purchases..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" /> New Purchase Order
        </Button>
      </div>

      <div className="bg-card border rounded-lg overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-muted-foreground bg-muted/50 uppercase border-b">
            <tr>
              <th className="px-4 py-3">PO Number</th>
              <th className="px-4 py-3">Supplier</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b"><td colSpan={6} className="p-4"><Skeleton className="h-6 w-full" /></td></tr>
              ))
            ) : purchases?.data?.length === 0 ? (
              <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No purchases found.</td></tr>
            ) : (
              purchases?.data?.map((po) => (
                <tr key={po.id} className="border-b hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-3 font-medium">{po.purchase_number}</td>
                  <td className="px-4 py-3">{po.supplier_name}</td>
                  <td className="px-4 py-3">{format(new Date(po.created_at), 'dd MMM yyyy')}</td>
                  <td className="px-4 py-3 text-right font-medium">{formatCurrency(po.total)}</td>
                  <td className="px-4 py-3">
                    <Badge variant={statusColor(po.status)} className={po.status === 'received' ? 'border-green-500 text-green-600 bg-green-50' : ''}>
                      {po.status.toUpperCase()}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {po.status === 'ordered' && (
                      <Button variant="ghost" size="sm" onClick={() => handleReceive(po.id)} className="text-primary hover:text-primary">
                        <CheckCircle2 className="w-4 h-4 mr-1" /> Receive
                      </Button>
                    )}
                    <Button variant="ghost" size="icon">
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
