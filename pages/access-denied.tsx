import { useLocation } from 'wouter';
import { ShieldOff } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function AccessDenied() {
  const [, setLocation] = useLocation();
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="p-4 rounded-full bg-destructive/10">
        <ShieldOff className="h-12 w-12 text-destructive" />
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Access Denied</h1>
        <p className="text-muted-foreground max-w-sm">
          You don't have permission to view this page. Contact your Administrator
          if you believe this is a mistake.
        </p>
      </div>
      <Button onClick={() => setLocation('/dashboard')} variant="outline">
        Back to Dashboard
      </Button>
    </div>
  );
}
