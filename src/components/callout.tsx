import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Subtle informational note — small icon + paragraph in a muted card.
 * Used for security reassurance, contextual hints, etc.
 */
export function Callout({
  icon,
  children,
  className,
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "bg-muted/50 border-border/60 text-muted-foreground flex items-start gap-3 rounded-2xl border p-4 text-sm",
        className
      )}
    >
      {icon && (
        <span className="text-foreground/80 mt-0.5 flex shrink-0 items-center">
          {icon}
        </span>
      )}
      <p className="font-mono leading-relaxed">{children}</p>
    </div>
  );
}
