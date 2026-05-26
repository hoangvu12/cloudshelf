import { create } from "zustand";

export type UploadStatus =
  | "queued"
  | "uploading"
  | "paused"
  | "completed"
  | "failed";

export interface UploadItem {
  id: string;
  bucket: string;
  key: string;
  size: number;
  uploaded: number;
  status: UploadStatus;
  error?: string;
  uploadId?: string;
  startedAt: number;
}

interface UploadsState {
  items: UploadItem[];
  add: (item: UploadItem) => void;
  update: (id: string, patch: Partial<UploadItem>) => void;
  remove: (id: string) => void;
  clearCompleted: () => void;
}

export const useUploadsStore = create<UploadsState>((set) => ({
  items: [],
  add: (item) => set((s) => ({ items: [...s.items, item] })),
  update: (id, patch) =>
    set((s) => ({
      items: s.items.map((it) => (it.id === id ? { ...it, ...patch } : it)),
    })),
  remove: (id) =>
    set((s) => ({ items: s.items.filter((it) => it.id !== id) })),
  clearCompleted: () =>
    set((s) => ({ items: s.items.filter((it) => it.status !== "completed") })),
}));
