import type { useBuckets } from "@/lib/api/buckets";
import type { useConnections } from "@/lib/api/connections";

export type BucketsPageState =
  | { kind: "loading-connections" }
  | { kind: "api-unreachable"; message: string }
  | { kind: "no-connections" }
  | { kind: "loading-buckets" }
  | { kind: "buckets-error"; message: string }
  | { kind: "no-buckets" }
  | { kind: "ok" };

export function bucketsPageState({
  connections,
  buckets,
}: {
  connections: ReturnType<typeof useConnections>;
  buckets: ReturnType<typeof useBuckets>;
}): BucketsPageState {
  if (connections.isLoading) return { kind: "loading-connections" };
  if (connections.error)
    return {
      kind: "api-unreachable",
      message:
        connections.error instanceof Error
          ? connections.error.message
          : "Unknown error",
    };
  if (!connections.data || connections.data.length === 0)
    return { kind: "no-connections" };
  if (buckets.isLoading) return { kind: "loading-buckets" };
  if (buckets.error)
    return {
      kind: "buckets-error",
      message:
        buckets.error instanceof Error ? buckets.error.message : "Unknown error",
    };
  if (!buckets.data || buckets.data.length === 0) return { kind: "no-buckets" };
  return { kind: "ok" };
}
