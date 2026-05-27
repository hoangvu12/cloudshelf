import * as React from "react";
import {
  Database,
  MoreHorizontal,
  Pin,
  type LucideIcon,
} from "@/lib/icons";

import { cn } from "@/lib/utils";
import { formatFileTime } from "@/lib/format";
import { usePrefsStore } from "@/stores/prefs";
import type { Bucket } from "@server/types";

type SortKey = "name" | "created";

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
      <div className="min-w-0 flex-1">Name</div>
      <div className="hidden w-32 text-right sm:block">Modified</div>
      <div className="hidden w-16 sm:block" />
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

  // Track toggle to fire a brief scale-pop on the pin icons. The animation key
  // changes on every flip after initial mount so the CSS animation re-runs.
  const [popKey, setPopKey] = React.useState(0);
  const prevPinned = React.useRef(pinned);
  React.useEffect(() => {
    if (prevPinned.current === pinned) return;
    prevPinned.current = pinned;
    setPopKey((k) => k + 1);
  }, [pinned]);
  const popClass = popKey > 0 ? "animate-scale-pop" : "";

  return (
    <div
      onClick={() => onOpen?.(bucket.name)}
      className={cn(
        "group hover:bg-muted flex cursor-pointer items-center rounded-md px-2",
        density === "compact" ? "py-1" : "py-2"
      )}
    >
      <div className="text-accent-yellow flex w-8 shrink-0 items-center justify-center">
        {pinned && (
          <Pin key={popKey} className={cn("fill-accent-yellow size-3", popClass)} />
        )}
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Icon className={cn("size-5 shrink-0", accent)} />
        <span
          className={cn(
            "text-foreground truncate text-sm",
            pinned && "font-medium"
          )}
        >
          {bucket.name}
        </span>
      </div>

      <Cell width="w-32" className="hidden sm:block">
        {formatFileTime(bucket.createdAt)}
      </Cell>

      <div className="row-actions hidden w-16 justify-end gap-2 opacity-0 transition-opacity group-hover:opacity-100 sm:flex">
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
          <Pin
            key={popKey}
            className={cn("size-3.5", pinned && "fill-accent-yellow", popClass)}
          />
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
  className,
}: {
  children: React.ReactNode;
  width?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "text-muted-foreground shrink-0 truncate text-right font-mono text-xs whitespace-nowrap",
        width,
        className
      )}
    >
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
      case "created":
        return (
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
    }
  };
}

export type { SortKey as BucketSortKey };
