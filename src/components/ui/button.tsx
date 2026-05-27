import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 font-mono whitespace-nowrap transition-[color,background-color,border-color,box-shadow,opacity,transform] duration-150 ease-out outline-none focus-visible:ring-4 focus-visible:ring-ring/30 dark:focus-visible:ring-ring/20 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 active:scale-[0.97]",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground font-bold hover:opacity-90",
        destructive:
          "bg-destructive text-destructive-foreground font-bold hover:opacity-90 focus-visible:ring-destructive/30",
        outline:
          "bg-muted hover:bg-surface-1 text-foreground border border-surface-1",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:
          "text-muted-foreground hover:text-foreground hover:bg-surface-1",
        link:
          "text-foreground underline-offset-4 hover:underline active:scale-100",
        subtle:
          "text-info hover:text-info/80 active:scale-100",
      },
      size: {
        default: "h-8 rounded px-3 text-xs",
        lg: "h-10 rounded px-4 text-sm",
        sm: "h-7 rounded px-2.5 text-[11px]",
        xs: "h-6 rounded px-2 text-[11px] [&_svg:not([class*='size-'])]:size-3",
        pill: "h-8 rounded-full px-4 text-xs",
        icon: "size-8 rounded",
        "icon-sm": "size-7 rounded",
        "icon-xs": "size-6 rounded [&_svg:not([class*='size-'])]:size-3",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button };
