import * as React from "react";
import {
  Folder,
  FolderArchive,
  FolderCode,
  FolderKanban,
  FolderOpen,
  MoreHorizontal,
  Pin,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { formatBytes, formatCount, formatFileTime } from "@/lib/format";
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

  return (
    <>
      <BucketListHeaders />
      <div className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {pinned.map((b) => (
          <BucketRow
            key={b.name}
            bucket={b}
            pinned
            onTogglePin={onTogglePin}
            onOpen={onOpenBucket}
          />
        ))}
        {pinned.length > 0 && other.length > 0 && (
          <div className="bg-ctp-surface0 mx-2 my-2 h-px" />
        )}
        {other.map((b) => (
          <BucketRow
            key={b.name}
            bucket={b}
            pinned={false}
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
    <div className="border-ctp-surface0 text-ctp-subtext bg-ctp-mantle/30 flex shrink-0 border-b px-4 py-2 text-[11px] font-bold tracking-wider uppercase">
      <div className="w-5 shrink-0" />
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
  onTogglePin,
  onOpen,
}: {
  bucket: Bucket;
  pinned: boolean;
  onTogglePin?: (name: string) => void;
  onOpen?: (name: string) => void;
}) {
  const { Icon, accent, fill } = bucketAppearance(bucket.name, pinned);

  return (
    <div
      onClick={() => onOpen?.(bucket.name)}
      className="group hover:bg-ctp-surface0 flex cursor-pointer items-center rounded-md px-2 py-2 transition-colors"
    >
      <div className="text-ctp-yellow flex w-5 shrink-0 items-center justify-center">
        {pinned && <Pin className="fill-ctp-yellow size-3" />}
      </div>

      <div className="flex flex-1 items-center gap-3">
        <Icon className={cn("size-5", accent, fill)} />
        <span
          className={cn(
            "text-ctp-text truncate text-sm",
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
            "transition-colors focus:outline-none",
            pinned
              ? "text-ctp-yellow"
              : "text-ctp-subtext hover:text-ctp-yellow"
          )}
        >
          <Pin className={cn("size-3.5", pinned && "fill-ctp-yellow")} />
        </button>
        <button
          type="button"
          aria-label="More actions"
          onClick={(e) => e.stopPropagation()}
          className="text-ctp-subtext hover:text-ctp-text focus:outline-none"
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
    <div className={cn("text-ctp-subtext text-right font-mono text-xs", width)}>
      {children}
    </div>
  );
}

/**
 * Picks a folder icon + accent color based on bucket name. Special-cases a few
 * well-known patterns (backups, scratch/code, video, photos), then falls back
 * to a stable hash → palette for everything else so the same bucket always
 * gets the same color across sessions.
 */
const APPEARANCE_FALLBACKS: { Icon: LucideIcon; accent: string; fill: string }[] = [
  { Icon: Folder, accent: "text-ctp-blue", fill: "fill-ctp-blue/20" },
  { Icon: Folder, accent: "text-ctp-mauve", fill: "fill-ctp-mauve/20" },
  { Icon: Folder, accent: "text-ctp-green", fill: "fill-ctp-green/20" },
  { Icon: Folder, accent: "text-ctp-pink", fill: "fill-ctp-pink/20" },
  { Icon: Folder, accent: "text-ctp-yellow", fill: "fill-ctp-yellow/20" },
];

function bucketAppearance(
  name: string,
  pinned: boolean
): { Icon: LucideIcon; accent: string; fill: string } {
  const lower = name.toLowerCase();
  if (lower.includes("backup") || lower.includes("archive"))
    return { Icon: FolderArchive, accent: "text-ctp-pink", fill: "fill-ctp-pink/20" };
  if (lower.includes("video") || lower.includes("media"))
    return { Icon: FolderKanban, accent: "text-ctp-green", fill: "fill-ctp-green/20" };
  if (lower.includes("photo") || lower.includes("image"))
    return pinned
      ? { Icon: FolderOpen, accent: "text-ctp-blue", fill: "fill-ctp-blue/20" }
      : { Icon: Folder, accent: "text-ctp-blue", fill: "fill-ctp-blue/20" };
  if (lower.includes("code") || lower.includes("scratch") || lower.includes("src"))
    return { Icon: FolderCode, accent: "text-ctp-mauve", fill: "fill-ctp-mauve/20" };

  const idx = hash(lower) % APPEARANCE_FALLBACKS.length;
  return APPEARANCE_FALLBACKS[idx]!;
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
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
