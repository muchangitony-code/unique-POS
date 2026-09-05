import React, { createContext, useContext, useEffect, useRef, useState, ReactNode, useCallback } from 'react';
import { setExtraHeadersGetter } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { isSuperAdmin } from '@/lib/permissions';

const STORAGE_KEY = 'active_branch_id';

function readStoredBranch(): number | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === null || stored === 'all') return null;
    const n = Number(stored);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

// Module-level mirror of the active scope, read by the header getter on every
// request. Kept in sync by the provider (during render, so it is correct BEFORE
// child queries fire on the initial load — not just after a useEffect).
// `null` = "All Branches" (super admin only); the header is omitted entirely.
// Initialised from localStorage so a reload with a persisted branch is scoped
// from the very first request once scoping is enabled.
let _activeBranchId: number | null = readStoredBranch();
let _scopingEnabled = false; // only super admins scope the branch view

// Registered once at module load. Non-super users never send the header (the
// server hard-locks them to their own branch via the JWT anyway).
setExtraHeadersGetter(() => {
  if (_scopingEnabled && _activeBranchId != null) {
    return { 'x-branch-id': String(_activeBranchId) };
  }
  return null;
});

interface BranchContextType {
  /** Active branch id, or null for "All Branches". Only meaningful for super admins. */
  activeBranchId: number | null;
  /** Whether the current user may switch branches. */
  canSwitch: boolean;
  /** Change the active branch view. Pass null for "All Branches". */
  setActiveBranch: (id: number | null) => void;
}

const BranchContext = createContext<BranchContextType | null>(null);

export function BranchProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canSwitch = isSuperAdmin(user?.role);

  const [activeBranchId, setActiveBranchIdState] = useState<number | null>(readStoredBranch);

  // Sync the module-level mirror DURING render (not in an effect) so children
  // that fire queries on their first render already see the correct scope.
  _scopingEnabled = canSwitch;
  _activeBranchId = canSwitch ? activeBranchId : null;

  // Auth may hydrate asynchronously: some queries can fire before `user` is
  // known (canSwitch=false), landing unscoped "all branches" results in the
  // cache. Once scoping first becomes active with a persisted branch, refetch
  // once so nothing stale from that window lingers.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (!hydratedRef.current && canSwitch && activeBranchId != null) {
      hydratedRef.current = true;
      void queryClient.invalidateQueries();
    }
  }, [canSwitch, activeBranchId, queryClient]);

  const setActiveBranch = useCallback((id: number | null) => {
    _activeBranchId = id;
    setActiveBranchIdState(id);
    try {
      localStorage.setItem(STORAGE_KEY, id == null ? 'all' : String(id));
    } catch {
      /* ignore storage failures */
    }
    // Refetch everything so the whole app reflects the new branch view.
    void queryClient.invalidateQueries();
  }, [queryClient]);

  return (
    <BranchContext.Provider value={{ activeBranchId, canSwitch, setActiveBranch }}>
      {children}
    </BranchContext.Provider>
  );
}

export const useBranch = () => {
  const ctx = useContext(BranchContext);
  if (!ctx) throw new Error('useBranch must be used within a BranchProvider');
  return ctx;
};
