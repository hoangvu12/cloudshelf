/**
 * React Query hooks for the activity log (Phase 17).
 *
 * Read-only audit trail of write actions, persisted server-side in SQLite. The
 * server-side `logActivity` helper inside each mutating route in
 * `server/routes/connections.ts` is what populates this; the client is purely
 * a viewer. Per convention #6, this file owns the `activityKeys` factory and
 * the `useXxx` hooks; the "clear" mutation only invalidates `activityKeys`,
 * because activity rows don't surface anywhere else in the UI.
 */

import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type UseMutationOptions,
} from "@tanstack/react-query";
import { apiFetch } from "./client";
import type { ActivityPage } from "@server/types";

export const activityKeys = {
  all: ["activity"] as const,
  list: (limit: number) => ["activity", "list", limit] as const,
};

/**
 * Paginated listing keyed by page size — newest-first, limit/offset on the
 * wire. Limit 50 by default; the server clamps to a hard max of 200 per page.
 */
export function useActivity(limit = 50) {
  return useInfiniteQuery<
    ActivityPage,
    Error,
    { pages: ActivityPage[]; pageParams: number[] },
    readonly unknown[],
    number
  >({
    queryKey: activityKeys.list(limit),
    queryFn: ({ pageParam }) =>
      apiFetch<ActivityPage>(`/activity?limit=${limit}&offset=${pageParam}`),
    initialPageParam: 0,
    getNextPageParam: (last) => {
      const next = last.offset + last.rows.length;
      return next >= last.total ? undefined : next;
    },
  });
}

export function useClearActivity(
  options?: UseMutationOptions<{ ok: true; removed: number }, Error, void>
) {
  const qc = useQueryClient();
  return useMutation({
    ...options,
    mutationFn: () =>
      apiFetch<{ ok: true; removed: number }>("/activity", { method: "DELETE" }),
    onSuccess: (...args) => {
      qc.invalidateQueries({ queryKey: activityKeys.all });
      return options?.onSuccess?.(...args);
    },
  });
}
