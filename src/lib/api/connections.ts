/**
 * React Query hooks for /api/connections.
 *
 * Pairs with the server's connectionsRoute (server/routes/connections.ts).
 * Query keys are flat tuples so they're easy to invalidate across the app.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
} from "@tanstack/react-query";
import { apiFetch } from "./client";
import type {
  CreateConnectionInput,
  S3Connection,
  TestConnectionResult,
  UpdateConnectionInput,
} from "@server/types";

export const connectionKeys = {
  all: ["connections"] as const,
  detail: (id: string) => ["connections", id] as const,
};

export function useConnections() {
  return useQuery({
    queryKey: connectionKeys.all,
    queryFn: () => apiFetch<S3Connection[]>("/connections"),
  });
}

export function useConnection(id: string | null | undefined) {
  return useQuery({
    queryKey: id ? connectionKeys.detail(id) : ["connections", "none"],
    queryFn: () => apiFetch<S3Connection>(`/connections/${id}`),
    enabled: !!id,
  });
}

export function useTestConnection(
  options?: UseMutationOptions<TestConnectionResult, Error, CreateConnectionInput>
) {
  return useMutation({
    mutationFn: (input) =>
      apiFetch<TestConnectionResult>("/connections/test", {
        method: "POST",
        body: input,
      }),
    ...options,
  });
}

export function useCreateConnection(
  options?: UseMutationOptions<S3Connection, Error, CreateConnectionInput>
) {
  const qc = useQueryClient();
  return useMutation({
    ...options,
    mutationFn: (input) =>
      apiFetch<S3Connection>("/connections", { method: "POST", body: input }),
    onSuccess: (...args) => {
      qc.invalidateQueries({ queryKey: connectionKeys.all });
      return options?.onSuccess?.(...args);
    },
  });
}

export function useUpdateConnection(
  options?: UseMutationOptions<
    S3Connection,
    Error,
    { id: string; patch: UpdateConnectionInput }
  >
) {
  const qc = useQueryClient();
  return useMutation({
    ...options,
    mutationFn: ({ id, patch }) =>
      apiFetch<S3Connection>(`/connections/${id}`, { method: "PATCH", body: patch }),
    onSuccess: (...args) => {
      const [, vars] = args;
      qc.invalidateQueries({ queryKey: connectionKeys.all });
      qc.invalidateQueries({ queryKey: connectionKeys.detail(vars.id) });
      return options?.onSuccess?.(...args);
    },
  });
}

export function useDeleteConnection(
  options?: UseMutationOptions<{ ok: true }, Error, string>
) {
  const qc = useQueryClient();
  return useMutation({
    ...options,
    mutationFn: (id) =>
      apiFetch<{ ok: true }>(`/connections/${id}`, { method: "DELETE" }),
    onSuccess: (...args) => {
      qc.invalidateQueries({ queryKey: connectionKeys.all });
      return options?.onSuccess?.(...args);
    },
  });
}
