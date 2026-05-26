import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Full-screen sidebar + main layout for the buckets browser. Dark Catppuccin
 * surface, edge-to-edge. The setup flow keeps its own centered card layout
 * and doesn't use this shell.
 */
export function AppShell({
  sidebar,
  children,
  className,
}: {
  sidebar: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "ctp-scope bg-ctp-base text-ctp-text selection:bg-ctp-mauve/30 flex h-screen w-screen overflow-hidden",
        className
      )}
    >
      {sidebar}
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
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
    <div className="bg-ctp-crust/60 border-ctp-surface0 text-ctp-subtext flex h-7 shrink-0 items-center justify-between border-t px-4 font-mono text-[10px]">
      <div className="flex items-center gap-4">{left}</div>
      <div className="flex items-center gap-4">{right}</div>
    </div>
  );
}
