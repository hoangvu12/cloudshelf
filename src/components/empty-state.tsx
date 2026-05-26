import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Centered empty state — icon in a soft surface tile, title, optional
 * description, optional CTA. Catppuccin-themed; used inside the bucket list
 * for no-buckets / API-down / no-connections / fetch-error states.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-1 flex-col items-center justify-center px-6 py-16 text-center",
        className
      )}
    >
      <div className="bg-ctp-surface0/60 border-ctp-surface0 mb-5 flex size-14 items-center justify-center rounded-xl border">
        <span className="text-ctp-mauve [&_svg]:size-6">{icon}</span>
      </div>
      <h2 className="text-ctp-text mb-1.5 text-sm font-medium">{title}</h2>
      {description && (
        <p className="text-ctp-subtext mb-5 max-w-xs text-xs leading-relaxed">
          {description}
        </p>
      )}
      {action}
    </div>
  );
}
