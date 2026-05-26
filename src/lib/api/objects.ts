/**
 * React Query hooks for objects under a bucket.
 *
 * Listing is paginated by S3's continuation token but the UI currently consumes
 * only the first page — pagination is wired through the server, exposed here as
 * the `nextContinuationToken` on the query result, and ready to graduate to
 * useInfiniteQuery when a user actually has >1000 entries in a single prefix.
 */

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
} from "@tanstack/react-query";
import { apiFetch } from "./client";
import type {
  DeleteObjectsResult,
  ListObjectsPage,
  PresignedUrl,
} from "@server/types";

export const objectKeys = {
  /** Everything under a bucket — used for broad invalidation after writes. */
  bucket: (connectionId: string, bucket: string) =>
    ["objects", connectionId, bucket] as const,
  list: (connectionId: string, bucket: string, prefix: string) =>
    ["objects", connectionId, bucket, "list", prefix] as const,
};

function basePath(connectionId: string, bucket: string): string {
  return `/connections/${connectionId}/buckets/${encodeURIComponent(bucket)}`;
}

/**
 * Paginated object listing. S3 caps each page at 1000 keys; subsequent pages
 * are fetched on-demand as the user scrolls (see ObjectBrowser's
 * intersection-with-virtualizer logic). All loaded pages are exposed via
 * `data.pages` and the consumer flat-maps them into a single entries array.
 */
export function useObjects(
  connectionId: string | null | undefined,
  bucket: string | null | undefined,
  prefix: string
) {
  const enabled = !!connectionId && !!bucket;
  return useInfiniteQuery<
    ListObjectsPage,
    Error,
    { pages: ListObjectsPage[]; pageParams: (string | undefined)[] },
    readonly unknown[],
    string | undefined
  >({
    queryKey: enabled
      ? objectKeys.list(connectionId!, bucket!, prefix)
      : ["objects", "none"],
    queryFn: ({ pageParam }) => {
      if (!connectionId || !bucket)
        throw new Error("connectionId and bucket required");
      const qs = new URLSearchParams();
      if (prefix) qs.set("prefix", prefix);
      if (pageParam) qs.set("continuationToken", pageParam);
      const qsStr = qs.toString();
      return apiFetch<ListObjectsPage>(
        `${basePath(connectionId, bucket)}/objects${qsStr ? "?" + qsStr : ""}`
      );
    },
    initialPageParam: undefined,
    getNextPageParam: (last) => last.nextContinuationToken,
    enabled,
  });
}

export function useCreateFolder(
  connectionId: string,
  bucket: string,
  options?: UseMutationOptions<{ prefix: string }, Error, { prefix: string }>
) {
  const qc = useQueryClient();
  return useMutation({
    ...options,
    mutationFn: ({ prefix }) =>
      apiFetch<{ prefix: string }>(`${basePath(connectionId, bucket)}/folders`, {
        method: "POST",
        body: { prefix },
      }),
    onSuccess: (...args) => {
      qc.invalidateQueries({ queryKey: objectKeys.bucket(connectionId, bucket) });
      return options?.onSuccess?.(...args);
    },
  });
}

export function useDeleteObjects(
  connectionId: string,
  bucket: string,
  options?: UseMutationOptions<DeleteObjectsResult, Error, { keys: string[] }>
) {
  const qc = useQueryClient();
  return useMutation({
    ...options,
    mutationFn: ({ keys }) =>
      apiFetch<DeleteObjectsResult>(
        `${basePath(connectionId, bucket)}/objects/delete`,
        { method: "POST", body: { keys } }
      ),
    onSuccess: (...args) => {
      qc.invalidateQueries({ queryKey: objectKeys.bucket(connectionId, bucket) });
      return options?.onSuccess?.(...args);
    },
  });
}

/**
 * Server-side copy. Powers rename (same prefix, different basename) and move
 * (different prefix) — both end with a follow-up delete of the source.
 */
export function useCopyObject(
  connectionId: string,
  bucket: string,
  options?: UseMutationOptions<
    { ok: true },
    Error,
    { sourceKey: string; destKey: string }
  >
) {
  const qc = useQueryClient();
  return useMutation({
    ...options,
    mutationFn: (body) =>
      apiFetch<{ ok: true }>(
        `${basePath(connectionId, bucket)}/objects/copy`,
        { method: "POST", body }
      ),
    onSuccess: (...args) => {
      qc.invalidateQueries({ queryKey: objectKeys.bucket(connectionId, bucket) });
      return options?.onSuccess?.(...args);
    },
  });
}

/** One-shot helper — not a hook because download/share is a per-click action. */
export function fetchDownloadUrl(
  connectionId: string,
  bucket: string,
  key: string
): Promise<PresignedUrl> {
  return apiFetch<PresignedUrl>(
    `${basePath(connectionId, bucket)}/objects/download-url?key=${encodeURIComponent(key)}`
  );
}

/**
 * Cached presigned URL for the preview panel. Same endpoint as
 * `fetchDownloadUrl`, but wrapped in a React Query so:
 *   - prev/next through the panel doesn't re-fetch a URL the user just had
 *   - <img>/<video> src stays referentially stable across re-renders
 *
 * staleTime is well under the server-side 15-min expiry so we never serve a
 * stale URL that the user can't actually open.
 */
export function usePreviewUrl(
  connectionId: string | null | undefined,
  bucket: string | null | undefined,
  key: string | null | undefined
) {
  const enabled = !!connectionId && !!bucket && !!key;
  return useQuery<PresignedUrl, Error>({
    queryKey: enabled
      ? (["preview-url", connectionId, bucket, key] as const)
      : ["preview-url", "none"],
    queryFn: () => fetchDownloadUrl(connectionId!, bucket!, key!),
    enabled,
    staleTime: 10 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
}

