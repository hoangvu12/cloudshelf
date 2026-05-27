import * as React from "react";

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="bg-card border-surface-1 text-foreground inline-block rounded border border-b-2 px-1.5 py-0.5 font-mono text-[11px] shadow-sm">
      {children}
    </kbd>
  );
}

export function KeyCombo({ keys }: { keys: string[] }) {
  return (
    <>
      {keys.map((k, i) => (
        <React.Fragment key={`${i}:${k}`}>
          {i > 0 && <span className="text-muted-foreground mx-1 text-xs">+</span>}
          <Kbd>{k}</Kbd>
        </React.Fragment>
      ))}
    </>
  );
}
