import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Per-device pinned buckets. Keyed by connection id so different connections have
 * independent pin sets. The value is a list of bucket names (not a Set, since
 * Set doesn't survive JSON.stringify in the persist middleware).
 */
interface PinnedBucketsState {
  byConnection: Record<string, string[]>;
  toggle: (connectionId: string, bucketName: string) => void;
  isPinned: (connectionId: string, bucketName: string) => boolean;
}

export const usePinnedBucketsStore = create<PinnedBucketsState>()(
  persist(
    (set, get) => ({
      byConnection: {},
      toggle: (connectionId, bucketName) =>
        set((state) => {
          const current = state.byConnection[connectionId] ?? [];
          const next = current.includes(bucketName)
            ? current.filter((n) => n !== bucketName)
            : [...current, bucketName];
          return {
            byConnection: { ...state.byConnection, [connectionId]: next },
          };
        }),
      isPinned: (connectionId, bucketName) =>
        (get().byConnection[connectionId] ?? []).includes(bucketName),
    }),
    { name: "cloudshelf.pinned-buckets" }
  )
);
