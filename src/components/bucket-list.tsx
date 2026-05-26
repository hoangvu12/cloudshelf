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
 * Flat list with an optional pinned section first. Section divider matches the
 * design: a single hairline between pinned and the rest — no extra labels.
 */
export function BucketList({
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
    <>
      <BucketListHeaders />
      <div className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {pinned.map((b) => (
          <BucketRow
            key={b.name}
            bucket={b}
            pinned
            density={density}
            onTogglePin={onTogglePin}
            onOpen={onOpenBucket}
          />
        ))}
        {pinned.length > 0 && other.length > 0 && (
          <div className="bg-muted mx-2 my-2 h-px" />
        )}
        {other.map((b) => (
          <BucketRow
            key={b.name}
            bucket={b}
            pinned={false}
            density={density}
            onTogglePin={onTogglePin}
            onOpen={onOpenBucket}
          />
        ))}
      </div>
    </>
  );
}

function BucketListHeaders() {
  return (
    <div className="border-border text-foreground bg-card/30 flex shrink-0 border-b px-4 py-2 text-[11px] font-bold tracking-wider uppercase">
      <div className="w-8 shrink-0" />
      <div className="flex-1">Name</div>
      <div className="w-24 text-right">Size</div>
      <div className="w-24 text-right">Items</div>
      <div className="w-32 text-right">Modified</div>
      <div className="w-16" />
    </div>
  );
}

function BucketRow({
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

  return (
    <div
      onClick={() => onOpen?.(bucket.name)}
      className={cn(
        "group hover:bg-muted flex cursor-pointer items-center rounded-md px-2",
        density === "compact" ? "py-1" : "py-2"
      )}
    >
      <div className="text-accent-yellow flex w-8 shrink-0 items-center justify-center">
        {pinned && <Pin className="fill-accent-yellow size-3" />}
      </div>

      <div className="flex flex-1 items-center gap-3">
        <Icon className={cn("size-5", accent)} />
        <span
          className={cn(
            "text-foreground truncate text-sm",
            pinned && "font-medium"
          )}
        >
          {bucket.name}
        </span>
      </div>

      <Cell>{formatBytes(bucket.sizeBytes)}</Cell>
      <Cell>{formatCount(bucket.objectCount)}</Cell>
      <Cell width="w-32">{formatFileTime(bucket.createdAt)}</Cell>

      <div className="row-actions flex w-16 justify-end gap-2 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          aria-label={pinned ? "Unpin bucket" : "Pin bucket"}
          aria-pressed={pinned}
          onClick={(e) => {
            e.stopPropagation();
            onTogglePin?.(bucket.name);
          }}
          className={cn(
            "focus:outline-none",
            pinned
              ? "text-accent-yellow"
              : "text-muted-foreground hover:text-accent-yellow"
          )}
        >
          <Pin className={cn("size-3.5", pinned && "fill-accent-yellow")} />
        </button>
        <button
          type="button"
          aria-label="More actions"
          onClick={(e) => e.stopPropagation()}
          className="text-muted-foreground hover:text-foreground focus:outline-none"
        >
          <MoreHorizontal className="size-4" />
        </button>
      </div>
    </div>
  );
}

function Cell({
  children,
  width = "w-24",
}: {
  children: React.ReactNode;
  width?: string;
}) {
  return (
    <div className={cn("text-muted-foreground text-right font-mono text-xs", width)}>
      {children}
    </div>
  );
}

/**
 * All buckets get the same S3-style cylinder in the brand accent. Color carries
 * no implicit meaning — the pin badge is the only color signal. If we ever
 * want status-driven coloring (e.g. lifecycle policy, region), this is the
 * single place to add it.
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

export type { SortKey as BucketSortKey };
