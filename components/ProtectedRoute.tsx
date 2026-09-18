import React, { useEffect, useState } from 'react';
import { Redirect, useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
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
  const { token, user, logout } = useAuth();
  const [location] = useLocation();
  const [authChecked, setAuthChecked] = useState(false);

  // A JWT can remain in localStorage after it expires. Previously ProtectedRoute
  // only checked whether a token string existed, so an expired token allowed the
  // dashboard to render while every protected API request returned 401, making
  // the POS look like its database had disappeared. Validate the persisted
  // session before mounting any protected page so expired/invalid sessions are
  // sent back to login instead of rendering an empty application.
  useEffect(() => {
    let cancelled = false;

    if (!token) {
      setAuthChecked(false);
      return () => { cancelled = true; };
    }

    setAuthChecked(false);
    fetch('/api/auth/me', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'same-origin',
    })
      .then((response) => {
        if (cancelled) return;
        if (response.ok) {
          setAuthChecked(true);
          return;
        }
        if (response.status === 401 || response.status === 403) {
          logout();
          return;
        }
        // Do not discard a valid session because of a temporary server error.
        setAuthChecked(true);
      })
      .catch(() => {
        if (!cancelled) setAuthChecked(true);
      });

    return () => { cancelled = true; };
  }, [token, logout]);

  if (!token) {
    return <Redirect to={`/login?redirect=${encodeURIComponent(location)}`} />;
  }

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="text-sm text-muted-foreground">Checking your POS session…</div>
      </div>
    );
  }

  const tier = getTier(user?.role);
  const denied = allowedTiers && (!tier || !allowedTiers.includes(tier));

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col md:flex-row overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col w-full overflow-hidden">
        <TopNav title={denied ? 'Access Denied' : title} />
        <main className="flex-1 overflow-auto bg-muted/20">
          {denied ? <AccessDenied /> : children}
        </main>
      </div>
    </div>
  );
}
