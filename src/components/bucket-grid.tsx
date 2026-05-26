import * as React from "react";
import {
  Database,
  MoreHorizontal,
  Pin,
  type LucideIcon,
} from "@/lib/icons";

import { cn } from "@/lib/utils";
import { formatBytes, formatCount, formatFileTime } from "@/lib/format";
import { usePrefsStore } from "@/stores/prefs";
import type { Bucket } from "@server/types";

type SortKey = "name" | "size" | "objects" | "created";

/**
 * Grid view counterpart to BucketList. Pinned buckets render first, then a
 * thin divider, then the rest. Tile sizing comes from CSS auto-fill so the
 * grid reflows naturally on resize — no virtualization since a single account
 * rarely has more buckets than fit on one screen.
 *
 * Card density tracks the same `density` pref as the list view: comfortable
 * gives larger tiles with size + items + modified, compact drops to just name
 * with a smaller icon.
 */
export function BucketGrid({
  buckets,
  pinnedNames,
  filter,
  sortKey,
  onTogglePin,
  onOpenBucket,
}: {
  buckets: Bucket[];
  pinnedNames: Set<string>;
  filter: string;
  sortKey: SortKey;
  onTogglePin?: (name: string) => void;
  onOpenBucket?: (name: string) => void;
}) {
  const filtered = React.useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const list = needle
      ? buckets.filter((b) => b.name.toLowerCase().includes(needle))
      : buckets;
    return [...list].sort(compare(sortKey));
  }, [buckets, filter, sortKey]);

  const pinned = filtered.filter((b) => pinnedNames.has(b.name));
  const other = filtered.filter((b) => !pinnedNames.has(b.name));
  const density = usePrefsStore((s) => s.density);

  return (
    <div className="flex-1 overflow-y-auto p-4">
      {pinned.length > 0 && (
        <Section>
          {pinned.map((b) => (
            <BucketCard
              key={b.name}
              bucket={b}
              pinned
              density={density}
              onTogglePin={onTogglePin}
              onOpen={onOpenBucket}
            />
          ))}
        </Section>
      )}
      {pinned.length > 0 && other.length > 0 && (
        <div className="bg-muted my-4 h-px" />
      )}
      {other.length > 0 && (
        <Section>
          {other.map((b) => (
            <BucketCard
              key={b.name}
              bucket={b}
              pinned={false}
              density={density}
              onTogglePin={onTogglePin}
              onOpen={onOpenBucket}
            />
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
      {children}
    </div>
  );
}

function BucketCard({
  bucket,
  pinned,
  density,
  onTogglePin,
  onOpen,
}: {
  bucket: Bucket;
  pinned: boolean;
  density: "comfortable" | "compact";
  onTogglePin?: (name: string) => void;
  onOpen?: (name: string) => void;
}) {
  const { Icon, accent } = bucketAppearance(bucket.name);
  const compact = density === "compact";

  return (
    <div
      onClick={() => onOpen?.(bucket.name)}
      className={cn(
        "group bg-card/40 border-border hover:border-accent-mauve/60 hover:bg-muted/30 relative flex cursor-pointer flex-col rounded-lg border",
        compact ? "gap-2 p-3" : "gap-3 p-4"
      )}
    >
      <div className="flex items-start justify-between">
        <Icon
          className={cn(compact ? "size-7" : "size-10", accent)}
        />
        <div className="flex items-center gap-1">
          {pinned && (
            <Pin className="fill-accent-yellow text-accent-yellow size-3" />
          )}
          <button
            type="button"
            aria-label="More actions"
            onClick={(e) => e.stopPropagation()}
            className="text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 focus:outline-none"
          >
            <MoreHorizontal className="size-4" />
          </button>
        </div>
      </div>

      <div className="min-w-0">
        <div
          className={cn(
            "text-foreground truncate text-sm",
            pinned && "font-medium"
          )}
          title={bucket.name}
        >
          {bucket.name}
        </div>
        {!compact && (
          <div className="text-muted-foreground mt-1 truncate font-mono text-[10px]">
            {formatFileTime(bucket.createdAt)}
          </div>
        )}
      </div>

      {!compact && (
        <div className="border-border text-muted-foreground mt-auto flex items-center justify-between border-t pt-2 font-mono text-[10px]">
          <span>{formatBytes(bucket.sizeBytes)}</span>
          <span className="text-muted-foreground">·</span>
          <span>{formatCount(bucket.objectCount)} items</span>
        </div>
      )}

      <button
        type="button"
        aria-label={pinned ? "Unpin bucket" : "Pin bucket"}
        aria-pressed={pinned}
        onClick={(e) => {
          e.stopPropagation();
          onTogglePin?.(bucket.name);
        }}
        className={cn(
          "absolute top-2 right-2 focus:outline-none",
          pinned ? "text-accent-yellow" : "text-muted-foreground hover:text-accent-yellow opacity-0 group-hover:opacity-100"
        )}
      >
        <Pin className={cn("size-3.5", pinned && "fill-accent-yellow")} />
      </button>
    </div>
  );
}

/**
 * All buckets get the same S3-style cylinder in the brand accent. Color
 * carries no implicit meaning — the pin badge is the only color signal.
 */
function bucketAppearance(
  _name: string
): { Icon: LucideIcon; accent: string } {
  return { Icon: Database, accent: "text-yellow-300" };
}

function compare(key: SortKey) {
  return (a: Bucket, b: Bucket) => {
    switch (key) {
      case "name":
        return a.name.localeCompare(b.name);
      case "size":
        return (b.sizeBytes ?? 0) - (a.sizeBytes ?? 0);
      case "objects":
        return (b.objectCount ?? 0) - (a.objectCount ?? 0);
      case "created":
        return (
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
    }
  };
}
