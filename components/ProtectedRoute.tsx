import React from 'react';
import { Redirect, useLocation } from 'wouter';
import { getTier, type FunctionalTier } from '@/lib/permissions';
import { Sidebar } from './layout/Sidebar';
import { TopNav } from './layout/TopNav';
import AccessDenied from '@/pages/access-denied';

interface ProtectedRouteProps {
  children: React.ReactNode;
  title?: string;
  /** If provided, only users whose tier is in this list may view the page. */
  allowedTiers?: FunctionalTier[];
}

export function ProtectedRoute({ children, title, allowedTiers }: ProtectedRouteProps) {
  const { token, user } = useAuth();
  const [location] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  React.useEffect(() => {
    setMobileMenuOpen(false);
  }, [location]);

  React.useEffect(() => {
    if (!mobileMenuOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileMenuOpen(false);
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [mobileMenuOpen]);

  if (!token) {
    return <Redirect to={`/login?redirect=${encodeURIComponent(location)}`} />;
  }

  const tier = getTier(user?.role);
  const denied = allowedTiers && (!tier || !allowedTiers.includes(tier));

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col md:flex-row overflow-hidden">
      <Sidebar mobileOpen={mobileMenuOpen} onMobileClose={() => setMobileMenuOpen(false)} />
      <div className="flex-1 flex flex-col w-full min-w-0 overflow-hidden">
        <TopNav
          title={denied ? 'Access Denied' : title}
          onMenuClick={() => setMobileMenuOpen(true)}
        />
        <main className="flex-1 min-w-0 overflow-auto bg-muted/20">
          {denied ? <AccessDenied /> : children}
        </main>
      </div>
    </div>
  );
}

function useAuth() {
  // Kept as a local import-compatible hook wrapper so the layout remains explicit.
  // The actual authentication state comes from AuthContext.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { useAuth: authHook } = require('@/contexts/AuthContext') as typeof import('@/contexts/AuthContext');
  return authHook();
}
