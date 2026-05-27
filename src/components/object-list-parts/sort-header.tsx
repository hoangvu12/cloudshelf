import * as React from "react";

import { ChevronDown, ChevronUp } from "@/lib/icons";
import { cn } from "@/lib/utils";
import type { SortDirection } from "@/lib/object-sort";

export function SortHeader({
  active,
  dir,
  onClick,
  className,
  children,
}: {
  active: boolean;
  dir: SortDirection;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "hover:text-foreground flex cursor-pointer items-center gap-1 focus:outline-none",
        active && "text-foreground",
        className
      )}
    >
      {children}
      {active &&
        (dir === "asc" ? (
          <ChevronUp className="size-3" />
        ) : (
          <ChevronDown className="size-3" />
        ))}
    </button>
  );
}
