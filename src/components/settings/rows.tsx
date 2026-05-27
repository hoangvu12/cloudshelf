import * as React from "react";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

export function SettingRow({
  label,
  description,
  control,
}: {
  label: string;
  description: string;
  control: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="w-48 shrink-0">
        <div className="text-foreground text-sm font-medium">{label}</div>
        <div className="text-muted-foreground mt-1 text-xs">{description}</div>
      </div>
      <div className="min-w-0">{control}</div>
    </div>
  );
}

export function SettingToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-6">
      {/* Text fills available width so long descriptions don't get squeezed
          into a narrow column. Toggle stays compact on the right, vertically
          centered against the whole label+description block. */}
      <div className="min-w-0 flex-1">
        <div className="text-foreground text-sm font-medium">{label}</div>
        <div className="text-muted-foreground mt-1 max-w-prose text-xs">
          {description}
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-[18px] w-8 shrink-0 rounded-full border transition-colors",
          checked
            ? "border-primary-text bg-primary-text"
            : "border-surface-1 bg-muted"
        )}
      >
        <span
          className={cn(
            "absolute top-[1px] left-[1px] size-[14px] rounded-full transition-transform",
            checked
              ? "bg-input-bg translate-x-[14px]"
              : "bg-muted-foreground translate-x-0"
          )}
        />
      </button>
    </div>
  );
}

export function SliderRow({
  label,
  description,
  min,
  max,
  value,
  onChange,
}: {
  label: string;
  description: string;
  min: number;
  max: number;
  value: number;
  onChange: (next: number) => void;
}) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-4">
        <div>
          <div className="text-foreground text-sm font-medium">{label}</div>
          <div className="text-muted-foreground mt-1 text-xs">{description}</div>
        </div>
        <div className="text-accent-blue bg-muted border-surface-1 min-w-[32px] rounded border px-2 py-1 text-center font-mono text-xs">
          {value}
        </div>
      </div>
      <Slider
        min={min}
        max={max}
        step={1}
        value={[value]}
        onValueChange={(v) => onChange(v[0] ?? value)}
      />
    </div>
  );
}

export function Segmented<T extends string | number>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (next: T) => void;
  options: { value: T; label: React.ReactNode }[];
}) {
  return (
    <div className="bg-input-bg border-border inline-flex rounded-md border p-0.5">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={String(opt.value)}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "flex items-center gap-1.5 rounded px-3 py-1 font-mono text-xs transition-colors",
              active
                ? "bg-surface-1 text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
