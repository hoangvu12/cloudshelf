import { SHORTCUTS } from "@/lib/shortcuts-data";
import { SectionShell } from "./section-shell";

export function KeyboardSection() {
  return (
    <SectionShell title="Keyboard shortcuts">
      <div className="border-border bg-card/50 overflow-hidden rounded-lg border">
        <div className="bg-muted/30 border-border text-muted-foreground grid grid-cols-2 border-b p-3 font-mono text-xs font-bold tracking-wider uppercase">
          <div>Shortcut</div>
          <div>Action</div>
        </div>
        <div className="divide-border/50 divide-y text-sm">
          {SHORTCUTS.map((s) => (
            <div
              key={s.action}
              className="hover:bg-muted/20 grid grid-cols-2 items-center p-3"
            >
              <div className="flex items-center gap-1">{s.keys}</div>
              <div className="text-muted-foreground">{s.action}</div>
            </div>
          ))}
        </div>
      </div>
    </SectionShell>
  );
}
