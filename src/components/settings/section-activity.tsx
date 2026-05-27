import * as React from "react";
import { Link } from "@tanstack/react-router";
import { useVirtualizer } from "@tanstack/react-virtual";
import { toast } from "sonner";
import { useActivity, useClearActivity } from "@/lib/api/activity";
import { cn } from "@/lib/utils";
import type { ActivityEntry } from "@server/types";

// ─── Section: Activity ─────────────────────────────────────────────────
// Single-user audit trail of write actions, populated server-side via
// logActivity() in server/routes/connections.ts. Read-only here — the only
// mutation is "clear all", which empties the SQLite `activity` table.

const ACTIVITY_PAGE_SIZE = 50;
const ACTIVITY_ROW_HEIGHT = 64;

type ActivityTone = "default" | "destructive" | "success" | "info" | "warn";

const ACTIVITY_TONE: Record<ActivityTone, string> = {
  default: "border-surface-1 bg-muted text-muted-foreground",
  destructive: "border-destructive/30 bg-destructive/15 text-destructive",
  success: "border-accent-green/30 bg-accent-green/15 text-accent-green",
  info: "border-accent-blue/30 bg-accent-blue/15 text-accent-blue",
  warn: "border-accent-peach/30 bg-accent-peach/15 text-accent-peach",
};

function describeKind(kind: string): { verb: string; tone: ActivityTone } {
  switch (kind) {
    case "upload":
      return { verb: "Uploaded file", tone: "success" };
    case "presign-upload":
      return { verb: "Started upload", tone: "info" };
    case "upload-abort":
      return { verb: "Aborted upload", tone: "warn" };
    case "upload-from-url":
      return { verb: "Imported from URL", tone: "success" };
    case "delete":
      return { verb: "Deleted file", tone: "destructive" };
    case "delete-bulk":
      return { verb: "Bulk-deleted files", tone: "destructive" };
    case "rename":
      return { verb: "Renamed file", tone: "info" };
    case "copy":
      return { verb: "Copied / moved file", tone: "info" };
    case "folder-create":
      return { verb: "Created folder", tone: "info" };
    case "bucket-create":
      return { verb: "Created bucket", tone: "info" };
    case "tags-update":
      return { verb: "Updated tags", tone: "default" };
    case "metadata-update":
      return { verb: "Updated metadata", tone: "default" };
    case "versioning-set":
      return { verb: "Changed versioning", tone: "warn" };
    case "version-restore":
      return { verb: "Restored version", tone: "info" };
    case "version-delete":
      return { verb: "Deleted version", tone: "destructive" };
    default:
      return { verb: kind, tone: "default" };
  }
}

/**
 * Build the scope line for a row. Returns:
 *   - `text` — human-readable "bucket/key" string for display.
 *   - `linkTo` — splat path to the prefix where the action happened, used by
 *     the inline "open" link. Null when there's no useful target (e.g. the
 *     entire bucket is gone, or the row has no bucket).
 */
function formatScope(entry: ActivityEntry): {
  text: string;
  linkTo: string | null;
} {
  if (!entry.bucket) {
    return { text: "—", linkTo: null };
  }
  if (!entry.key) {
    return { text: entry.bucket, linkTo: "" };
  }
  // Link to the parent prefix of the affected key — the file itself may no
  // longer exist (delete/rename), but the prefix usually does.
  const prefix = entry.key.replace(/[^/]+\/?$/, "");
  return {
    text: `${entry.bucket}/${entry.key}`,
    linkTo: prefix,
  };
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const now = Date.now();
  const diff = now - date.getTime();
  // Relative-ish formatting: very recent rows surface "Xm ago" so the page
  // reads as a live tail; older rows fall back to absolute timestamps.
  if (diff < 60_000) return "just now";
  if (diff < 60 * 60_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 24 * 60 * 60_000) return `${Math.floor(diff / (60 * 60_000))}h ago`;
  return date.toLocaleString();
}

function ActivityRow({ entry }: { entry: ActivityEntry }) {
  const { verb, tone } = describeKind(entry.kind);
  const scope = formatScope(entry);
  return (
    <div className="border-border/50 hover:bg-muted/20 flex items-start justify-between gap-3 border-b px-4 py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "rounded border px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-widest uppercase",
              ACTIVITY_TONE[tone]
            )}
          >
            {entry.kind}
          </span>
          <span className="text-foreground truncate text-sm">{verb}</span>
        </div>
        <div className="text-muted-foreground mt-1 truncate font-mono text-[11px]">
          {scope.text}
          {scope.linkTo && entry.bucket && (
            <>
              {" — "}
              <Link
                to="/buckets/$bucketName/$"
                params={{
                  bucketName: entry.bucket,
                  _splat: scope.linkTo,
                }}
                className="text-accent-blue hover:underline"
              >
                open
              </Link>
            </>
          )}
        </div>
      </div>
      <div className="text-muted-foreground shrink-0 font-mono text-[10px]">
        {formatTimestamp(entry.ts)}
      </div>
    </div>
  );
}

export function ActivitySection() {
  const activityQuery = useActivity(ACTIVITY_PAGE_SIZE);
  const clearActivity = useClearActivity();

  const rows: ActivityEntry[] = React.useMemo(
    () => activityQuery.data?.pages.flatMap((p) => p.rows) ?? [],
    [activityQuery.data]
  );
  const total = activityQuery.data?.pages[0]?.total ?? 0;

  const hasNextPage = !!activityQuery.hasNextPage;
  const isFetchingNext = activityQuery.isFetchingNextPage;

  // +1 slot for the loading sentinel that drives infinite-scroll fetching.
  const count = hasNextPage ? rows.length + 1 : rows.length;

  const parentRef = React.useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ACTIVITY_ROW_HEIGHT,
    overscan: 8,
    getItemKey: (i) => rows[i]?.id ?? `__sentinel_${i}`,
  });

  // When the loader sentinel scrolls into view, kick off the next page. Mirrors
  // the object-list infinite-scroll pattern (see object-list.tsx) — no extra
  // intersection observer needed because the virtualizer already tells us
  // which rows are rendered.
  const virtualItems = virtualizer.getVirtualItems();
  React.useEffect(() => {
    const last = virtualItems[virtualItems.length - 1];
    if (!last) return;
    if (last.index >= rows.length && hasNextPage && !isFetchingNext) {
      activityQuery.fetchNextPage();
    }
  }, [virtualItems, rows.length, hasNextPage, isFetchingNext, activityQuery]);

  const onClear = () => {
    const ok = window.confirm(
      "Clear the activity log? This permanently removes every recorded action."
    );
    if (!ok) return;
    clearActivity.mutate(undefined, {
      onSuccess: (r) => {
        toast.success(`Cleared ${r.removed.toLocaleString()} entries`);
      },
      onError: (e) => toast.error(e.message),
    });
  };

  return (
    <div className="space-y-4">
      <div className="border-border flex items-center justify-between border-b pb-2">
        <h2 className="text-primary-text font-mono text-[10px] font-bold tracking-widest uppercase">
          Activity log
        </h2>
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground font-mono text-[11px]">
            {total.toLocaleString()} {total === 1 ? "entry" : "entries"}
          </span>
          <button
            type="button"
            onClick={onClear}
            disabled={total === 0 || clearActivity.isPending}
            className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded border border-transparent px-2 py-1 font-mono text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-40"
          >
            Clear log
          </button>
        </div>
      </div>

      {activityQuery.isLoading && (
        <div className="text-muted-foreground bg-card/40 border-border rounded-lg border border-dashed p-10 text-center font-mono text-xs">
          Loading…
        </div>
      )}

      {activityQuery.isError && !activityQuery.isLoading && (
        <div className="border-destructive/30 bg-destructive/5 text-destructive rounded-lg border p-5 font-mono text-xs">
          Couldn't load activity: {activityQuery.error.message}
        </div>
      )}

      {!activityQuery.isLoading && !activityQuery.isError && rows.length === 0 && (
        <div className="border-border text-muted-foreground rounded-lg border border-dashed p-10 text-center text-sm">
          No activity yet. Upload, rename, or delete a file to see it here.
        </div>
      )}

      {rows.length > 0 && (
        <div
          ref={parentRef}
          className="bg-card/50 border-border max-h-[60vh] overflow-y-auto rounded-lg border"
        >
          <div
            style={{
              height: virtualizer.getTotalSize(),
              position: "relative",
            }}
          >
            {virtualItems.map((vi) => {
              const isSentinel = vi.index >= rows.length;
              const row = rows[vi.index];
              return (
                <div
                  key={vi.key}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    height: vi.size,
                    transform: `translateY(${vi.start}px)`,
                  }}
                >
                  {isSentinel ? (
                    <div className="text-muted-foreground flex h-full items-center justify-center font-mono text-[11px]">
                      {isFetchingNext ? "Loading more…" : ""}
                    </div>
                  ) : row ? (
                    <ActivityRow entry={row} />
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
