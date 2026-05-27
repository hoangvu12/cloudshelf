/**
 * React Query hooks for bucket versioning + per-object version history.
 *
 * Two surfaces on one resource:
 *   - bucket-level: `useBucketVersioning` / `useSetBucketVersioning` drive the
 *     bucket-settings toggle.
 *   - object-level: `useObjectVersions` lists every version + delete marker
 *     for a single key; `useRestoreObjectVersion` and `useDeleteObjectVersion`
 *     mutate it.
 *
 * Mutations invalidate two surfaces: the specific versioning key the write
 * touched, AND `objectKeys.bucket` — restoring or deleting a version changes
 * the bucket's latest listing (a delete marker is what hides the key from the
 * delimiter-listing) so any open listing needs to refresh.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
} from "@tanstack/react-query";
import { apiFetch } from "./client";
import { objectKeys } from "./objects";
import type { ObjectVersion, VersioningStatus } from "@server/types";

export const versioningKeys = {
  bucket: (connectionId: string, bucket: string) =>
    ["versioning-bucket", connectionId, bucket] as const,
  object: (connectionId: string, bucket: string, key: string) =>
    ["versioning-object", connectionId, bucket, key] as const,
};

function basePath(connectionId: string, bucket: string): string {
  return `/connections/${connectionId}/buckets/${encodeURIComponent(bucket)}`;
}

export function useBucketVersioning(
  connectionId: string | null | undefined,
  bucket: string | null | undefined
) {
  const enabled = !!connectionId && !!bucket;
  return useQuery<{ status: VersioningStatus }, Error>({
    queryKey: enabled
      ? versioningKeys.bucket(connectionId!, bucket!)
      : ["versioning-bucket", "none"],
    queryFn: () =>
      apiFetch<{ status: VersioningStatus }>(
        `${basePath(connectionId!, bucket!)}/versioning`
      ),
    enabled,
    // Versioning state is rarely flipped — keep the answer for a while so the
    // preview panel's Versioning section doesn't refetch on every prev/next.
    staleTime: 5 * 60 * 1000,
  });
}

export function useSetBucketVersioning(
  connectionId: string,
  bucket: string,
  options?: UseMutationOptions<
    { ok: true },
    Error,
    { status: "Enabled" | "Suspended" }
  >
) {
  const qc = useQueryClient();
  return useMutation({
    ...options,
    mutationFn: ({ status }) =>
      apiFetch<{ ok: true }>(`${basePath(connectionId, bucket)}/versioning`, {
        method: "PUT",
        body: { status },
      }),
    onSuccess: (...args) => {
      qc.invalidateQueries({
        queryKey: versioningKeys.bucket(connectionId, bucket),
      });
      return options?.onSuccess?.(...args);
    },
  });
}

export function useObjectVersions(
  connectionId: string | null | undefined,
  bucket: string | null | undefined,
  key: string | null | undefined
) {
  const enabled = !!connectionId && !!bucket && !!key;
  return useQuery<{ versions: ObjectVersion[] }, Error>({
    queryKey: enabled
      ? versioningKeys.object(connectionId!, bucket!, key!)
      : ["versioning-object", "none"],
    queryFn: () =>
      apiFetch<{ versions: ObjectVersion[] }>(
        `${basePath(connectionId!, bucket!)}/objects/versions?key=${encodeURIComponent(
          key!
        )}`
      ),
    enabled,
  });
}

export function useRestoreObjectVersion(
  connectionId: string,
  bucket: string,
  options?: UseMutationOptions<
    { ok: true },
    Error,
    { key: string; versionId: string }
  >
) {
  const qc = useQueryClient();
  return useMutation({
    ...options,
    mutationFn: (body) =>
      apiFetch<{ ok: true }>(
        `${basePath(connectionId, bucket)}/objects/versions/restore`,
        { method: "POST", body }
      ),
    onSuccess: (...args) => {
      const vars = args[1];
      // Restore writes a new latest version → the per-object list grows.
      qc.invalidateQueries({
        queryKey: versioningKeys.object(connectionId, bucket, vars.key),
      });
      // The bucket-level listing's latest etag/lastModified for this key now
      // points at the new version, so any open prefix listing needs to refresh.
      qc.invalidateQueries({
        queryKey: objectKeys.bucket(connectionId, bucket),
      });
      return options?.onSuccess?.(...args);
    },
  });
}

export function useDeleteObjectVersion(
  connectionId: string,
  bucket: string,
  options?: UseMutationOptions<
    { ok: true },
    Error,
    { key: string; versionId: string }
  >
) {
  const qc = useQueryClient();
  return useMutation({
    ...options,
    mutationFn: ({ key, versionId }) =>
      apiFetch<{ ok: true }>(
        `${basePath(connectionId, bucket)}/objects/versions?key=${encodeURIComponent(
          key
        )}&versionId=${encodeURIComponent(versionId)}`,
        { method: "DELETE" }
      ),
    onSuccess: (...args) => {
      const vars = args[1];
      qc.invalidateQueries({
        queryKey: versioningKeys.object(connectionId, bucket, vars.key),
      });
      // Deleting the latest version (or a delete marker) can change what shows
      // up in the bucket listing — refresh broadly to be safe.
      qc.invalidateQueries({
        queryKey: objectKeys.bucket(connectionId, bucket),
      });
      return options?.onSuccess?.(...args);
    },
  });
}
