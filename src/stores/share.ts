import { create } from "zustand";

/**
 * Which object the share dialog is open for. `null` = dialog closed.
 *
 * Lifted into a store (rather than parented under ObjectBrowser) so the
 * preview panel and the toolbar can both trigger it without prop-drilling
 * through the route. The dialog itself is mounted once at the route level.
 */
interface ShareState {
  openKey: string | null;
  open: (key: string) => void;
  close: () => void;
}

export const useShareStore = create<ShareState>((set) => ({
  openKey: null,
  open: (key) => set({ openKey: key }),
  close: () => set({ openKey: null }),
}));
