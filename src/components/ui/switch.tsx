"use client";

import * as React from "react";
import { Switch as SwitchPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer focus-visible:ring-ring/30 dark:focus-visible:ring-ring/20 data-[state=checked]:bg-primary data-[state=unchecked]:bg-muted dark:data-[state=unchecked]:bg-muted inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-transparent transition-colors outline-none focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "bg-card pointer-events-none block size-5 rounded-full shadow-sm ring-0 transition-transform data-[state=checked]:translate-x-[22px] data-[state=unchecked]:translate-x-[2px] dark:data-[state=checked]:bg-primary-foreground dark:data-[state=unchecked]:bg-foreground"
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
