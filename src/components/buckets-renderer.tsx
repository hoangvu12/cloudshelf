import { BucketList } from "@/components/bucket-list";
import { BucketGrid } from "@/components/bucket-grid";
import { usePrefsStore } from "@/stores/prefs";
import type { Bucket } from "@server/types";

export function BucketsRenderer(props: {
  buckets: Bucket[];
  pinnedNames: Set<string>;
  filter: string;
  onTogglePin: (name: string) => void;
  onOpenBucket: (name: string) => void;
  onOpenSettings: (name: string) => void;
}) {
  const viewMode = usePrefsStore((s) => s.viewMode);
  const Component = viewMode === "grid" ? BucketGrid : BucketList;
  return <Component {...props} sortKey="name" />;
}
