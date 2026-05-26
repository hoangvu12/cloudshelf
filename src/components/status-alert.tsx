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
    wrapper: "bg-ctp-green/10 border-ctp-green/30",
    icon: "text-ctp-green",
    title: "text-ctp-green",
    desc: "text-ctp-green/80",
  },
  error: {
    wrapper: "bg-ctp-red/10 border-ctp-red/30",
    icon: "text-ctp-red",
    title: "text-ctp-red",
    desc: "text-ctp-red/80",
  },
  info: {
    wrapper: "bg-ctp-blue/10 border-ctp-blue/30",
    icon: "text-ctp-blue",
    title: "text-ctp-blue",
    desc: "text-ctp-blue/80",
  },
  warning: {
    wrapper: "bg-ctp-yellow/10 border-ctp-yellow/30",
    icon: "text-ctp-yellow",
    title: "text-ctp-yellow",
    desc: "text-ctp-yellow/80",
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
