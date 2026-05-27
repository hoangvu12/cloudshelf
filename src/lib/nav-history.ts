import * as React from "react";
import { useNavigate } from "@tanstack/react-router";

import { trimTrailingSlash } from "@/lib/object-path";
import { useNavHistoryStore, type NavEntry } from "@/stores/nav-history";

/**
 * Register the current route as a history entry. Call from each route on every
 * render — `push` dedups, so an effect dep on the flattened entry string is
 * enough to skip work when nothing meaningful changed.
 */
export function useTrackNavEntry(entry: NavEntry) {
  const push = useNavHistoryStore((s) => s.push);
  const key =
    entry.kind === "home" ? "home" : `bucket:${entry.bucket}:${entry.prefix}`;
  // Hold the latest entry in a ref so the effect can read it without taking
  // a render-identity dep — push() dedups by `key`, so we only need to trigger
  // when the flattened key actually changes.
  const entryRef = React.useRef(entry);
  entryRef.current = entry;
  React.useEffect(() => {
    push(entryRef.current);
  }, [key, push]);
}

/**
 * Back/forward controls for the breadcrumb. Reads the cursor + neighbours from
 * the store and turns them into route navigations. `canBack`/`canForward` are
 * derived so the buttons re-render when the cursor moves.
 */
export function useNavHistory() {
  const navigate = useNavigate();
  const index = useNavHistoryStore((s) => s.index);
  const entries = useNavHistoryStore((s) => s.entries);

  const back = React.useCallback(() => {
    const target = entries[index - 1];
    if (target) goTo(target, navigate);
  }, [entries, index, navigate]);

  const forward = React.useCallback(() => {
    const target = entries[index + 1];
    if (target) goTo(target, navigate);
  }, [entries, index, navigate]);

  return {
    canBack: index > 0,
    canForward: index >= 0 && index < entries.length - 1,
    back,
    forward,
  };
}

function goTo(entry: NavEntry, navigate: ReturnType<typeof useNavigate>) {
  if (entry.kind === "home") {
    navigate({ to: "/" });
    return;
  }
  navigate({
    to: "/buckets/$bucketName/$",
    params: { bucketName: entry.bucket, _splat: trimTrailingSlash(entry.prefix) },
  });
}
