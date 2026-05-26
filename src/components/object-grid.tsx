import * as React from "react";
import { Loader2 } from "@/lib/icons";
import { folderIconFor } from "@/lib/folder-icons";
import { useVirtualizer } from "@tanstack/react-virtual";

import { cn } from "@/lib/utils";
import { fileAppearance } from "@/lib/file-types";
import { entryDisplayName, entryId } from "@/lib/object-path";
import { ObjectContextMenu } from "@/components/object-context-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { useIsSelected } from "@/stores/selection";
import { usePrefsStore } from "@/stores/prefs";
import type { ContextAction } from "@/components/object-list";
import type { RowClickModifiers } from "@/components/object-row";
import type { S3Entry } from "@server/types";

/**
 * Virtualized grid counterpart to ObjectList. Column count is derived from
 * the live container width (ResizeObserver on the scroll element). Each
 * virtual row is a horizontal slice of `cols` entries; the row virtualizer
 * then only renders the visible row slices plus an overscan band.
 *
 * Tile heights are fixed (per density) so the row virtualizer can use a flat
 * estimateSize without remeasuring — tiles all render at the same size, so
 * variable-height measurement would just add overhead.
 *
 * Load-more uses the same prefetch-on-approach pattern as ObjectList — when
 * the last virtualized row is within PREFETCH_THRESHOLD of the end, fetch
 * the next page. No separate IntersectionObserver sentinel.
 */

/** Tile widths feed the column-count math (auto-fill with a minimum). */
const TILE_MIN_COMFORTABLE = 128;
const TILE_MIN_COMPACT = 96;
/** Tile heights — must match the rendered chrome inside ObjectTile so the
 *  virtualizer's row stride lines up with the visible cell heights. */
const TILE_HEIGHT_COMFORTABLE = 100;
const TILE_HEIGHT_COMPACT = 72;
const GAP = 8;
const OVERSCAN = 4;
const PREFETCH_THRESHOLD = 2;

export function ObjectGrid({
  visible,
  currentPrefix,
  onSelectRow,
  onOpen,
  onContextAction,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
}: {
  visible: S3Entry[];
  currentPrefix: string;
  onSelectRow: (entry: S3Entry, mods: RowClickModifiers) => void;
  onOpen: (entry: S3Entry) => void;
  onContextAction: (entry: S3Entry, action: ContextAction) => void;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
}) {
  const density = usePrefsStore((s) => s.density);
  const compact = density === "compact";
  const tileMin = compact ? TILE_MIN_COMPACT : TILE_MIN_COMFORTABLE;
  const tileHeight = compact ? TILE_HEIGHT_COMPACT : TILE_HEIGHT_COMFORTABLE;
  const rowStride = tileHeight + GAP;

  const parentRef = React.useRef<HTMLDivElement>(null);

  // Live width drives column count. Initialize lazily on first layout so the
  // first render doesn't briefly show a single-column grid before settling.
  const [containerWidth, setContainerWidth] = React.useState(0);
  React.useLayoutEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    setContainerWidth(el.clientWidth - paddingX(el));
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      // contentRect.width excludes padding — exactly what the grid needs.
      setContainerWidth(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const cols = Math.max(
    1,
    Math.floor((containerWidth + GAP) / (tileMin + GAP))
  );
  const rowCount = Math.ceil(visible.length / cols);
  // +1 row for the loading/end sentinel when more pages are coming, same
  // shape as ObjectList.
  const totalRows = hasNextPage ? rowCount + 1 : rowCount;

  const rowVirtualizer = useVirtualizer({
    count: totalRows,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowStride,
    overscan: OVERSCAN,
    // Stable keys per row — row index is fine since the slice contents shift
    // smoothly as `cols` changes, and the inner grid handles per-tile keying.
    getItemKey: (index) => (index >= rowCount ? `__loader_${index}` : index),
  });

  const items = rowVirtualizer.getVirtualItems();

  React.useEffect(() => {
    const last = items[items.length - 1];
    if (!last) return;
    if (
      last.index >= rowCount - PREFETCH_THRESHOLD &&
      hasNextPage &&
      !isFetchingNextPage
    ) {
      onLoadMore();
    }
  }, [items, rowCount, hasNextPage, isFetchingNextPage, onLoadMore]);

  return (
    <div ref={parentRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {items.map((virtualRow) => {
          const isLoaderRow = virtualRow.index >= rowCount;
          const wrapperStyle: React.CSSProperties = {
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: `${virtualRow.size}px`,
            transform: `translateY(${virtualRow.start}px)`,
          };

          if (isLoaderRow) {
            return (
              <div key={virtualRow.key} style={wrapperStyle}>
                <LoaderRow loading={isFetchingNextPage} />
              </div>
            );
          }

          const rowStart = virtualRow.index * cols;
          const rowSlice = visible.slice(rowStart, rowStart + cols);

          return (
            <div key={virtualRow.key} style={wrapperStyle}>
              <div
                className="grid"
                style={{
                  gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                  gap: `${GAP}px`,
                  height: `${tileHeight}px`,
                }}
              >
                {rowSlice.map((entry) => (
                  <ObjectContextMenu
                    key={entryId(entry)}
                    entry={entry}
                    onAction={onContextAction}
                  >
                    <ObjectTile
                      entry={entry}
                      currentPrefix={currentPrefix}
                      compact={compact}
                      onSelectRow={onSelectRow}
                      onOpen={onOpen}
                    />
                  </ObjectContextMenu>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function paddingX(el: HTMLElement): number {
  const cs = window.getComputedStyle(el);
  return parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
}

function LoaderRow({ loading }: { loading: boolean }) {
  return (
    <div className="text-ctp-subtext flex h-full items-center justify-center gap-2 font-mono text-[11px]">
      {loading ? (
        <>
          <Loader2 className="text-ctp-mauve size-3.5 animate-spin" />
          Loading more...
        </>
      ) : (
        <span className="text-ctp-subtext">scroll to load more</span>
      )}
    </div>
  );
}

function ObjectTileImpl({
  entry,
  currentPrefix,
  compact,
  onSelectRow,
  onOpen,
}: {
  entry: S3Entry;
  currentPrefix: string;
  compact: boolean;
  onSelectRow: (entry: S3Entry, mods: RowClickModifiers) => void;
  onOpen: (entry: S3Entry) => void;
}) {
  const id = entryId(entry);
  const selected = useIsSelected(id);

  const isFolder = entry.type === "prefix";
  const display = entryDisplayName(entry, currentPrefix);
  // Folder icons come from Material Icon Theme (colored per folder type), so
  // no Tailwind color class is needed. Files keep their per-extension accent.
  const { Icon, color } = isFolder
    ? { Icon: folderIconFor(display.replace(/\/$/, "")), color: "" }
    : fileAppearance(display);

  const handleClick = (e: React.MouseEvent) => {
    const mods = { shift: e.shiftKey, meta: e.metaKey || e.ctrlKey };
    // Same shape as ObjectRow: folder + plain click navigates; everything
    // else routes through selection.
    if (isFolder && !mods.shift && !mods.meta) {
      onOpen(entry);
      return;
    }
    onSelectRow(entry, mods);
  };

  return (
    <div
      onClick={handleClick}
      className={cn(
        "group border-ctp-surface0 bg-ctp-mantle/40 hover:border-ctp-surface1 hover:bg-ctp-surface0/50 relative flex h-full cursor-pointer flex-col items-center rounded-lg border text-center select-none",
        compact ? "gap-1.5 p-2" : "gap-2 p-3",
        selected &&
          "border-ctp-mauve/60 bg-ctp-surface0 hover:border-ctp-mauve/60"
      )}
    >
      <div
        className="absolute top-1.5 left-1.5 z-10 opacity-0 transition-opacity group-hover:opacity-100 data-[selected=true]:opacity-100"
        data-selected={selected}
        onClick={(e) => e.stopPropagation()}
      >
        <Checkbox
          checked={selected}
          onCheckedChange={() =>
            onSelectRow(entry, { shift: false, meta: true })
          }
          aria-label={`Select ${display}`}
        />
      </div>

      <Icon className={cn(color, compact ? "size-8" : "size-12")} />
      <div
        className={cn(
          "text-ctp-text w-full truncate text-center",
          compact ? "text-[11px]" : "text-xs",
          selected && "font-medium"
        )}
        title={display}
      >
        {display}
      </div>
    </div>
  );
}

export const ObjectTile = React.memo(ObjectTileImpl);
