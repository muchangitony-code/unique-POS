import React from 'react';
import {
  useGetUsers,
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
  useListBranches,
  User,
} from '@workspace/api-client-react';
import { getTierLabel } from '@/lib/permissions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Pencil, Trash2, ShieldCheck } from 'lucide-react';
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
import { getGetUsersQueryKey } from '@workspace/api-client-react';

const userSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email'),
  password: z.string().min(6, 'Password must be at least 6 characters').optional().or(z.literal('')),
  role: z.enum(['super_admin', 'business_owner', 'branch_manager', 'cashier', 'storekeeper', 'accountant', 'sales_rep', 'technician']),
  branch_id: z.string().min(1, 'Branch is required'),
  phone: z.string().optional(),
});

type UserFormValues = z.infer<typeof userSchema>;

export default function UsersPage() {
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [editingUser, setEditingUser] = React.useState<User | null>(null);
  const [permissionUser, setPermissionUser] = React.useState<User | null>(null);
  const [permissionValues, setPermissionValues] = React.useState<Record<string, boolean>>({});
  const [permissionLoading, setPermissionLoading] = React.useState(false);
  const [permissionSaving, setPermissionSaving] = React.useState(false);
  
  const queryClient = useQueryClient();
  const { data: users, isLoading } = useGetUsers();
  const { data: branches } = useListBranches();

  const branchName = React.useCallback(
    (id: number | null | undefined) => branches?.find((b) => b.id === id)?.name ?? '-',
    [branches],
  );

  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();

  const form = useForm<UserFormValues>({
    resolver: zodResolver(userSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      role: 'cashier',
      branch_id: '',
      phone: '',
    },
  });

  const onSubmit = (data: UserFormValues) => {
    const { branch_id, ...rest } = data;
    const branchIdNum = Number(branch_id);
    if (editingUser) {
      const updateData: any = { ...rest, branch_id: branchIdNum };
      if (!updateData.password) delete updateData.password;
      
      updateUser.mutate(
        { id: editingUser.id, data: updateData },
        {
          onSuccess: () => {
            toast.success('User updated successfully');
            queryClient.invalidateQueries({ queryKey: getGetUsersQueryKey() });
            closeDialog();
          },
        }
      );
    } else {
      if (!data.password) {
        toast.error("Password is required for new users");
        return;
      }
      createUser.mutate(
        { data: { ...rest, branch_id: branchIdNum } as any },
        {
          onSuccess: () => {
            toast.success('User created successfully');
            queryClient.invalidateQueries({ queryKey: getGetUsersQueryKey() });
            closeDialog();
          },
        }
      );
    }
  };

  const handleDelete = (id: number) => {
    if (confirm('Are you sure you want to deactivate this user?')) {
      deleteUser.mutate(
        { id },
        {
          onSuccess: () => {
            toast.success('User removed');
            queryClient.invalidateQueries({ queryKey: getGetUsersQueryKey() });
          },
        }
      );
    }
  };

  const openEditDialog = (user: User) => {
    setEditingUser(user);
    form.reset({
      name: user.name,
      email: user.email,
      password: '',
      role: user.role as any,
      branch_id: user.branch_id ? String(user.branch_id) : '',
      phone: user.phone || '',
    });
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingUser(null);
    form.reset();
  };


  const permissionModules = [
    ['pos', 'POS & Sales'], ['inventory', 'Inventory visibility'], ['products', 'Product catalogue'],
    ['customers', 'Customers'], ['quotations', 'Quotations'], ['invoices', 'Invoices'],
    ['purchases', 'Purchases'], ['suppliers', 'Suppliers'], ['reports', 'Reports'],
    ['expenses', 'Expenses'], ['users', 'Staff & Users'], ['settings', 'Settings'],
    ['branches', 'Branches'], ['audit_log', 'Audit log'], ['security', 'Security'], ['backups', 'Backups'],
  ] as const;

  const authHeaders = (): Record<string, string> => {
    let token = '';
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      const raw = localStorage.getItem(key) || '';
      if (!token && /token/i.test(key) && raw.length > 20) token = raw.replace(/^"|"$/g, '');
      try {
        const parsed = JSON.parse(raw);
        if (!token && parsed && typeof parsed === 'object') {
          for (const [k, v] of Object.entries(parsed)) if (/token|accessToken|authToken/i.test(k) && typeof v === 'string') token = v;
        }
      } catch {}
    }
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const openPermissions = async (user: User) => {
    setPermissionUser(user);
    setPermissionLoading(true);
    setPermissionValues({});
    try {
      const res = await fetch(`/api/users/${user.id}/permissions`, { headers: authHeaders(), credentials: 'include' });
      if (!res.ok) throw new Error(res.status === 403 ? 'Only a super admin can manage permissions.' : 'Could not load permissions.');
      const data = await res.json();
      const values: Record<string, boolean> = {};
      for (const module of data.modules as string[]) {
        if (Object.prototype.hasOwnProperty.call(data.overrides, module)) values[module] = data.overrides[module];
      }
      setPermissionValues(values);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not load permissions'); }
    finally { setPermissionLoading(false); }
  };

  const savePermissions = async () => {
    if (!permissionUser) return;
    setPermissionSaving(true);
    try {
      const res = await fetch(`/api/users/${permissionUser.id}/permissions`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', ...authHeaders() },
        credentials: 'include', body: JSON.stringify({ overrides: permissionValues }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not save permissions');
      toast.success('Permissions saved. The user may need to sign in again.');
      setPermissionUser(null);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not save permissions'); }
    finally { setPermissionSaving(false); }
  };

  const roleDisplay = (role: string) => getTierLabel(role);

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold tracking-tight">Staff & Users</h2>
        <Dialog open={isDialogOpen} onOpenChange={(open) => !open && closeDialog()}>
          <DialogTrigger asChild>
            <Button onClick={() => setIsDialogOpen(true)} data-testid="button-add-user">
              <Plus className="mr-2 h-4 w-4" /> Add User
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingUser ? 'Edit User' : 'Add New User'}</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl><Input type="email" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{editingUser ? 'New Password (leave blank to keep current)' : 'Password'}</FormLabel>
                      <FormControl><Input type="password" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Role</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a role" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="business_owner">Administrator</SelectItem>
                          <SelectItem value="branch_manager">Manager</SelectItem>
                          <SelectItem value="cashier">Sales / Cashier</SelectItem>
                          <SelectItem value="storekeeper">Storekeeper</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="branch_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Branch</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a branch" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {branches?.map((b) => (
                              <SelectItem key={b.id} value={String(b.id)}>
                                {b.name}{!b.is_active ? ' (inactive)' : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone (Optional)</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="flex justify-end pt-4">
                  <Button type="submit" disabled={createUser.isPending || updateUser.isPending}>
                    {editingUser ? 'Save Changes' : 'Create User'}
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
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Branch</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i} className="border-b"><td colSpan={6} className="p-4"><Skeleton className="h-6 w-full" /></td></tr>
              ))
            ) : (
              users?.map((user) => (
                <tr key={user.id} className="border-b hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-3 font-medium">{user.name}</td>
                  <td className="px-4 py-3">{user.email}</td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
                      {roleDisplay(user.role)}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">{branchName(user.branch_id)}</td>
                  <td className="px-4 py-3">
                    <Badge variant={user.is_active ? "secondary" : "destructive"}>
                      {user.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="ghost" size="icon" title="Manage permissions" onClick={() => void openPermissions(user)}>
                      <ShieldCheck className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => openEditDialog(user)}>
                      <Pencil className="w-4 h-4 text-primary" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(user.id)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {permissionUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div role="dialog" aria-modal="true" aria-label="Manage user permissions" className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-lg border bg-background p-6 shadow-xl space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div><h3 className="text-xl font-semibold">Permissions — {permissionUser.name}</h3><p className="text-sm text-muted-foreground">Override access by POS module. Unchecked overrides revoke access; unset permissions use the user's role defaults.</p></div>
              <Button variant="outline" onClick={() => setPermissionUser(null)}>Close</Button>
            </div>
            {permissionLoading ? <Skeleton className="h-32 w-full" /> : (
              <div className="grid gap-3 sm:grid-cols-2">
                {permissionModules.map(([key, label]) => (
                  <label key={key} className="flex items-center gap-3 rounded-md border p-3">
                    <input type="checkbox" checked={permissionValues[key] ?? false} onChange={(e) => setPermissionValues(prev => ({ ...prev, [key]: e.target.checked }))} className="h-4 w-4" />
                    <span className="text-sm font-medium">{label}</span>
                  </label>
                ))}
              </div>
            )}
            <div className="flex justify-end gap-2 border-t pt-4">
              <Button variant="outline" onClick={() => setPermissionUser(null)}>Cancel</Button>
              <Button onClick={() => void savePermissions()} disabled={permissionLoading || permissionSaving}>{permissionSaving ? 'Saving…' : 'Save permissions'}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
