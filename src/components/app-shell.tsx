import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Full-screen sidebar + main + (optional) preview layout for the buckets
 * browser. Dark Catppuccin surface, edge-to-edge. The setup flow keeps its
 * own centered card layout and doesn't use this shell.
 *
 * `previewPanel` only renders at `lg:` and up. Below that breakpoint the
 * route mounts the preview inside a shadcn Drawer instead, so this slot is
 * intentionally hidden — keeping the panel mounted at sm: would steal width
 * from a list that's already cramped.
 *
 * When `previewPanel` is provided, the aside stays mounted and animates its
 * width via `previewOpen` so opening/closing the preview slides the file
 * list rather than snapping it. The panel itself is responsible for
 * returning null when there's nothing to show.
 */
export function AppShell({
  sidebar,
  children,
  previewPanel,
  previewOpen = false,
  className,
}: {
  sidebar: React.ReactNode;
  children: React.ReactNode;
  previewPanel?: React.ReactNode;
  previewOpen?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "themed-scope bg-background text-foreground selection:bg-accent-mauve/30 flex h-screen w-screen overflow-hidden",
        className
      )}
    >
      {sidebar}
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
      {previewPanel ? (
        <aside
          aria-hidden={!previewOpen}
          className={cn(
            "hidden shrink-0 overflow-hidden lg:flex lg:flex-col",
            "transition-[width,border-color] duration-200 ease-out",
            previewOpen
              ? "border-border w-[380px] border-l xl:w-[440px]"
              : "w-0 border-l border-l-transparent"
          )}
        >
          {previewPanel}
        </aside>
      ) : null}
    </div>
  );
}

/**
 * Slim bottom info bar — item count + size on the left, ⌘K hint on the right.
 * Children render in either slot as a list of fragments.
 */
export function AppStatusBar({
  left,
  right,
}: {
  left?: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="bg-input-bg/60 border-border text-muted-foreground flex h-7 shrink-0 items-center justify-between border-t px-4 font-mono text-[10px]">
      <div className="flex items-center gap-4">{left}</div>
      <div className="flex items-center gap-4">{right}</div>
    </div>
  );
}
