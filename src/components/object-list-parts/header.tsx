import { Checkbox } from "@/components/ui/checkbox";
import { SortHeader } from "@/components/object-list-parts/sort-header";
import { entryId } from "@/lib/object-path";
import { useSelectionStore } from "@/stores/selection";
import type { ObjectSortKey, SortDirection } from "@/lib/object-sort";
import type { S3Entry } from "@server/types";

/**
 * Header owns its own selection subscription via a tiny enum selector
 * ('all' | 'some' | 'none'). The selector runs for every store change but
 * Object.is bails out of re-renders unless the answer actually flipped — so
 * for typical click sequences (none → some, then staying 'some') the header
 * renders at most twice during a selection session.
 */
export function Header({
  visible,
  pendingIds,
  sortKey,
  sortDir,
  onSortChange,
  onSelectAll,
}: {
  visible: S3Entry[];
  pendingIds: ReadonlySet<string>;
  sortKey: ObjectSortKey;
  sortDir: SortDirection;
  onSortChange: (key: ObjectSortKey) => void;
  onSelectAll: (visible: S3Entry[]) => void;
}) {
  const headerState = useSelectionStore((s) => {
    // Pending rows aren't selectable — exclude them so "all selected" can
    // actually be reached while uploads are in flight.
    const total =
      pendingIds.size === 0
        ? visible.length
        : visible.reduce(
            (n, e) => (pendingIds.has(entryId(e)) ? n : n + 1),
            0
          );
    if (total === 0) return "none" as const;
    let count = 0;
    for (const e of visible) {
      const id = entryId(e);
      if (pendingIds.has(id)) continue;
      if (s.selected.has(id)) count += 1;
    }
    if (count === 0) return "none" as const;
    if (count === total) return "all" as const;
    return "some" as const;
  });

  return (
    <div className="border-border text-foreground bg-input-bg/50 flex shrink-0 border-b px-4 py-2 font-mono text-[10px] uppercase">
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
        className="min-w-0 flex-1"
        active={sortKey === "name"}
        dir={sortDir}
        onClick={() => onSortChange("name")}
      >
        Name
      </SortHeader>
      <SortHeader
        className="w-20 shrink-0 justify-end sm:w-24"
        active={sortKey === "size"}
        dir={sortDir}
        onClick={() => onSortChange("size")}
      >
        Size
      </SortHeader>
      <SortHeader
        className="hidden w-28 shrink-0 justify-start pl-4 sm:flex"
        active={sortKey === "type"}
        dir={sortDir}
        onClick={() => onSortChange("type")}
      >
        Type
      </SortHeader>
      <SortHeader
        className="hidden w-32 shrink-0 justify-end sm:flex"
        active={sortKey === "modified"}
        dir={sortDir}
        onClick={() => onSortChange("modified")}
      >
        Modified
      </SortHeader>
    </div>
  );
}
