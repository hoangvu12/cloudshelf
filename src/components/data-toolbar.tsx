import * as React from "react";
import { FolderPlus, Grid, List, Search } from "@/lib/icons";

import { cn } from "@/lib/utils";
import { usePrefsStore, type ViewMode } from "@/stores/prefs";

/**
 * Page header for list views — title on the left, controls on the right
 * (filter input, view-mode toggle, primary CTA). Reusable for the future
 * object list inside a single bucket.
 */
export function DataToolbar({
  title,
  subtitle,
  filter,
  onFilterChange,
  filterPlaceholder = "Filter...",
  primaryAction,
  className,
}: {
  /** Optional — when the breadcrumb above already names the view, leave this blank. */
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  filter: string;
  onFilterChange: (next: string) => void;
  filterPlaceholder?: string;
  primaryAction?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "border-border flex h-14 shrink-0 items-center justify-between gap-4 border-b px-4",
        className
      )}
    >
      <div className="flex min-w-0 items-baseline gap-2">
        {title && (
          <h1 className="text-foreground truncate text-base font-medium">
            {title}
          </h1>
        )}
        {subtitle && (
          <span className="text-muted-foreground truncate font-mono text-xs">
            {subtitle}
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        <FilterInput
          value={filter}
          onChange={onFilterChange}
          placeholder={filterPlaceholder}
        />
        <ViewModeToggle />
        {primaryAction}
      </div>
    </div>
  );
}

function FilterInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative hidden sm:block">
      <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="bg-input-bg border-border text-foreground focus:border-primary-text placeholder:text-surface-1 w-48 rounded-md border py-1.5 pr-3 pl-8 font-mono text-xs transition-colors focus:outline-none"
      />
    </div>
  );
}

function ViewModeToggle() {
  const viewMode = usePrefsStore((s) => s.viewMode);
  const setViewMode = usePrefsStore((s) => s.setViewMode);

  return (
    <div className="bg-input-bg border-border flex rounded-md border p-0.5">
      <ViewModeButton
        active={viewMode === "list"}
        onClick={() => setViewMode("list")}
        label="List view"
      >
        <List className="size-3.5" />
      </ViewModeButton>
      <ViewModeButton
        active={viewMode === "grid"}
        onClick={() => setViewMode("grid")}
        label="Grid view"
      >
        <Grid className="size-3.5" />
      </ViewModeButton>
    </div>
  );
}

function ViewModeButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "rounded p-1 focus:outline-none",
        active
          ? "bg-surface-1 text-foreground"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

/**
 * Mauve primary action. Exported so callers can compose the toolbar's
 * primaryAction slot without repeating the styling.
 */
export function PrimaryAction({
  icon = <FolderPlus className="size-3.5" />,
  children,
  onClick,
  disabled,
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="bg-primary text-primary-foreground flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold transition-opacity hover:opacity-90 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:opacity-50"
    >
      {icon}
      {children}
    </button>
  );
}

export type { ViewMode };
