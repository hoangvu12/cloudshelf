import { create } from "zustand";

/**
 * Per-tab, non-persisted upload-session overrides. Today this only carries
 * the storage-class override surfaced by the upload-panel toolbar — the user
 * can swap the active class without rewriting their persistent default in
 * `usePrefsStore` (which is shared across tabs via localStorage).
 *
 * `storageClass === undefined` means "no session override; fall back to
 * prefs.defaultStorageClass". `addFiles` in `stores/uploads.ts` resolves the
 * effective class at queue time and locks it onto each file's meta so
 * mid-session changes don't disturb in-flight uploads.
 */
interface UploadSessionState {
  /** Active session storage-class override, or undefined to fall back to
   *  the persistent pref default. */
  storageClass: string | undefined;
  setStorageClass: (sc: string | undefined) => void;
}

export const useUploadSessionStore = create<UploadSessionState>((set) => ({
  storageClass: undefined,
  setStorageClass: (storageClass) => set({ storageClass }),
}));
