/**
 * React Query hooks for per-object info: HEAD response, tags, and metadata
 * writes. The info panel is the only consumer today; versioning ops (Phase 5)
 * will reuse the same query keys via the `versionId` query param.
 *
 * Writes invalidate two surfaces: the object's own info-panel entries, and
 * the broad `objectKeys.bucket` so the listing row updates if storage class
 * or other surface-level fields changed as a side-effect of the write.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
} from "@tanstack/react-query";
import { apiFetch } from "./client";
import { objectKeys } from "./objects";
import type { ObjectHead, ObjectTag } from "@server/types";

export const objectInfoKeys = {
  head: (connectionId: string, bucket: string, key: string, versionId?: string) =>
    ["object-head", connectionId, bucket, key, versionId ?? null] as const,
  tags: (connectionId: string, bucket: string, key: string, versionId?: string) =>
    ["object-tags", connectionId, bucket, key, versionId ?? null] as const,
};

function basePath(connectionId: string, bucket: string): string {
  return `/connections/${connectionId}/buckets/${encodeURIComponent(bucket)}`;
}

function infoQs(key: string, versionId?: string): string {
  const qs = new URLSearchParams({ key });
  if (versionId) qs.set("versionId", versionId);
  return qs.toString();
}

export function useObjectHead(
  connectionId: string | null | undefined,
  bucket: string | null | undefined,
  key: string | null | undefined,
  versionId?: string
) {
  const enabled = !!connectionId && !!bucket && !!key;
  return useQuery<ObjectHead, Error>({
    queryKey: enabled
      ? objectInfoKeys.head(connectionId!, bucket!, key!, versionId)
      : ["object-head", "none"],
    queryFn: () =>
      apiFetch<ObjectHead>(
        `${basePath(connectionId!, bucket!)}/objects/head?${infoQs(key!, versionId)}`
      ),
    enabled,
  });
}

export function useObjectTags(
  connectionId: string | null | undefined,
  bucket: string | null | undefined,
  key: string | null | undefined,
  versionId?: string
) {
  const enabled = !!connectionId && !!bucket && !!key;
  return useQuery<{ tags: ObjectTag[] }, Error>({
    queryKey: enabled
      ? objectInfoKeys.tags(connectionId!, bucket!, key!, versionId)
      : ["object-tags", "none"],
    queryFn: () =>
      apiFetch<{ tags: ObjectTag[] }>(
        `${basePath(connectionId!, bucket!)}/objects/tags?${infoQs(key!, versionId)}`
      ),
    enabled,
  });
}

export function usePutObjectTags(
  connectionId: string,
  bucket: string,
  options?: UseMutationOptions<
    { ok: true },
    Error,
    { key: string; tags: ObjectTag[]; versionId?: string }
  >
) {
  const qc = useQueryClient();
  return useMutation({
    ...options,
    mutationFn: ({ key, tags, versionId }) =>
      apiFetch<{ ok: true }>(
        `${basePath(connectionId, bucket)}/objects/tags?${infoQs(key, versionId)}`,
        { method: "PUT", body: { tags } }
      ),
    onSuccess: (...args) => {
      const vars = args[1];
      qc.invalidateQueries({
        queryKey: objectInfoKeys.tags(connectionId, bucket, vars.key, vars.versionId),
      });
      return options?.onSuccess?.(...args);
    },
  });
}

export function useUpdateObjectMetadata(
  connectionId: string,
  bucket: string,
  options?: UseMutationOptions<
    { ok: true },
    Error,
    {
      key: string;
      contentType?: string;
      userMetadata: Record<string, string>;
    }
  >
) {
  const qc = useQueryClient();
  return useMutation({
    ...options,
    mutationFn: ({ key, contentType, userMetadata }) =>
      apiFetch<{ ok: true }>(
        `${basePath(connectionId, bucket)}/objects/metadata?${infoQs(key)}`,
        { method: "PUT", body: { contentType, userMetadata } }
      ),
    onSuccess: (...args) => {
      const vars = args[1];
      // HEAD changed for this key.
      qc.invalidateQueries({
        queryKey: objectInfoKeys.head(connectionId, bucket, vars.key),
      });
      // CopyObject also re-stamps lastModified / etag / storageClass, so the
      // surrounding listing row needs to refresh.
      qc.invalidateQueries({
        queryKey: objectKeys.bucket(connectionId, bucket),
      });
      return options?.onSuccess?.(...args);
    },
  });
}
