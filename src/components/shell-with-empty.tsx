import * as React from "react";

import { AppShell } from "@/components/app-shell";
import { AppSidebar } from "@/components/app-sidebar";

/** Bare shell used for the pre-connection states (loading / API down / no conn). */
export function ShellWithEmpty({ children }: { children?: React.ReactNode }) {
  return (
    <AppShell
      sidebar={<AppSidebar connections={[]} activeConnection={null} />}
    >
      {children ?? (
        <div className="flex-1 space-y-1 p-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="bg-muted/40 h-9 animate-pulse rounded"
              style={{ animationDelay: `${i * 60}ms` }}
            />
          ))}
        </div>
      )}
    </AppShell>
  );
}
