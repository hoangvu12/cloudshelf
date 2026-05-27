import * as React from "react";

export function SectionShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-6">
      <h2 className="border-border text-primary-text border-b pb-2 font-mono text-[10px] font-bold tracking-widest uppercase">
        {title}
      </h2>
      {children}
    </div>
  );
}
