import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Card-shaped container used as the outer shell of a long form/page section.
 * Provides the rounded-4xl + subtle shadow look from the design system.
 */
export function FormCard({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "bg-card border-border rounded-2xl border p-6 shadow-[0_4px_40px_-4px_rgba(0,0,0,0.04)] transition-colors sm:p-8 dark:shadow-[0_10px_40px_-10px_rgba(0,0,0,0.5)]",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/**
 * Tinted inset block for grouping advanced/secondary fields inside a FormCard.
 */
export function FormGroup({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "bg-muted/40 border-border space-y-5 rounded-xl border p-5",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/**
 * Thin horizontal rule used to separate form sections inside a FormCard.
 */
export function FormDivider({ className }: { className?: string }) {
  return <hr className={cn("border-border/60", className)} />;
}

/**
 * A row layout for an inline boolean control (e.g. switch) with a title and
 * optional helper text on the left.
 */
export function FormToggleRow({
  title,
  description,
  control,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  control: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex flex-col pr-4">
        <span className="text-foreground text-sm font-medium">{title}</span>
        {description && (
          <span className="text-muted-foreground mt-0.5 text-xs">
            {description}
          </span>
        )}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}
