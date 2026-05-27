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
  /** Default S3 storage class for new uploads. `undefined` = let the backend
   *  pick (STANDARD on AWS, backend-default elsewhere). The upload-panel
   *  toolbar lets the user override the active session without writing back
   *  to this pref. */
  defaultStorageClass: string | undefined;
  setViewMode: (mode: ViewMode) => void;
  setDensity: (d: RowDensity) => void;
  setDefaultStorageClass: (sc: string | undefined) => void;
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
      defaultStorageClass: undefined,
      setViewMode: (viewMode) => set({ viewMode }),
      setDensity: (density) => set({ density }),
      setDefaultStorageClass: (defaultStorageClass) =>
        set({ defaultStorageClass }),
      patch: (p) => set(p),
    }),
    { name: "cloudshelf.prefs" }
  )
);
