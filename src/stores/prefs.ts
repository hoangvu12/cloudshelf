import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ViewMode = "list" | "grid";
export type RowDensity = "comfortable" | "compact";

interface PrefsState {
  viewMode: ViewMode;
  density: RowDensity;
  multipartPartSize: number;
  concurrentUploads: number;
  concurrentParts: number;
  overwriteWarning: boolean;
  resumeOnReload: boolean;
  compressImages: boolean;
  setViewMode: (mode: ViewMode) => void;
  setDensity: (d: RowDensity) => void;
  patch: (p: Partial<PrefsState>) => void;
}

export const usePrefsStore = create<PrefsState>()(
  persist(
    (set) => ({
      viewMode: "list",
      density: "comfortable",
      multipartPartSize: 16 * 1024 * 1024,
      concurrentUploads: 4,
      concurrentParts: 4,
      overwriteWarning: true,
      resumeOnReload: true,
      compressImages: false,
      setViewMode: (viewMode) => set({ viewMode }),
      setDensity: (density) => set({ density }),
      patch: (p) => set(p),
    }),
    { name: "cloudshelf.prefs" }
  )
);
