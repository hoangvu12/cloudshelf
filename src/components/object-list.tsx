import * as React from "react";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";

import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { ObjectRow, type RowClickModifiers } from "@/components/object-row";
import { ObjectContextMenu } from "@/components/object-context-menu";
import { entryId } from "@/lib/object-path";
import { useSelectionStore } from "@/stores/selection";
import { usePrefsStore } from "@/stores/prefs";
import type { ObjectSortKey, SortDirection } from "@/lib/object-sort";
import type { S3Entry } from "@server/types";

export type ContextAction =
  | "preview"
  | "download"
  | "open-new-tab"
  | "copy-link"
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
    <>
      <Header
        visible={visible}
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
                <ObjectContextMenu entry={entry} onAction={onContextAction}>
                  <ObjectRow
                    entry={entry}
                    currentPrefix={currentPrefix}
                    compact={density === "compact"}
                    onSelectRow={onSelectRow}
                    onOpen={onOpen}
                  />
                </ObjectContextMenu>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

export const ObjectList = React.memo(ObjectListImpl);

function LoaderRow({ loading }: { loading: boolean }) {
  return (
    <div className="text-ctp-subtext flex h-full items-center justify-center gap-2 font-mono text-[11px]">
      {loading ? (
        <>
          <Loader2 className="text-ctp-mauve size-3.5 animate-spin" />
          Loading more...
        </>
      ) : (
        <span className="text-ctp-surface1">scroll to load more</span>
      )}
    </div>
  );
}

/**
 * Header owns its own selection subscription via a tiny enum selector
 * ('all' | 'some' | 'none'). The selector runs for every store change but
 * Object.is bails out of re-renders unless the answer actually flipped — so
 * for typical click sequences (none → some, then staying 'some') the header
 * renders at most twice during a selection session.
 */
function Header({
  visible,
  sortKey,
  sortDir,
  onSortChange,
  onSelectAll,
}: {
  visible: S3Entry[];
  sortKey: ObjectSortKey;
  sortDir: SortDirection;
  onSortChange: (key: ObjectSortKey) => void;
  onSelectAll: (visible: S3Entry[]) => void;
}) {
  const headerState = useSelectionStore((s) => {
    if (visible.length === 0) return "none" as const;
    let count = 0;
    for (const e of visible) if (s.selected.has(entryId(e))) count += 1;
    if (count === 0) return "none" as const;
    if (count === visible.length) return "all" as const;
    return "some" as const;
  });

  return (
    <div className="border-ctp-surface0 text-ctp-subtext bg-ctp-crust/50 flex shrink-0 border-b px-4 py-2 font-mono text-[10px] uppercase">
      <div className="flex w-8 shrink-0 items-center justify-center">
        <Checkbox
          checked={
            headerState === "all"
              ? true
              : headerState === "some"
                ? "indeterminate"
                : false
          }
          onCheckedChange={() => onSelectAll(visible)}
          aria-label="Select all"
        />
      </div>
      <SortHeader
        className="flex-1"
        active={sortKey === "name"}
        dir={sortDir}
        onClick={() => onSortChange("name")}
      >
        Name
      </SortHeader>
      <SortHeader
        className="w-24 justify-end"
        active={sortKey === "size"}
        dir={sortDir}
        onClick={() => onSortChange("size")}
      >
        Size
      </SortHeader>
      <SortHeader
        className="w-28 justify-start pl-4"
        active={sortKey === "type"}
        dir={sortDir}
        onClick={() => onSortChange("type")}
      >
        Type
      </SortHeader>
      <SortHeader
        className="w-32 justify-end"
        active={sortKey === "modified"}
        dir={sortDir}
        onClick={() => onSortChange("modified")}
      >
        Modified
      </SortHeader>
    </div>
  );
}

function SortHeader({
  active,
  dir,
  onClick,
  className,
  children,
}: {
  active: boolean;
  dir: SortDirection;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "hover:text-ctp-text flex cursor-pointer items-center gap-1 focus:outline-none",
        active && "text-ctp-text",
        className
      )}
    >
      {children}
      {active &&
        (dir === "asc" ? (
          <ChevronUp className="size-3" />
        ) : (
          <ChevronDown className="size-3" />
        ))}
    </button>
  );
}
