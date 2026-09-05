import React, { useState } from 'react';
import { 
  useGetSuppliers, 
  useCreateSupplier, 
  useUpdateSupplier, 
  useDeleteSupplier,
  Supplier
} from '@workspace/api-client-react';
import { formatCurrency } from '@/lib/format';
import { Plus, Search, Pencil, Trash2, Banknote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { getGetSuppliersQueryKey, customFetch } from '@workspace/api-client-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const supplierSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  contact_person: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  tax_number: z.string().optional(),
});

type SupplierFormValues = z.infer<typeof supplierSchema>;

export default function Suppliers() {
  const [search, setSearch] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [payingSupplier, setPayingSupplier] = useState<Supplier | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('cash');
  const [payReference, setPayReference] = useState('');
  const [paySubmitting, setPaySubmitting] = useState(false);

  const queryClient = useQueryClient();
  const { data: suppliers, isLoading } = useGetSuppliers({ search });
  
  const createSupplier = useCreateSupplier();
  const updateSupplier = useUpdateSupplier();
  const deleteSupplier = useDeleteSupplier();

  const form = useForm<SupplierFormValues>({
    resolver: zodResolver(supplierSchema),
    defaultValues: {
      name: '',
      contact_person: '',
      email: '',
      phone: '',
      address: '',
      city: '',
      tax_number: '',
    },
  });

  const onSubmit = (data: SupplierFormValues) => {
    if (editingSupplier) {
      updateSupplier.mutate({ id: editingSupplier.id, data }, {
        onSuccess: () => {
          toast.success('Supplier updated');
          queryClient.invalidateQueries({ queryKey: getGetSuppliersQueryKey() });
          closeDialog();
        }
      });
    } else {
      createSupplier.mutate({ data }, {
        onSuccess: () => {
          toast.success('Supplier created');
          queryClient.invalidateQueries({ queryKey: getGetSuppliersQueryKey() });
          closeDialog();
        }
      });
    }
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingSupplier(null);
    form.reset();
  };

  const openEdit = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    form.reset({
      name: supplier.name,
      contact_person: supplier.contact_person || '',
      email: supplier.email || '',
      phone: supplier.phone || '',
      address: supplier.address || '',
      city: supplier.city || '',
      tax_number: supplier.tax_number || '',
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: number) => {
    if (confirm("Delete this supplier?")) {
      deleteSupplier.mutate({ id }, {
        onSuccess: () => {
          toast.success('Supplier deleted');
          queryClient.invalidateQueries({ queryKey: getGetSuppliersQueryKey() });
        }
      });
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search suppliers..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <Dialog open={isDialogOpen} onOpenChange={(open) => !open && closeDialog()}>
          <DialogTrigger asChild>
            <Button onClick={() => setIsDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Add Supplier
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingSupplier ? 'Edit Supplier' : 'Add New Supplier'}</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem><FormLabel>Company Name</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>
                )} />
                <FormField control={form.control} name="contact_person" render={({ field }) => (
                  <FormItem><FormLabel>Contact Person</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>
                )} />
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="phone" render={({ field }) => (
                    <FormItem><FormLabel>Phone</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>
                  )} />
                  <FormField control={form.control} name="email" render={({ field }) => (
                    <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" {...field} /></FormControl></FormItem>
                  )} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="city" render={({ field }) => (
                    <FormItem><FormLabel>City</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>
                  )} />
                  <FormField control={form.control} name="tax_number" render={({ field }) => (
                    <FormItem><FormLabel>Tax/KRA PIN</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="address" render={({ field }) => (
                  <FormItem><FormLabel>Address</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>
                )} />
                <div className="flex justify-end pt-4">
                  <Button type="submit" disabled={createSupplier.isPending || updateSupplier.isPending}>
                    {editingSupplier ? 'Update' : 'Create'}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="bg-card border rounded-lg overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-muted-foreground bg-muted/50 uppercase border-b">
            <tr>
              <th className="px-4 py-3">Company</th>
              <th className="px-4 py-3">Contact Person</th>
              <th className="px-4 py-3">Phone/Email</th>
              <th className="px-4 py-3">Location</th>
              <th className="px-4 py-3 text-right">Balance</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b"><td colSpan={6} className="p-4"><Skeleton className="h-6 w-full" /></td></tr>
              ))
            ) : suppliers?.data?.length === 0 ? (
              <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No suppliers found.</td></tr>
            ) : (
              suppliers?.data?.map((supplier) => (
                <tr key={supplier.id} className="border-b hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-3 font-medium">{supplier.name}</td>
                  <td className="px-4 py-3">{supplier.contact_person || '-'}</td>
                  <td className="px-4 py-3">
                    <div className="text-xs">{supplier.phone}</div>
                    <div className="text-xs text-muted-foreground">{supplier.email}</div>
                  </td>
                  <td className="px-4 py-3">{supplier.city}</td>
                  <td className="px-4 py-3 text-right font-medium">{formatCurrency(supplier.balance || 0)}</td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="ghost" size="icon" title="Record payment" onClick={() => { setPayingSupplier(supplier); setPayAmount(''); setPayMethod('cash'); setPayReference(''); }}>
                      <Banknote className="w-4 h-4 text-emerald-600" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(supplier)}>
                      <Pencil className="w-4 h-4 text-primary" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(supplier.id)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={!!payingSupplier} onOpenChange={(open) => !open && setPayingSupplier(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Payment — {payingSupplier?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              Amount owed: <span className="font-medium text-destructive">{formatCurrency(payingSupplier?.balance || 0)}</span>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Amount</label>
              <Input type="number" min="0.01" step="0.01" placeholder="0.00" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Method</label>
              <Select value={payMethod} onValueChange={setPayMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="mpesa">M-Pesa</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Reference (optional)</label>
              <Input placeholder="e.g. bank transaction ref" value={payReference} onChange={(e) => setPayReference(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPayingSupplier(null)}>Cancel</Button>
              <Button
                disabled={paySubmitting || !payAmount || Number(payAmount) <= 0}
                onClick={async () => {
                  if (!payingSupplier) return;
                  setPaySubmitting(true);
                  try {
                    await customFetch(`/suppliers/${payingSupplier.id}/payments`, {
                      method: 'POST',
                      body: JSON.stringify({ amount: Number(payAmount), method: payMethod, reference: payReference || undefined }),
                    });
                    toast.success('Payment recorded');
                    setPayingSupplier(null);
                    queryClient.invalidateQueries({ queryKey: getGetSuppliersQueryKey({ search }) });
                    queryClient.invalidateQueries();
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : 'Failed to record payment');
                  } finally {
                    setPaySubmitting(false);
                  }
                }}
              >
                {paySubmitting ? 'Saving…' : 'Record Payment'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
