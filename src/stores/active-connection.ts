import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Which connection the user is currently browsing. Per-device only —
 * different machines can land on different connections.
 *
 * The list of connections themselves lives on the server (via /api/connections),
 * not in localStorage. This store only holds the *selected id*.
 */
interface ActiveConnectionState {
  activeId: string | null;
  setActive: (id: string | null) => void;
}

export const useActiveConnectionStore = create<ActiveConnectionState>()(
  persist(
    (set) => ({
      activeId: null,
      setActive: (id) => set({ activeId: id }),
    }),
    { name: "cloudshelf.active-connection" }
  )
);
