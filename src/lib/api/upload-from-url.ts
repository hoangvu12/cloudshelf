/**
 * React Query hook for the server-side "Upload from URL" flow.
 *
 * Browser CORS prevents fetching arbitrary third-party URLs from the SPA, so
 * the actual transfer happens on the server: it streams the upstream response
 * body straight into S3 via @aws-sdk/lib-storage's `Upload`. This module is
 * thin — POST the (url, key) tuple, surface the success/failure to the
 * caller, and invalidate any open listing under the bucket so the new key
 * shows up without a manual refresh.
 *
 * Note that this path does NOT go through Uppy. The mutation talks directly
 * to the new `/objects/from-url` route; the file never lives in the browser.
 */

import {
  useMutation,
  useQueryClient,
  type UseMutationOptions,
} from "@tanstack/react-query";
import { apiFetch } from "./client";
import { objectKeys } from "./objects";

export interface UploadFromUrlResult {
  ok: true;
  key: string;
  contentType: string;
}

function basePath(connectionId: string, bucket: string): string {
  return `/connections/${connectionId}/buckets/${encodeURIComponent(bucket)}`;
}

export function useUploadFromUrl(
  connectionId: string,
  bucket: string,
  options?: UseMutationOptions<
    UploadFromUrlResult,
    Error,
    { url: string; key: string }
  >
) {
  const qc = useQueryClient();
  return useMutation({
    ...options,
    mutationFn: (body) =>
      apiFetch<UploadFromUrlResult>(
        `${basePath(connectionId, bucket)}/objects/from-url`,
        { method: "POST", body }
      ),
    onSuccess: (...args) => {
      qc.invalidateQueries({
        queryKey: objectKeys.bucket(connectionId, bucket),
      });
      return options?.onSuccess?.(...args);
    },
  });
}
