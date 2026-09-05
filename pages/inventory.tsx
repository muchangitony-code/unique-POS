import React, { useState } from 'react';
import { 
  useGetInventoryMovements,
  useGetStockCount,
  useReceiveStock,
  useAdjustStock,
  useGetProducts,
  useListStockTransfers,
  useCreateStockTransfer,
  useApproveStockTransfer,
  useRejectStockTransfer,
  useListBranchOptions,
  getListStockTransfersQueryKey,
} from '@workspace/api-client-react';
import { useAuth } from '@/contexts/AuthContext';
import { getTier, isSuperAdmin } from '@/lib/permissions';
import { formatCurrency } from '@/lib/format';
import { format } from 'date-fns';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { 
  getGetStockCountQueryKey, 
  getGetInventoryMovementsQueryKey,
  getGetProductsQueryKey
} from '@workspace/api-client-react';

export default function Inventory() {
  const queryClient = useQueryClient();
  
  const { data: stockCount, isLoading: stockLoading } = useGetStockCount({});
  const { data: movements, isLoading: movementsLoading } = useGetInventoryMovements({});
  const { data: productsData } = useGetProducts({ limit: 1000 });

  const receiveStock = useReceiveStock();
  const adjustStock = useAdjustStock();

  const { user } = useAuth();
  const isSuper = isSuperAdmin(user?.role);
  const canApprove = getTier(user?.role) === 'administrator' || getTier(user?.role) === 'manager';

  const handleSuccess = (msg: string) => {
    toast.success(msg);
    queryClient.invalidateQueries({ queryKey: getGetStockCountQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetInventoryMovementsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetProductsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListStockTransfersQueryKey() });
  };

  const RenderReceiveForm = () => {
    const form = useForm({
      resolver: zodResolver(z.object({
        product_id: z.string().min(1, 'Product required'),
        quantity: z.coerce.number().min(1),
        reference: z.string().optional(),
        notes: z.string().optional()
      }))
    });
    
    return (
      <Form {...form}>
        <form onSubmit={form.handleSubmit(d => receiveStock.mutate({ 
          data: { product_id: parseInt(d.product_id), quantity: d.quantity, reference: d.reference, notes: d.notes }
        }, { onSuccess: () => { handleSuccess("Stock received"); form.reset(); } }))} className="space-y-4 max-w-md">
          <FormField control={form.control} name="product_id" render={({ field }) => (
            <FormItem>
              <FormLabel>Product</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl><SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger></FormControl>
                <SelectContent>
                  {productsData?.data?.map(p => <SelectItem key={p.id} value={p.id.toString()}>{p.product_name} ({p.current_stock})</SelectItem>)}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="quantity" render={({ field }) => (
            <FormItem><FormLabel>Quantity Received</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="reference" render={({ field }) => (
            <FormItem><FormLabel>Reference / LPO #</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <Button type="submit" disabled={receiveStock.isPending}>Receive Stock</Button>
        </form>
      </Form>
    );
  };

  const RenderAdjustForm = () => {
    const form = useForm({
      resolver: zodResolver(z.object({
        product_id: z.string().min(1, 'Product required'),
        quantity: z.coerce.number(),
        reason: z.string().min(1, 'Reason required'),
      }))
    });

    const watchedProductId = form.watch('product_id');
    const watchedQuantity = form.watch('quantity');

    const selectedProduct = productsData?.data?.find(p => p.id.toString() === watchedProductId);
    const currentStock = selectedProduct?.current_stock ?? null;
    const parsedQty = Number(watchedQuantity);
    const projectedStock = currentStock !== null && !isNaN(parsedQty) ? currentStock + parsedQty : null;
    const wouldClamp = projectedStock !== null && projectedStock < 0;
    const clampedTo = wouldClamp ? 0 : projectedStock;
    
    return (
      <Form {...form}>
        <form onSubmit={form.handleSubmit(d => adjustStock.mutate({ 
          data: { product_id: parseInt(d.product_id), quantity: d.quantity, reason: d.reason }
        }, { onSuccess: () => { handleSuccess("Stock adjusted"); form.reset(); } }))} className="space-y-4 max-w-md">
          <FormField control={form.control} name="product_id" render={({ field }) => (
            <FormItem>
              <FormLabel>Product</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl><SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger></FormControl>
                <SelectContent>
                  {productsData?.data?.map(p => <SelectItem key={p.id} value={p.id.toString()}>{p.product_name} ({p.current_stock})</SelectItem>)}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="quantity" render={({ field }) => (
            <FormItem>
              <FormLabel>Adjustment (Use negative to remove)</FormLabel>
              <FormControl><Input type="number" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          {wouldClamp && (
            <div className="flex items-start gap-2 rounded-md border border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <span className="mt-0.5 shrink-0 text-amber-500">⚠</span>
              <span>
                This adjustment would result in <strong>{projectedStock}</strong> units, but stock cannot go below 0.
                It will be set to <strong>{clampedTo}</strong> instead.
              </span>
            </div>
          )}
          <FormField control={form.control} name="reason" render={({ field }) => (
            <FormItem><FormLabel>Reason</FormLabel><FormControl><Input {...field} placeholder="e.g. Damaged, Found missing" /></FormControl><FormMessage /></FormItem>
          )} />
          <Button type="submit" variant="secondary" disabled={adjustStock.isPending}>Adjust Stock</Button>
        </form>
      </Form>
    );
  };

  const RenderTransfers = () => {
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const { data: branchOptions } = useListBranchOptions();
    const { data: transfersData, isLoading: transfersLoading } = useListStockTransfers(
      statusFilter === 'all' ? {} : { status: statusFilter as 'pending' | 'approved' | 'rejected' }
    );
    const createTransfer = useCreateStockTransfer();
    const approveTransfer = useApproveStockTransfer();
    const rejectTransfer = useRejectStockTransfer();

    const form = useForm({
      resolver: zodResolver(z.object({
        source_branch_id: z.string().optional(),
        destination_branch_id: z.string().min(1, 'Destination branch required'),
        product_id: z.string().min(1, 'Product required'),
        quantity: z.coerce.number().int().min(1, 'Quantity must be at least 1'),
        transfer_date: z.string().optional(),
        notes: z.string().optional(),
      }).superRefine((val, ctx) => {
        if (isSuper && !val.source_branch_id) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['source_branch_id'], message: 'Source branch required' });
        }
        if (isSuper && val.source_branch_id && val.source_branch_id === val.destination_branch_id) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['destination_branch_id'], message: 'Must differ from source' });
        }
      })),
      defaultValues: { source_branch_id: '', destination_branch_id: '', product_id: '', quantity: 1, transfer_date: '', notes: '' },
    });

    const submit = form.handleSubmit((d) => {
      createTransfer.mutate({
        data: {
          source_branch_id: isSuper && d.source_branch_id ? Number(d.source_branch_id) : undefined,
          destination_branch_id: Number(d.destination_branch_id),
          product_id: Number(d.product_id),
          quantity: d.quantity,
          transfer_date: d.transfer_date ? new Date(d.transfer_date).toISOString() : undefined,
          notes: d.notes || undefined,
        },
      }, {
        onSuccess: () => { handleSuccess('Transfer created — pending approval'); form.reset(); },
        onError: (err: Error) => toast.error(err.message || 'Could not create transfer'),
      });
    });

    const doApprove = (id: number) => approveTransfer.mutate({ id }, {
      onSuccess: () => handleSuccess('Transfer approved — stock moved to destination'),
      onError: (err: Error) => toast.error(err.message || 'Approve failed'),
    });
    const doReject = (id: number) => {
      const reason = window.prompt('Reason for rejecting this transfer? (optional)') ?? undefined;
      rejectTransfer.mutate({ id, data: { reason } }, {
        onSuccess: () => handleSuccess('Transfer rejected — stock returned to source'),
        onError: (err: Error) => toast.error(err.message || 'Reject failed'),
      });
    };

    const statusBadge = (s: string) => {
      const map: Record<string, string> = {
        pending: 'border-amber-500 text-amber-600 bg-amber-50',
        approved: 'border-green-500 text-green-600 bg-green-50',
        rejected: 'border-red-500 text-red-600 bg-red-50',
      };
      return <Badge variant="outline" className={`uppercase text-[10px] ${map[s] ?? ''}`}>{s}</Badge>;
    };

    const sourceWatch = form.watch('source_branch_id');

    return (
      <div className="h-full flex flex-col">
        <div className="p-6 border-b bg-muted/20">
          <h3 className="font-semibold mb-4">New Stock Transfer</h3>
          <Form {...form}>
            <form onSubmit={submit} className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 max-w-4xl">
              {isSuper && (
                <FormField control={form.control} name="source_branch_id" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Source Branch</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue placeholder="From branch" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {branchOptions?.map((b) => <SelectItem key={b.id} value={b.id.toString()}>{b.name}{!b.is_active ? ' (inactive)' : ''}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              )}
              <FormField control={form.control} name="destination_branch_id" render={({ field }) => (
                <FormItem>
                  <FormLabel>Destination Branch</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="To branch" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {branchOptions?.filter((b) => b.id.toString() !== sourceWatch).map((b) => <SelectItem key={b.id} value={b.id.toString()}>{b.name}{!b.is_active ? ' (inactive)' : ''}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {!isSuper && <p className="text-xs text-muted-foreground mt-1">Transfers are sent from your own branch.</p>}
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="product_id" render={({ field }) => (
                <FormItem>
                  <FormLabel>Product</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {productsData?.data?.map((p) => <SelectItem key={p.id} value={p.id.toString()}>{p.product_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="quantity" render={({ field }) => (
                <FormItem><FormLabel>Quantity</FormLabel><FormControl><Input type="number" min={1} {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="transfer_date" render={({ field }) => (
                <FormItem><FormLabel>Transfer Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem><FormLabel>Notes</FormLabel><FormControl><Input placeholder="Optional" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <div className="flex items-end">
                <Button type="submit" disabled={createTransfer.isPending}>Create Transfer</Button>
              </div>
            </form>
          </Form>
        </div>

        <div className="flex items-center gap-2 px-6 py-3 border-b">
          <span className="text-sm text-muted-foreground">Filter:</span>
          {['all', 'pending', 'approved', 'rejected'].map((s) => (
            <Button key={s} size="sm" variant={statusFilter === s ? 'default' : 'outline'} onClick={() => setStatusFilter(s)} className="capitalize">{s}</Button>
          ))}
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground bg-muted/50 uppercase border-b sticky top-0">
              <tr>
                <th className="px-4 py-3">Transfer #</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">From → To</th>
                <th className="px-4 py-3 text-center">Qty</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Initiated By</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {transfersLoading ? (
                <tr><td colSpan={8} className="p-4"><Skeleton className="h-8 w-full" /></td></tr>
              ) : transfersData?.data?.length ? (
                transfersData.data.map((t) => (
                  <tr key={t.id} className="border-b hover:bg-muted/50">
                    <td className="px-4 py-3 font-mono text-xs">{t.transfer_number}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{t.transfer_date ? format(new Date(t.transfer_date), 'dd MMM yyyy') : '—'}</td>
                    <td className="px-4 py-3 font-medium">{t.product_name}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{t.source_branch_name} → {t.destination_branch_name}</td>
                    <td className="px-4 py-3 text-center font-semibold">{t.quantity}</td>
                    <td className="px-4 py-3">{statusBadge(t.status)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{t.initiated_by_name ?? '—'}</td>
                    <td className="px-4 py-3 text-right">
                      {t.status === 'pending' && canApprove ? (
                        <div className="flex gap-2 justify-end">
                          <Button size="sm" variant="outline" className="border-green-500 text-green-600 hover:bg-green-50" disabled={approveTransfer.isPending} onClick={() => doApprove(t.id)}>Approve</Button>
                          <Button size="sm" variant="outline" className="border-red-500 text-red-600 hover:bg-red-50" disabled={rejectTransfer.isPending} onClick={() => doReject(t.id)}>Reject</Button>
                        </div>
                      ) : t.status === 'rejected' && t.decision_notes ? (
                        <span className="text-xs text-muted-foreground italic">{t.decision_notes}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">No transfers found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="p-6 h-full flex flex-col">
      <h2 className="text-2xl font-bold tracking-tight mb-6">Inventory Management</h2>
      
      <Tabs defaultValue="stock" className="flex-1 flex flex-col">
        <TabsList className="grid w-full grid-cols-5 md:w-auto md:inline-grid">
          <TabsTrigger value="stock">Stock Count</TabsTrigger>
          <TabsTrigger value="movements">Movements</TabsTrigger>
          <TabsTrigger value="receive">Receive</TabsTrigger>
          <TabsTrigger value="adjust">Adjust</TabsTrigger>
          <TabsTrigger value="transfers">Transfers</TabsTrigger>
        </TabsList>
        
        <div className="mt-6 flex-1 bg-card border rounded-lg overflow-hidden">
          <TabsContent value="stock" className="m-0 h-full overflow-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground bg-muted/50 uppercase border-b sticky top-0">
                <tr>
                  <th className="px-4 py-3">Product Name</th>
                  <th className="px-4 py-3 text-center">Current Stock</th>
                  <th className="px-4 py-3 text-center">Min Level</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Cost Value</th>
                  <th className="px-4 py-3 text-right">Retail Value</th>
                </tr>
              </thead>
              <tbody>
                {stockLoading ? (
                  <tr><td colSpan={6} className="p-4"><Skeleton className="h-8 w-full" /></td></tr>
                ) : (
                  stockCount?.map((item) => (
                    <tr key={item.product_id} className="border-b hover:bg-muted/50">
                      <td className="px-4 py-3 font-medium">{item.product_name}</td>
                      <td className="px-4 py-3 text-center text-lg font-semibold">{item.current_stock}</td>
                      <td className="px-4 py-3 text-center text-muted-foreground">{item.min_stock}</td>
                      <td className="px-4 py-3">
                        <Badge variant={item.status === 'out_of_stock' ? 'destructive' : item.status === 'low' ? 'outline' : 'secondary'} className={item.status === 'low' ? 'border-amber-500 text-amber-600 bg-amber-50' : ''}>
                          {item.status?.replace('_', ' ').toUpperCase()}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{formatCurrency(item.cost_value || 0)}</td>
                      <td className="px-4 py-3 text-right font-medium">{formatCurrency(item.selling_value || 0)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </TabsContent>

          <TabsContent value="movements" className="m-0 h-full overflow-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground bg-muted/50 uppercase border-b sticky top-0">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3 text-right">Qty Change</th>
                  <th className="px-4 py-3">Reference / Notes</th>
                </tr>
              </thead>
              <tbody>
                {movementsLoading ? (
                  <tr><td colSpan={5} className="p-4"><Skeleton className="h-8 w-full" /></td></tr>
                ) : (
                  movements?.data?.map((mv) => (
                    <tr key={mv.id} className="border-b hover:bg-muted/50">
                      <td className="px-4 py-3 whitespace-nowrap">{format(new Date(mv.created_at), 'dd MMM yyyy HH:mm')}</td>
                      <td className="px-4 py-3 font-medium">{mv.product_name}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="uppercase text-[10px]">{mv.type}</Badge>
                      </td>
                      <td className={`px-4 py-3 text-right font-bold ${mv.quantity > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {mv.quantity > 0 ? '+' : ''}{mv.quantity}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground truncate max-w-[200px]">{mv.reference} {mv.notes ? `- ${mv.notes}` : ''}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </TabsContent>

          <TabsContent value="receive" className="m-0 p-6">
            <Card className="max-w-xl border-none shadow-none bg-transparent">
              <CardHeader className="px-0"><CardTitle>Receive New Stock</CardTitle></CardHeader>
              <CardContent className="px-0"><RenderReceiveForm /></CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="transfers" className="m-0 h-full overflow-hidden">
            <RenderTransfers />
          </TabsContent>

          <TabsContent value="adjust" className="m-0 p-6">
            <Card className="max-w-xl border-none shadow-none bg-transparent">
              <CardHeader className="px-0"><CardTitle>Adjust Existing Stock</CardTitle></CardHeader>
              <CardContent className="px-0"><RenderAdjustForm /></CardContent>
            </Card>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
