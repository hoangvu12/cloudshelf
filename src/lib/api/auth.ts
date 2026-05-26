/**
 * React Query hooks for /api/auth.
 *
 * The session lives in an HttpOnly cookie, so JS never sees the token. We
 * derive "is the user logged in?" purely from whether /api/auth/me returns
 * 200 or 401.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { ApiClientError, apiFetch } from "./client";

export const authKeys = {
  me: ["auth", "me"] as const,
};

export interface Me {
  user: string;
}

export function useMe() {
  return useQuery({
    queryKey: authKeys.me,
    queryFn: () => apiFetch<Me>("/auth/me"),
    // 401 isn't a transient error — don't retry it.
    retry: (failureCount, error) => {
      if (error instanceof ApiClientError && error.status === 401) return false;
      return failureCount < 1;
    },
    staleTime: 60_000,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { username: string; password: string }) =>
      apiFetch<Me>("/auth/login", { method: "POST", body: input }),
    onSuccess: (me) => {
      qc.setQueryData(authKeys.me, me);
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ ok: true }>("/auth/logout", { method: "POST" }),
    onSuccess: () => {
      // Drop everything — credentials in the cache should not survive logout.
      qc.clear();
    },
  });
}
