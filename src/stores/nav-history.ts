import { create } from "zustand";

/**
 * In-memory browser-style navigation history for the breadcrumb's back/forward
 * arrows. Tracks the bucket/prefix locations the user has visited in this tab,
 * plus a cursor (`index`) into that list. Not persisted — like the browser's
 * own back stack, it's per-session.
 *
 * Routes call `push(entry)` whenever their location stabilizes. `push` is
 * idempotent and self-correcting:
 *   - same as current entry  → no-op (re-renders don't grow the stack)
 *   - matches entries[index+1] → forward move, just bump the cursor
 *   - matches entries[index-1] → back move, just rewind the cursor
 *   - otherwise → truncate forward history and append (new branch)
 *
 * This means the same `push` handles three sources of navigation uniformly:
 * our own back/forward arrows, the browser's back/forward buttons, and a
 * fresh link click — none of them need to coordinate with each other.
 */
export type NavEntry =
  | { kind: "home" }
  | { kind: "bucket"; bucket: string; prefix: string };

function sameEntry(a: NavEntry, b: NavEntry): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "home") return true;
  const bb = b as Extract<NavEntry, { kind: "bucket" }>;
  return a.bucket === bb.bucket && a.prefix === bb.prefix;
}

interface NavHistoryState {
  entries: NavEntry[];
  index: number;
  push: (entry: NavEntry) => void;
}

export const useNavHistoryStore = create<NavHistoryState>()((set) => ({
  entries: [],
  index: -1,
  push: (entry) =>
    set((state) => {
      const cur = state.entries[state.index];
      if (cur && sameEntry(cur, entry)) return state;
      const next = state.entries[state.index + 1];
      if (next && sameEntry(next, entry)) {
        return { ...state, index: state.index + 1 };
      }
      const prev = state.entries[state.index - 1];
      if (prev && sameEntry(prev, entry)) {
        return { ...state, index: state.index - 1 };
      }
      const kept = state.entries.slice(0, state.index + 1);
      return { entries: [...kept, entry], index: kept.length };
    }),
}));
