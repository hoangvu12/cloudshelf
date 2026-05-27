import * as React from "react";
import { useDropzone, type FileWithPath } from "react-dropzone";
import { UploadCloud } from "@/lib/icons";

import { cn } from "@/lib/utils";

/** One file with the path it should land under, relative to the destination
 *  prefix. For top-level drops `relativePath === file.name`; for folder drops
 *  it preserves the subdirectory chain (e.g. `vacation/img1.jpg`). */
export interface UploadInputFile {
  file: File;
  relativePath: string;
}

/**
 * Wraps the object browser viewport and intercepts file drops anywhere inside.
 * `noClick` keeps stray clicks from opening the OS file picker — uploads
 * triggered by the toolbar's buttons use `openRef` (files) or `openFolderRef`
 * (folder picker) instead.
 *
 * `useFsAccessApi: false` routes drops through file-selector, which recurses
 * dragged folders via `webkitGetAsEntry` and tags each yielded `File` with a
 * `path` field containing its position inside the dropped tree. A separate
 * hidden `<input webkitdirectory>` provides the folder-picker counterpart
 * (the main input can't accept both files and a directory simultaneously).
 */
export function UploadDropzone({
  prefix,
  onFiles,
  children,
  openRef,
  openFolderRef,
}: {
  /** Display-only — appears in the overlay so users know where files will land. */
  prefix: string;
  onFiles: (items: UploadInputFile[]) => void;
  children: React.ReactNode;
  openRef?: React.MutableRefObject<(() => void) | null>;
  openFolderRef?: React.MutableRefObject<(() => void) | null>;
}) {
  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop: (accepted) => {
      if (accepted.length === 0) return;
      onFiles(accepted.map(asInputFile));
    },
    noClick: true,
    noKeyboard: true,
    multiple: true,
    // Route through file-selector instead of the File System Access API so
    // dropped folders get recursed via webkitGetAsEntry. Without this, a
    // folder drop yields zero files on Chromium.
    useFsAccessApi: false,
  });

  const folderInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (openRef) openRef.current = open;
    return () => {
      if (openRef) openRef.current = null;
    };
  }, [open, openRef]);

  React.useEffect(() => {
    if (!openFolderRef) return;
    openFolderRef.current = () => folderInputRef.current?.click();
    return () => {
      openFolderRef.current = null;
    };
  }, [openFolderRef]);

  const handleFolderPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) onFiles(files.map(asInputFile));
    // Reset so picking the same folder again re-fires the change event.
    e.target.value = "";
  };

  const root = getRootProps();
  const inputProps = getInputProps();

  return (
    <div {...root} className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      <input {...inputProps} />
      {/* webkitdirectory/directory aren't in the standard HTMLInputElement
          props; spread them as untyped attrs. */}
      <input
        ref={folderInputRef}
        type="file"
        multiple
        onChange={handleFolderPick}
        className="hidden"
        {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
      />
      {children}

      {isDragActive && (
        <div
          className={cn(
            "pointer-events-none absolute inset-0 z-40 flex items-center justify-center p-6",
            "bg-input-bg/80 backdrop-blur-sm transition-opacity"
          )}
        >
          <div className="border-primary-text bg-primary-text/5 flex h-full w-full flex-col items-center justify-center rounded-xl border-2 border-dashed shadow-[0_0_50px_color-mix(in_oklab,_var(--primary-text)_10%,_transparent)]">
            <div className="bg-primary-text/20 mb-6 flex size-20 animate-bounce-3 items-center justify-center rounded-full">
              <UploadCloud className="text-primary-text size-10" />
            </div>
            <h2 className="text-primary-text mb-2 text-xl font-bold">
              Drop files or folders here to upload
            </h2>
            <p className="text-muted-foreground font-mono text-xs">
              Uploading to: {prefix || "/"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/** Normalize the various sources of "where did this file come from" into a
 *  single relativePath. file-selector's `.path` is leading-slashed; the input
 *  flow uses `webkitRelativePath`; bare drops fall back to `file.name`. */
function asInputFile(file: File): UploadInputFile {
  const withPath = file as FileWithPath & { webkitRelativePath?: string };
  const raw =
    (withPath.webkitRelativePath && withPath.webkitRelativePath.length > 0
      ? withPath.webkitRelativePath
      : withPath.path) ?? file.name;
  const relativePath = raw.replace(/^\/+/, "");
  return { file, relativePath };
}
