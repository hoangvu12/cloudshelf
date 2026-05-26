/**
 * Sort + filter for the object list. Lifted out of the list component so the
 * browser can also use the resulting order (e.g. for shift-click range math —
 * range selection only makes sense against the *visible* order, not the raw
 * server order).
 */

import { entryDisplayName } from "@/lib/object-path";
import { fileAppearance } from "@/lib/file-types";
import type { S3Entry } from "@server/types";

export type ObjectSortKey = "name" | "size" | "type" | "modified";
export type SortDirection = "asc" | "desc";

/**
 * Folders always sort to the top regardless of key — that's the file-manager
 * convention every user already knows. Within folders and within files,
 * `sortKey` + `sortDir` apply normally.
 */
export function sortAndFilterEntries(
  entries: S3Entry[],
  currentPrefix: string,
  filter: string,
  sortKey: ObjectSortKey,
  sortDir: SortDirection
): S3Entry[] {
  const needle = filter.trim().toLowerCase();
  const filtered = needle
    ? entries.filter((e) =>
        entryDisplayName(e, currentPrefix).toLowerCase().includes(needle)
      )
    : entries;

  const folders = filtered.filter((e) => e.type === "prefix");
  const files = filtered.filter((e) => e.type === "object");

  const cmp = comparator(sortKey, currentPrefix);
  folders.sort(cmp);
  files.sort(cmp);

  const orderedFolders = sortDir === "asc" ? folders : folders.reverse();
  const orderedFiles = sortDir === "asc" ? files : files.reverse();

  return [...orderedFolders, ...orderedFiles];
}

function comparator(key: ObjectSortKey, currentPrefix: string) {
  return (a: S3Entry, b: S3Entry) => {
    const aName = entryDisplayName(a, currentPrefix);
    const bName = entryDisplayName(b, currentPrefix);
    switch (key) {
      case "name":
        return aName.localeCompare(bName);
      case "size":
        if (a.type !== "object" || b.type !== "object")
          return aName.localeCompare(bName);
        return a.size - b.size;
      case "type":
        if (a.type !== "object" || b.type !== "object")
          return aName.localeCompare(bName);
        return fileAppearance(aName).label.localeCompare(
          fileAppearance(bName).label
        );
      case "modified":
        if (a.type !== "object" || b.type !== "object")
          return aName.localeCompare(bName);
        return (
          new Date(a.lastModified).getTime() -
          new Date(b.lastModified).getTime()
        );
    }
  };
}
