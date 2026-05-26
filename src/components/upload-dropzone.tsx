import * as React from "react";
import { useDropzone } from "react-dropzone";
import { UploadCloud } from "@/lib/icons";

import { cn } from "@/lib/utils";

/**
 * Wraps the object browser viewport and intercepts file drops anywhere inside.
 * `noClick` keeps stray clicks from opening the OS file picker — uploads
 * triggered by the toolbar's "Upload" button use `openPicker` instead.
 *
 * The returned `openPicker` lets parents trigger the picker programmatically.
 */
export function UploadDropzone({
  prefix,
  onFiles,
  children,
  openRef,
}: {
  /** Display-only — appears in the overlay so users know where files will land. */
  prefix: string;
  onFiles: (files: File[]) => void;
  children: React.ReactNode;
  openRef?: React.MutableRefObject<(() => void) | null>;
}) {
  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop: (accepted) => {
      if (accepted.length > 0) onFiles(accepted);
    },
    noClick: true,
    noKeyboard: true,
    multiple: true,
  });

  React.useEffect(() => {
    if (openRef) openRef.current = open;
    return () => {
      if (openRef) openRef.current = null;
    };
  }, [open, openRef]);

  const root = getRootProps();
  const inputProps = getInputProps();

  return (
    <div {...root} className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      <input {...inputProps} />
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
              Drop files here to upload
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
