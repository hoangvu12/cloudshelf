import * as React from "react";

import { cn } from "@/lib/utils";

export function Cell({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("text-muted-foreground font-mono text-xs", className)}>
      {children}
    </div>
  );
}
