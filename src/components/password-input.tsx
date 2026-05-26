import * as React from "react";
import { Eye, EyeOff } from "@/lib/icons";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface PasswordInputProps
  extends Omit<React.ComponentProps<typeof Input>, "type"> {}

export const PasswordInput = React.forwardRef<
  HTMLInputElement,
  PasswordInputProps
>(function PasswordInput({ className, ...props }, ref) {
  const [visible, setVisible] = React.useState(false);

  return (
    <div className="relative">
      <Input
        ref={ref}
        type={visible ? "text" : "password"}
        className={cn("pr-12 font-mono", className)}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide value" : "Show value"}
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/30 absolute inset-y-0 right-0 flex items-center pr-4 transition-colors focus:outline-none focus-visible:ring-2"
        tabIndex={-1}
      >
        {visible ? (
          <EyeOff strokeWidth={1.5} className="size-4" />
        ) : (
          <Eye strokeWidth={1.5} className="size-4" />
        )}
      </button>
    </div>
  );
});
