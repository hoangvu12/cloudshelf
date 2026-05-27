import { create } from "zustand";

/**
 * Which connection the CLI-snippets dialog is open for. `null` = dialog closed.
 *
 * Lifted into a store so the sidebar connection switcher and the Settings
 * Profiles list can both trigger it without prop-drilling. The dialog itself
 * is mounted once at the root route.
 */
interface SnippetsState {
  openConnectionId: string | null;
  open: (id: string) => void;
  close: () => void;
}

export const useSnippetsStore = create<SnippetsState>((set) => ({
  openConnectionId: null,
  open: (id) => set({ openConnectionId: id }),
  close: () => set({ openConnectionId: null }),
}));
