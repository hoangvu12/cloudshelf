import * as React from "react";

import { entryId } from "@/lib/object-path";
import {
  sortAndFilterEntries,
  type ObjectSortKey,
  type SortDirection,
} from "@/lib/object-sort";
import { useObjects } from "@/lib/api/objects";
import { usePendingEntriesForPrefix } from "@/stores/uploads";
import type { S3Entry } from "@server/types";

/** Shared empty Set so the pendingIds memo can return a stable identity
 *  on the common (no-uploads-in-flight) path — keeps memoized consumers
 *  from re-running. */
const EMPTY_PENDING_IDS: ReadonlySet<string> = new Set();

/**
 * Derives the entry lists, pending decoration set, sorted/filtered "visible"
 * view, and the selectedEntries lookup. Pure derivation from the inputs —
 * no side effects, no event wiring.
 */
export function useObjectBrowserData(args: {
  connectionId: string;
  bucket: string;
  prefix: string;
  selectedIds: ReadonlySet<string>;
  sortKey: ObjectSortKey;
  sortDir: SortDirection;
  filter: string;
}) {
  const { connectionId, bucket, prefix, selectedIds, sortKey, sortDir, filter } = args;
  const query = useObjects(connectionId, bucket, prefix);

  // Flatten infinite-query pages into one list. Pages are appended in order,
  // and S3 returns lexicographic key order, so the result is stable.
  const entries: S3Entry[] = React.useMemo(
    () => query.data?.pages.flatMap((p) => p.entries) ?? [],
    [query.data]
  );

  // Synthetic entries for in-flight uploads so the user sees their files
  // appear in the list immediately, before the post-upload listener
  // invalidates the query. Real S3 entries always win on dedupe — when the
  // refetch lands, the synthetic row falls away cleanly.
  const pendingFromUploads = usePendingEntriesForPrefix(
    connectionId,
    bucket,
    prefix
  );

  const mergedEntries = React.useMemo<S3Entry[]>(() => {
    if (
      pendingFromUploads.files.length === 0 &&
      pendingFromUploads.folders.length === 0
    ) {
      return entries;
    }
    const existingKeys = new Set<string>();
    const existingPrefixes = new Set<string>();
    for (const e of entries) {
      if (e.type === "object") existingKeys.add(e.key);
      else existingPrefixes.add(e.prefix);
    }
    const result: S3Entry[] = [...entries];
    for (const f of pendingFromUploads.files) {
      if (!existingKeys.has(f.key)) result.push(f);
    }
    for (const d of pendingFromUploads.folders) {
      if (!existingPrefixes.has(d.prefix)) result.push(d);
    }
    return result;
  }, [entries, pendingFromUploads]);

  // entryIds that should render with the pending decoration. Files always
  // get it (so an in-flight overwrite shows progress on the existing row).
  // Folders only get it when synthetic — a real folder that happens to
  // contain pending children stays unadorned.
  const pendingIds = React.useMemo<ReadonlySet<string>>(() => {
    if (
      pendingFromUploads.files.length === 0 &&
      pendingFromUploads.folders.length === 0
    ) {
      return EMPTY_PENDING_IDS;
    }
    const existingPrefixes = new Set<string>();
    for (const e of entries) {
      if (e.type === "prefix") existingPrefixes.add(e.prefix);
    }
    const s = new Set<string>();
    for (const f of pendingFromUploads.files) s.add(f.key);
    for (const d of pendingFromUploads.folders) {
      if (!existingPrefixes.has(d.prefix)) s.add(d.prefix);
    }
    return s;
  }, [pendingFromUploads, entries]);

  const visible = React.useMemo(
    () => sortAndFilterEntries(mergedEntries, prefix, filter, sortKey, sortDir),
    [mergedEntries, prefix, filter, sortKey, sortDir]
  );

  const entryById = React.useMemo(() => {
    const m = new Map<string, S3Entry>();
    for (const e of entries) m.set(entryId(e), e);
    return m;
  }, [entries]);

  const selectedEntries = React.useMemo(
    () =>
      Array.from(selectedIds)
        .map((id) => entryById.get(id))
        .filter((e): e is S3Entry => !!e),
    [selectedIds, entryById]
  );

  const totalBytes = entries.reduce(
    (sum, e) => sum + (e.type === "object" ? e.size : 0),
    0
  );

  return {
    query,
    entries,
    mergedEntries,
    pendingIds,
    visible,
    selectedEntries,
    totalBytes,
  };
}
