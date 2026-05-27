import * as React from "react";

import { Label } from "@/components/ui/label";

/**
 * Form field shell shared by the setup and login pages. Renders a label with
 * optional inline trailing slot (e.g. "show password" toggle), the input
 * children, and a destructive error message below.
 */
export function FormField({
  label,
  htmlFor,
  error,
  trailing,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="mr-1 flex items-baseline justify-between">
        <Label htmlFor={htmlFor}>{label}</Label>
        {trailing}
      </div>
      {children}
      {error && (
        <p className="text-destructive ml-1 text-xs font-medium">{error}</p>
      )}
    </div>
  );
}
