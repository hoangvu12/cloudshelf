import * as React from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

import { ObjectRow, type RowClickModifiers } from "@/components/object-row";
import { ObjectListContextMenu } from "@/components/object-context-menu";
import { Header } from "@/components/object-list-parts/header";
import { LoaderRow } from "@/components/object-list-parts/loader-row";
import { entryId } from "@/lib/object-path";
import { usePrefsStore } from "@/stores/prefs";
import type { ObjectSortKey, SortDirection } from "@/lib/object-sort";
import type { S3Entry } from "@server/types";

export type ContextAction =
  | "preview"
  | "download"
  | "download-zip"
  | "open-new-tab"
  | "copy-link"
  | "share"
  | "rename"
  | "move"
  | "copy-to"
  | "delete";

/** Row heights — must match the rendered chrome in ObjectRow so the
 *  virtualizer doesn't double-up or gap between rows. */
const ROW_HEIGHT_COMFORTABLE = 36;
const ROW_HEIGHT_COMPACT = 28;
/**
 * Pre-render this many rows above/below the viewport. Higher = no blank rows
 * during fast scroll, at the cost of more mounted DOM. Rows are simple (icon
 * + text + a few cells, no images), so 30 is well within the budget where
 * scroll smoothness wins over render cost.
 */
const OVERSCAN = 30;
/**
 * Trigger the next-page fetch a few rows before the very end so a quick scroll
 * doesn't jolt into the loading sentinel.
 */
const PREFETCH_THRESHOLD = 5;

/**
 * Virtualized object list. Pure renderer — does NOT take `selectedIds` as a
 * prop. Selection state is read at the leaves (each row via `useIsSelected`,
 * the header via its own subscription, the context menu inside its open Content)
 * so this component can be `React.memo`'d and bail out of the parent's
 * re-renders that are triggered by selection-only changes. That's what keeps
 * the click-to-checkbox latency in the single-row render budget rather than
 * cascading through 30+ wrappers.
 */
function ObjectListImpl({
  visible,
  currentPrefix,
  connectionId,
  bucket,
  pendingIds,
  sortKey,
  sortDir,
  onSortChange,
  onSelectRow,
  onSelectAll,
  onOpen,
  onContextAction,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
}: {
  visible: S3Entry[];
  currentPrefix: string;
  connectionId: string;
  bucket: string;
  pendingIds: ReadonlySet<string>;
  sortKey: ObjectSortKey;
  sortDir: SortDirection;
  onSortChange: (key: ObjectSortKey) => void;
  onSelectRow: (entry: S3Entry, mods: RowClickModifiers) => void;
  onSelectAll: (entries: S3Entry[]) => void;
  onOpen: (entry: S3Entry) => void;
  onContextAction: (entry: S3Entry, action: ContextAction) => void;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
}) {
  const parentRef = React.useRef<HTMLDivElement>(null);
  const density = usePrefsStore((s) => s.density);
  const rowHeight =
    density === "compact" ? ROW_HEIGHT_COMPACT : ROW_HEIGHT_COMFORTABLE;

  // +1 slot for the loading/end sentinel when more pages are coming.
  const count = hasNextPage ? visible.length + 1 : visible.length;

  const rowVirtualizer = useVirtualizer({
    count,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: OVERSCAN,
    // Stable per-item keys keep reconciliation correct when the infinite
    // query appends a new page mid-scroll — without this, React can reuse a
    // DOM node for a different entry and flash the wrong row.
    getItemKey: (index) => {
      const entry = visible[index];
      return entry ? entryId(entry) : `__loader_${index}`;
    },
  });

  // Prefetch the next page as soon as the bottom-most virtual row is near the
  // tail of the loaded list. Dependency on getVirtualItems() forces re-eval
  // every time the user scrolls — cheap because the body is a no-op when the
  // threshold isn't met.
  const items = rowVirtualizer.getVirtualItems();
  React.useEffect(() => {
    const last = items[items.length - 1];
    if (!last) return;
    if (
      last.index >= visible.length - PREFETCH_THRESHOLD &&
      hasNextPage &&
      !isFetchingNextPage
    ) {
      onLoadMore();
    }
  }, [items, visible.length, hasNextPage, isFetchingNextPage, onLoadMore]);

  return (
    <ObjectListContextMenu visible={visible} onAction={onContextAction}>
      <Header
        visible={visible}
        pendingIds={pendingIds}
        sortKey={sortKey}
        sortDir={sortDir}
        onSortChange={onSortChange}
        onSelectAll={onSelectAll}
      />
      <div
        ref={parentRef}
        className="min-h-0 flex-1 overflow-y-auto p-2"
      >
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {items.map((virtualRow) => {
            const isLoaderRow = virtualRow.index >= visible.length;
            const wrapperStyle: React.CSSProperties = {
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
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

            const entry = visible[virtualRow.index]!;
            return (
              <div key={virtualRow.key} style={wrapperStyle}>
                <ObjectRow
                  entry={entry}
                  currentPrefix={currentPrefix}
                  connectionId={connectionId}
                  bucket={bucket}
                  isPending={pendingIds.has(entryId(entry))}
                  compact={density === "compact"}
                  onSelectRow={onSelectRow}
                  onOpen={onOpen}
                />
              </div>
            );
          })}
        </div>
      </div>
    </ObjectListContextMenu>
  );
}

export const ObjectList = React.memo(ObjectListImpl);

