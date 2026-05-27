import { create } from "zustand";

interface SelectionState {
  selected: Set<string>;
  toggle: (key: string) => void;
  setMany: (keys: string[]) => void;
  clear: () => void;
}

export const useSelectionStore = create<SelectionState>((set) => ({
  selected: new Set(),
  toggle: (key) =>
    set((s) => {
      const next = new Set(s.selected);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return { selected: next };
    }),
  setMany: (keys) => set({ selected: new Set(keys) }),
  clear: () => set({ selected: new Set() }),
}));

/**
 * Per-row selection subscription. Each row subscribes to its own boolean
 * instead of receiving the whole Set as a prop, so a selection change only
 * re-renders the rows whose bit actually flipped — not all visible rows.
 * Zustand bails out via Object.is when the selector result is unchanged.
 */
export function useIsSelected(id: string): boolean {
  return useSelectionStore((s) => s.selected.has(id));
}

/**
 * "Selection mode" flag — true when at least one row is selected. Rows
 * subscribe to this so a plain click can switch from activate (open file /
 * navigate folder) to toggle-select. Returning a boolean means Object.is
 * bails out except on the 0↔non-zero transition, so rows only re-render
 * when the mode actually flips.
 */
export function useHasSelection(): boolean {
  return useSelectionStore((s) => s.selected.size > 0);
}
