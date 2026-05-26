import { create } from "zustand";

/**
 * The single object the preview panel is showing. The list of sibling keys is
 * captured at open time so prev/next can step through the user's current view
 * (sorted + filtered) without the store needing to know about sort/filter.
 *
 * `siblings` is the visible-order list of object keys (folders excluded — they
 * aren't previewable). `openKey` must be in `siblings`; if it isn't, the panel
 * treats it as a single-item view (no prev/next).
 */
interface PreviewState {
  openKey: string | null;
  siblings: string[];
  open: (key: string, siblings: string[]) => void;
  close: () => void;
  next: () => void;
  prev: () => void;
}

export const usePreviewStore = create<PreviewState>((set, get) => ({
  openKey: null,
  siblings: [],
  open: (key, siblings) => set({ openKey: key, siblings }),
  close: () => set({ openKey: null, siblings: [] }),
  next: () => {
    const { openKey, siblings } = get();
    if (!openKey) return;
    const i = siblings.indexOf(openKey);
    if (i === -1 || i === siblings.length - 1) return;
    set({ openKey: siblings[i + 1] });
  },
  prev: () => {
    const { openKey, siblings } = get();
    if (!openKey) return;
    const i = siblings.indexOf(openKey);
    if (i <= 0) return;
    set({ openKey: siblings[i - 1] });
  },
}));
