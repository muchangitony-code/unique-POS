import React from 'react';
import { Bell, CheckCheck, Trash2, ShieldAlert, Info, AlertTriangle, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface AdminNotification {
  id: number;
  created_at: string;
  title: string;
  body: string;
  severity: 'info' | 'warning' | 'critical';
  rule_id: string;
  read_at: string | null;
}

interface NotificationsResponse {
  notifications: AdminNotification[];
  unread: number;
}

function SeverityIcon({ severity }: { severity: string }) {
  if (severity === 'critical') return <ShieldAlert className="h-4 w-4 text-destructive shrink-0 mt-0.5" />;
  if (severity === 'warning') return <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />;
  return <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function NotificationBell() {
  const { token, user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);

  const isAdmin = user?.role === 'super_admin' || user?.role === 'business_owner' || user?.role === 'administrator';
  if (!isAdmin) return null;

  const authHeader = React.useMemo<Record<string, string>>(() => {
    const h: Record<string, string> = {};
    if (token) h['Authorization'] = `Bearer ${token}`;
    return h;
  }, [token]);

  const { data } = useQuery<NotificationsResponse>({
    queryKey: ['admin-notifications'],
    queryFn: async () => {
      const res = await fetch('/api/notifications', { headers: authHeader });
      if (!res.ok) throw new Error('Failed to load notifications');
      return res.json();
    },
    refetchInterval: 30_000,
    enabled: isAdmin,
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/notifications/read-all', {
        method: 'PATCH',
        headers: authHeader,
      });
      if (!res.ok) throw new Error('Failed');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-notifications'] }),
  });

  const clearAll = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/notifications', {
        method: 'DELETE',
        headers: authHeader,
      });
      if (!res.ok) throw new Error('Failed');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-notifications'] });
      toast.success('Notifications cleared');
      setOpen(false);
    },
  });

  const markOne = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/notifications/${id}/read`, {
        method: 'PATCH',
        headers: authHeader,
      });
      if (!res.ok) throw new Error('Failed');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-notifications'] }),
  });

  const notifications = data?.notifications ?? [];
  const unread = data?.unread ?? 0;

  return (
    <Popover open={open} onOpenChange={(o) => {
      setOpen(o);
      if (o && unread > 0) markAllRead.mutate();
    }}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-white leading-none">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold">Security Alerts</span>
            {notifications.length > 0 && (
              <Badge variant="secondary" className="text-xs">{notifications.length}</Badge>
            )}
          </div>
          {notifications.length > 0 && (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-xs text-muted-foreground"
                onClick={() => clearAll.mutate()}
                disabled={clearAll.isPending}
              >
                <Trash2 className="h-3 w-3" />
                Clear
              </Button>
            </div>
          )}
        </div>

        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
            <CheckCheck className="h-8 w-8 mb-2 opacity-40" />
            <p className="text-sm font-medium">No alerts</p>
            <p className="text-xs mt-1 opacity-70">Suspicious activity will appear here</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[400px]">
            <div className="divide-y">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={cn(
                    "flex gap-3 px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors",
                    !n.read_at && "bg-muted/30"
                  )}
                  onClick={() => { if (!n.read_at) markOne.mutate(n.id); }}
                >
                  <SeverityIcon severity={n.severity} />
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-xs font-semibold leading-tight truncate", !n.read_at && "text-foreground", n.read_at && "text-muted-foreground")}>
                      {n.title}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">{n.body}</p>
                    <p className="text-[10px] text-muted-foreground/60 mt-1">{timeAgo(n.created_at)}</p>
                  </div>
                  {!n.read_at && (
                    <div className="h-2 w-2 rounded-full bg-primary shrink-0 mt-1.5" />
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        {/* View all link */}
        <div className="border-t px-4 py-2.5">
          <a
            href="/security-alerts"
            className="flex items-center justify-center gap-1.5 text-xs text-primary hover:underline font-medium"
            onClick={() => setOpen(false)}
          >
            View all alerts
            <ArrowRight className="h-3 w-3" />
          </a>
        </div>
      </PopoverContent>
    </Popover>
  );
}
