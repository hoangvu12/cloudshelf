/**
 * React Query hook for buckets under a given connection.
 * Backed by GET /api/connections/:id/buckets, which calls S3's ListBuckets.
 *
 * Note: `sizeBytes` and `objectCount` aren't populated — S3 doesn't return them
 * in the bucket list response. The UI shows "—" for missing values.
 */

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "./client";
import type { Bucket } from "@server/types";

export const bucketKeys = {
  all: (connectionId: string) => ["buckets", connectionId] as const,
};

export function useBuckets(connectionId: string | null | undefined) {
  return useQuery({
    queryKey: connectionId ? bucketKeys.all(connectionId) : ["buckets", "none"],
    queryFn: () => {
      if (!connectionId) throw new Error("connectionId required");
      return apiFetch<Bucket[]>(`/connections/${connectionId}/buckets`);
    },
    enabled: !!connectionId,
  });
}
