"use client"

import * as React from "react"
import { Progress as ProgressPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

/**
 * Determinate when `value` is a number; indeterminate when `value` is null or
 * undefined (Radix sets `data-state="indeterminate"` automatically). The
 * indicator falls back to a sweeping bar in that state via the shared
 * `animate-indeterminate-sweep` keyframe in styles.css.
 */
function Progress({
  className,
  value,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  const determinate = typeof value === "number"
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={value}
      className={cn(
        "relative flex h-1 w-full items-center overflow-x-hidden rounded-full bg-muted",
        className
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className={cn(
          "bg-primary-text size-full flex-1 rounded-full shadow-[0_0_10px_color-mix(in_oklab,_var(--primary-text)_40%,_transparent)] transition-all",
          "data-[state=indeterminate]:animate-indeterminate-sweep data-[state=indeterminate]:w-1/3 data-[state=indeterminate]:flex-none"
        )}
        style={
          determinate ? { transform: `translateX(-${100 - value}%)` } : undefined
        }
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }
