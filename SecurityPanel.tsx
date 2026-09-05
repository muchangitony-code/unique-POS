import React from 'react';
import { customFetch } from '@workspace/api-client-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  KeyRound,
  ShieldCheck,
  Smartphone,
  Clock,
  History,
  Lock,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
} from 'lucide-react';

// ─── Shape of the security-related settings (from GET /settings) ──────────────
export interface SecurityPolicyData {
  session_timeout_minutes?: number | null;
  password_min_length?: number | null;
  password_require_uppercase?: boolean | null;
  password_require_number?: boolean | null;
  password_require_symbol?: boolean | null;
  max_failed_logins?: number | null;
  lockout_minutes?: number | null;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-KE', {
      timeZone: 'Africa/Nairobi',
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

// ─── Change password ──────────────────────────────────────────────────────────
function ChangePasswordCard({ policy }: { policy: SecurityPolicyData | undefined }) {
  const [current, setCurrent] = React.useState('');
  const [next, setNext] = React.useState('');
  const [confirm, setConfirm] = React.useState('');

  const minLen = policy?.password_min_length ?? 8;
  const reqUpper = policy?.password_require_uppercase ?? true;
  const reqNum = policy?.password_require_number ?? true;
  const reqSym = policy?.password_require_symbol ?? false;

  const requirements = [
    { ok: next.length >= minLen, label: `At least ${minLen} characters` },
    ...(reqUpper ? [{ ok: /[A-Z]/.test(next), label: 'One uppercase letter' }] : []),
    ...(reqNum ? [{ ok: /[0-9]/.test(next), label: 'One number' }] : []),
    ...(reqSym ? [{ ok: /[^A-Za-z0-9]/.test(next), label: 'One symbol' }] : []),
  ];
  const allMet = requirements.every((r) => r.ok);
  const matches = next.length > 0 && next === confirm;

  const mutation = useMutation({
    mutationFn: async () => {
      return customFetch('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ current_password: current, new_password: next }),
      });
    },
    onSuccess: () => {
      toast.success('Password changed successfully');
      setCurrent(''); setNext(''); setConfirm('');
    },
    onError: (err: Error) => toast.error(err.message || 'Could not change password'),
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10"><KeyRound className="h-5 w-5 text-primary" /></div>
          <div>
            <CardTitle>Change Password</CardTitle>
            <CardDescription>Update your account password. You'll keep your current session.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 max-w-md">
        <div className="space-y-1.5">
          <Label htmlFor="cur-pw">Current password</Label>
          <Input id="cur-pw" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-pw">New password</Label>
          <Input id="new-pw" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="conf-pw">Confirm new password</Label>
          <Input id="conf-pw" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          {confirm.length > 0 && !matches && <p className="text-xs text-destructive">Passwords do not match</p>}
        </div>
        {next.length > 0 && (
          <ul className="space-y-1">
            {requirements.map((r) => (
              <li key={r.label} className={`text-xs flex items-center gap-1.5 ${r.ok ? 'text-green-600' : 'text-muted-foreground'}`}>
                {r.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                {r.label}
              </li>
            ))}
          </ul>
        )}
        <Button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || !current || !allMet || !matches}
        >
          {mutation.isPending ? 'Saving…' : 'Change password'}
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Two-factor authentication ────────────────────────────────────────────────
function TwoFactorCard() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<{ enabled: boolean }>({
    queryKey: ['auth', '2fa', 'status'],
    queryFn: () => customFetch('/auth/2fa/status'),
  });
  const enabled = data?.enabled ?? false;

  const [setupData, setSetupData] = React.useState<{ qr_data_url: string; secret: string } | null>(null);
  const [code, setCode] = React.useState('');
  const [disableOpen, setDisableOpen] = React.useState(false);
  const [disablePw, setDisablePw] = React.useState('');

  const setup = useMutation({
    mutationFn: () => customFetch<{ qr_data_url: string; secret: string }>('/auth/2fa/setup', { method: 'POST' }),
    onSuccess: (d) => setSetupData(d),
    onError: (err: Error) => toast.error(err.message),
  });

  const enable = useMutation({
    mutationFn: () => customFetch('/auth/2fa/enable', { method: 'POST', body: JSON.stringify({ code }) }),
    onSuccess: () => {
      toast.success('Two-factor authentication enabled');
      setSetupData(null); setCode('');
      qc.invalidateQueries({ queryKey: ['auth', '2fa', 'status'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const disable = useMutation({
    mutationFn: () => customFetch('/auth/2fa/disable', { method: 'POST', body: JSON.stringify({ password: disablePw }) }),
    onSuccess: () => {
      toast.success('Two-factor authentication disabled');
      setDisableOpen(false); setDisablePw('');
      qc.invalidateQueries({ queryKey: ['auth', '2fa', 'status'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10"><Smartphone className="h-5 w-5 text-primary" /></div>
            <div>
              <CardTitle>Two-Factor Authentication</CardTitle>
              <CardDescription>Add an authenticator-app code to your login for extra security.</CardDescription>
            </div>
          </div>
          {!isLoading && (
            enabled
              ? <Badge className="bg-green-100 text-green-700 border-green-200 gap-1"><ShieldCheck className="h-3 w-3" />On</Badge>
              : <Badge variant="secondary" className="gap-1 text-muted-foreground">Off</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <Skeleton className="h-10 w-40" />
        ) : enabled ? (
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-800">
              <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
              <span>Your account is protected. You'll be asked for a 6-digit code from your authenticator app each time you sign in.</span>
            </div>
            <Button variant="outline" onClick={() => setDisableOpen(true)}>Disable 2FA</Button>
          </div>
        ) : setupData ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Scan this QR code with Google Authenticator, Authy, or any TOTP app — then enter the 6-digit code to confirm.
            </p>
            <div className="flex flex-col sm:flex-row items-start gap-5">
              <img src={setupData.qr_data_url} alt="2FA QR code" className="h-44 w-44 rounded-lg border bg-white p-2" />
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Can't scan? Enter this key manually:</p>
                <code className="block font-mono text-sm bg-muted px-3 py-2 rounded break-all">{setupData.secret}</code>
                <div className="space-y-1.5 pt-2">
                  <Label htmlFor="totp-code">Verification code</Label>
                  <Input
                    id="totp-code"
                    inputMode="numeric"
                    placeholder="000000"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    className="max-w-[160px] font-mono tracking-widest text-lg"
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => enable.mutate()} disabled={enable.isPending || code.length !== 6}>
                {enable.isPending ? 'Verifying…' : 'Verify & enable'}
              </Button>
              <Button variant="ghost" onClick={() => { setSetupData(null); setCode(''); }}>Cancel</Button>
            </div>
          </div>
        ) : (
          <Button onClick={() => setup.mutate()} disabled={setup.isPending}>
            {setup.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Smartphone className="h-4 w-4 mr-1.5" />}
            Set up 2FA
          </Button>
        )}
      </CardContent>

      <Dialog open={disableOpen} onOpenChange={(v) => { if (!v) { setDisableOpen(false); setDisablePw(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disable two-factor authentication</DialogTitle>
            <DialogDescription>Confirm your password to turn off 2FA. Your account will be less secure.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="disable-pw">Password</Label>
            <Input id="disable-pw" type="password" value={disablePw} onChange={(e) => setDisablePw(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDisableOpen(false); setDisablePw(''); }}>Cancel</Button>
            <Button variant="destructive" onClick={() => disable.mutate()} disabled={disable.isPending || !disablePw}>
              {disable.isPending ? 'Disabling…' : 'Disable 2FA'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ─── Org-wide security policy (super admin only) ──────────────────────────────
const TIMEOUT_OPTIONS: { value: string; label: string }[] = [
  { value: '30', label: '30 minutes' },
  { value: '60', label: '1 hour' },
  { value: '240', label: '4 hours' },
  { value: '480', label: '8 hours' },
  { value: '1440', label: '1 day' },
  { value: '10080', label: '7 days' },
  { value: '43200', label: '30 days' },
];

function PolicyCard({ policy }: { policy: SecurityPolicyData | undefined }) {
  const qc = useQueryClient();
  const [sessionTimeout, setSessionTimeout] = React.useState('10080');
  const [minLen, setMinLen] = React.useState(8);
  const [reqUpper, setReqUpper] = React.useState(true);
  const [reqNum, setReqNum] = React.useState(true);
  const [reqSym, setReqSym] = React.useState(false);
  const [maxFailed, setMaxFailed] = React.useState(5);
  const [lockout, setLockout] = React.useState(15);

  React.useEffect(() => {
    if (policy) {
      const t = String(policy.session_timeout_minutes ?? 10080);
      setSessionTimeout(TIMEOUT_OPTIONS.some((o) => o.value === t) ? t : '10080');
      setMinLen(policy.password_min_length ?? 8);
      setReqUpper(policy.password_require_uppercase ?? true);
      setReqNum(policy.password_require_number ?? true);
      setReqSym(policy.password_require_symbol ?? false);
      setMaxFailed(policy.max_failed_logins ?? 5);
      setLockout(policy.lockout_minutes ?? 15);
    }
  }, [policy]);

  const save = useMutation({
    mutationFn: () => customFetch('/settings/security', {
      method: 'PATCH',
      body: JSON.stringify({
        session_timeout_minutes: Number(sessionTimeout),
        password_min_length: minLen,
        password_require_uppercase: reqUpper,
        password_require_number: reqNum,
        password_require_symbol: reqSym,
        max_failed_logins: maxFailed,
        lockout_minutes: lockout,
      }),
    }),
    onSuccess: () => {
      toast.success('Security policy saved');
      qc.invalidateQueries({ queryKey: ['getSettings'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10"><Lock className="h-5 w-5 text-primary" /></div>
          <div>
            <CardTitle>Security Policy</CardTitle>
            <CardDescription>Organization-wide password rules, session timeout and account lockout.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Session timeout */}
        <div className="space-y-1.5 max-w-xs">
          <Label className="flex items-center gap-1.5"><Clock className="h-4 w-4 text-muted-foreground" />Session timeout</Label>
          <Select value={sessionTimeout} onValueChange={setSessionTimeout}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {TIMEOUT_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Users are signed out after this period. Applies at next login.</p>
        </div>

        {/* Password policy */}
        <div className="space-y-3 rounded-lg border p-4">
          <p className="text-sm font-medium">Password requirements</p>
          <div className="space-y-1.5 max-w-[200px]">
            <Label htmlFor="min-len">Minimum length</Label>
            <Input id="min-len" type="number" min={6} max={128} value={minLen} onChange={(e) => setMinLen(Number(e.target.value))} />
          </div>
          {([
            ['Require an uppercase letter', reqUpper, setReqUpper],
            ['Require a number', reqNum, setReqNum],
            ['Require a symbol', reqSym, setReqSym],
          ] as const).map(([label, val, set]) => (
            <div key={label} className="flex items-center justify-between">
              <span className="text-sm">{label}</span>
              <Switch checked={val} onCheckedChange={set} />
            </div>
          ))}
        </div>

        {/* Lockout */}
        <div className="space-y-3 rounded-lg border p-4">
          <p className="text-sm font-medium flex items-center gap-1.5"><AlertTriangle className="h-4 w-4 text-amber-500" />Account lockout</p>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="max-failed">Max failed attempts</Label>
              <Input id="max-failed" type="number" min={0} max={20} value={maxFailed} onChange={(e) => setMaxFailed(Number(e.target.value))} />
              <p className="text-xs text-muted-foreground">0 disables lockout</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lockout-min">Lock duration (minutes)</Label>
              <Input id="lockout-min" type="number" min={1} max={1440} value={lockout} onChange={(e) => setLockout(Number(e.target.value))} />
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save Security Policy'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Login history (admin only) ───────────────────────────────────────────────
interface LoginRow {
  id: number;
  email: string;
  success: boolean;
  reason: string | null;
  ip_address: string | null;
  created_at: string;
}
interface LoginHistoryResponse {
  items: LoginRow[];
  total: number;
  page: number;
  page_size: number;
  recent_failures_24h: number;
}

const REASON_LABELS: Record<string, string> = {
  wrong_password: 'Wrong password',
  invalid_2fa: 'Invalid 2FA code',
  account_locked: 'Account locked',
  unknown_user: 'Unknown user',
  inactive: 'Inactive account',
};

function LoginHistoryCard() {
  const [page, setPage] = React.useState(1);
  const [filter, setFilter] = React.useState<'all' | 'true' | 'false'>('all');

  const { data, isLoading } = useQuery<LoginHistoryResponse>({
    queryKey: ['security', 'login-history', page, filter],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), page_size: '10' });
      if (filter !== 'all') params.set('success', filter);
      return customFetch(`/security/login-history?${params.toString()}`);
    },
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / 10));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10"><History className="h-5 w-5 text-primary" /></div>
            <div>
              <CardTitle>Login History</CardTitle>
              <CardDescription>Recent sign-in attempts across all accounts.</CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {data && data.recent_failures_24h > 0 && (
              <Badge className="bg-amber-100 text-amber-700 border-amber-200 gap-1">
                <AlertTriangle className="h-3 w-3" />{data.recent_failures_24h} failed in 24h
              </Badge>
            )}
            <Select value={filter} onValueChange={(v) => { setFilter(v as typeof filter); setPage(1); }}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All attempts</SelectItem>
                <SelectItem value="true">Successful</SelectItem>
                <SelectItem value="false">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : items.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm">No login attempts recorded yet.</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b">
                    <th className="py-2 pr-3 font-medium">When</th>
                    <th className="py-2 pr-3 font-medium">Account</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 pr-3 font-medium">IP address</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {items.map((r) => (
                    <tr key={r.id}>
                      <td className="py-2.5 pr-3 whitespace-nowrap text-muted-foreground">{formatDate(r.created_at)}</td>
                      <td className="py-2.5 pr-3">{r.email}</td>
                      <td className="py-2.5 pr-3">
                        {r.success ? (
                          <span className="inline-flex items-center gap-1 text-green-600"><CheckCircle2 className="h-3.5 w-3.5" />Success</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-destructive">
                            <XCircle className="h-3.5 w-3.5" />
                            {r.reason ? (REASON_LABELS[r.reason] ?? 'Failed') : 'Failed'}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 pr-3 font-mono text-xs text-muted-foreground">{r.ip_address ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <span className="text-xs text-muted-foreground">Page {page} of {totalPages} · {total} total</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                  <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Security panel ──────────────────────────────────────────────────────
export function SecurityPanel({ policy, isAdmin }: { policy: SecurityPolicyData | undefined; isAdmin: boolean }) {
  return (
    <div className="space-y-6">
      <ChangePasswordCard policy={policy} />
      <TwoFactorCard />
      {isAdmin && <PolicyCard policy={policy} />}
      {isAdmin && <LoginHistoryCard />}
    </div>
  );
}
