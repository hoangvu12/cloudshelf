import * as React from "react";
import {
  AlertCircle,
  CheckCircle2,
  Info,
  AlertTriangle,
  type LucideIcon,
} from "@/lib/icons";
import { cn } from "@/lib/utils";

type StatusAlertVariant = "success" | "error" | "info" | "warning";

interface StatusAlertProps {
  variant: StatusAlertVariant;
  title: React.ReactNode;
  description?: React.ReactNode;
  className?: string;
}

const VARIANT_STYLES: Record<
  StatusAlertVariant,
  { wrapper: string; icon: string; title: string; desc: string }
> = {
  success: {
    wrapper: "bg-success/10 border-success/30",
    icon: "text-success",
    title: "text-success",
    desc: "text-success/80",
  },
  error: {
    wrapper: "bg-destructive/10 border-destructive/30",
    icon: "text-destructive",
    title: "text-destructive",
    desc: "text-destructive/80",
  },
  info: {
    wrapper: "bg-info/10 border-info/30",
    icon: "text-info",
    title: "text-info",
    desc: "text-info/80",
  },
  warning: {
    wrapper: "bg-accent-yellow/10 border-accent-yellow/30",
    icon: "text-accent-yellow",
    title: "text-accent-yellow",
    desc: "text-accent-yellow/80",
  },
};

const ICONS: Record<StatusAlertVariant, LucideIcon> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
  warning: AlertTriangle,
};

export function StatusAlert({
  variant,
  title,
  description,
  className,
}: StatusAlertProps) {
  const styles = VARIANT_STYLES[variant];
  const Icon = ICONS[variant];

  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-3 rounded-xl border p-4",
        styles.wrapper,
        className
      )}
    >
      <Icon
        strokeWidth={1.5}
        className={cn("mt-0.5 size-5 shrink-0", styles.icon)}
      />
      <div className="min-w-0 flex-1">
        <h3 className={cn("text-sm font-medium", styles.title)}>{title}</h3>
        {description && (
          <p className={cn("mt-1 text-sm", styles.desc)}>{description}</p>
        )}
      </div>
    </div>
  );
}
