import React, { useState } from 'react';
import { 
  useGetExpenses, 
  useCreateExpense, 
  useDeleteExpense,
} from '@workspace/api-client-react';
import { formatCurrency } from '@/lib/format';
import { format } from 'date-fns';
import { Plus, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { getGetExpensesQueryKey } from '@workspace/api-client-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
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

const expenseSchema = z.object({
  description: z.string().min(1, 'Description required'),
  amount: z.coerce.number().min(0.01, 'Amount must be greater than 0'),
  category: z.string().min(1, 'Category required'),
  payment_method: z.enum(['cash', 'mpesa', 'bank_transfer', 'card']),
  reference: z.string().optional(),
  date: z.string().min(1, 'Date required'),
});

export default function Expenses() {
  const [search, setSearch] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  
  const { data: expenses, isLoading } = useGetExpenses({});
  const filteredExpenses = (expenses?.data ?? []).filter((exp) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return [exp.description, exp.category, exp.reference, exp.payment_method].some((f) => (f ?? '').toLowerCase().includes(q));
  });
  const createExpense = useCreateExpense();
  const deleteExpense = useDeleteExpense();
  const queryClient = useQueryClient();

  const form = useForm({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      description: '',
      amount: 0,
      category: 'Office',
      payment_method: 'cash',
      reference: '',
      date: new Date().toISOString().split('T')[0],
    }
  });

  const onSubmit = (data: any) => {
    createExpense.mutate({ data }, {
      onSuccess: () => {
        toast.success("Expense recorded successfully");
        queryClient.invalidateQueries({ queryKey: getGetExpensesQueryKey() });
        setIsDialogOpen(false);
        form.reset();
      }
    });
  };

  const handleDelete = (id: number) => {
    if (confirm("Delete this expense record?")) {
      deleteExpense.mutate({ id }, {
        onSuccess: () => {
          toast.success("Expense deleted");
          queryClient.invalidateQueries({ queryKey: getGetExpensesQueryKey() });
        }
      });
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search expenses..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> Record Expense</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Record New Expense</DialogTitle></DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
                <FormField control={form.control} name="description" render={({ field }) => (
                  <FormItem><FormLabel>Description</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>
                )} />
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="amount" render={({ field }) => (
                    <FormItem><FormLabel>Amount (KES)</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl></FormItem>
                  )} />
                  <FormField control={form.control} name="date" render={({ field }) => (
                    <FormItem><FormLabel>Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl></FormItem>
                  )} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="category" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category</FormLabel>
                      <FormControl><Input {...field} placeholder="e.g. Utilities, Fuel" /></FormControl>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="payment_method" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Payment Method</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="cash">Cash</SelectItem>
                          <SelectItem value="mpesa">M-Pesa</SelectItem>
                          <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                          <SelectItem value="card">Card</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="reference" render={({ field }) => (
                  <FormItem><FormLabel>Reference (Receipt/Mpesa code)</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>
                )} />
                <div className="flex justify-end pt-4">
                  <Button type="submit" disabled={createExpense.isPending}>Save Expense</Button>
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
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Payment Info</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b"><td colSpan={6} className="p-4"><Skeleton className="h-6 w-full" /></td></tr>
              ))
            ) : filteredExpenses.length === 0 ? (
              <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">{search ? 'No expenses match your search.' : 'No expenses recorded.'}</td></tr>
            ) : (
              filteredExpenses.map((exp) => (
                <tr key={exp.id} className="border-b hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-3">{format(new Date(exp.date), 'dd MMM yyyy')}</td>
                  <td className="px-4 py-3 font-medium">{exp.description}</td>
                  <td className="px-4 py-3"><Badge variant="outline">{exp.category}</Badge></td>
                  <td className="px-4 py-3">
                    <div className="capitalize">{exp.payment_method?.replace('_', ' ')}</div>
                    <div className="text-xs text-muted-foreground">{exp.reference}</div>
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-destructive">{formatCurrency(exp.amount)}</td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(exp.id)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
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
