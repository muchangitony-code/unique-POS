import { useMemo } from 'react';
import { useListBranches, type Branch } from '@workspace/api-client-react';

/**
 * Build a map of branch id → full branch record so documents can be branded
 * with their owning branch's details. Returns only the branches the current
 * user is allowed to see (their own branch for regular staff, all branches for
 * super admins), which is sufficient because staff only ever view their own
 * documents.
 */
export function useBranchLookup(): Map<number, Branch> {
  const { data } = useListBranches();
  return useMemo(() => {
    const map = new Map<number, Branch>();
    (data ?? []).forEach((b) => map.set(b.id, b));
    return map;
  }, [data]);
}
