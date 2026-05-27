import * as React from "react";
import {
  AlertTriangle,
  BookOpen,
  Bug,
  Cloud,
  Github,
} from "@/lib/icons";
import { SectionShell } from "./section-shell";

function BackendStat({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      {value}
    </div>
  );
}

function ExternalLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      className="text-accent-blue hover:underline flex items-center gap-1"
    >
      {icon}
      {children}
    </a>
  );
}

export function AboutSection() {
  const resetLocalData = () => {
    const ok = window.confirm(
      "Reset all local preferences (theme, view, density, multipart settings, pinned buckets, upload queue)?\n\nThis won't touch your S3 endpoints or saved connection profiles."
    );
    if (!ok) return;
    const keys = Object.keys(localStorage).filter((k) =>
      k.startsWith("cloudshelf.")
    );
    for (const k of keys) localStorage.removeItem(k);
    window.location.reload();
  };

  return (
    <SectionShell title="System information">
      <div className="bg-card/80 border-border flex flex-col gap-6 rounded-lg border p-5 sm:flex-row sm:justify-between">
        <div>
          <h3 className="text-foreground flex items-center gap-2 text-xl font-bold">
            <Cloud className="text-primary-text size-6" />
            CloudShelf
          </h3>
          <p className="text-muted-foreground mt-1 font-mono text-xs">
            v0.1.0-beta
          </p>
          <div className="mt-6 flex flex-wrap gap-4 font-mono text-xs">
            <ExternalLink href="#" icon={<BookOpen className="size-3.5" />}>
              Docs
            </ExternalLink>
            <ExternalLink href="#" icon={<Github className="size-3.5" />}>
              GitHub
            </ExternalLink>
            <ExternalLink href="#" icon={<Bug className="size-3.5" />}>
              Report issue
            </ExternalLink>
          </div>
        </div>

        <div className="bg-input-bg border-border flex min-w-[200px] flex-col gap-3 rounded border p-4">
          <div className="text-muted-foreground font-mono text-[10px] font-bold tracking-widest uppercase">
            Backend
          </div>
          <BackendStat label="Status" value={
            <span className="text-success flex items-center gap-1.5 font-mono">
              <span className="bg-success size-1.5 rounded-full" /> OK
            </span>
          } />
          <BackendStat label="API" value={<span className="text-foreground font-mono">/api</span>} />
        </div>
      </div>

      <div className="border-destructive/30 bg-destructive/5 rounded-lg border p-5">
        <h3 className="text-destructive mb-2 flex items-center gap-2 text-sm font-bold tracking-wider uppercase">
          <AlertTriangle className="size-4" /> Danger zone
        </h3>
        <p className="text-muted-foreground mb-4 font-mono text-sm">
          Clear all locally saved preferences, pinned buckets, and upload queue.
          This won't delete your connection profiles or any files on your S3
          endpoints.
        </p>
        <button
          type="button"
          onClick={resetLocalData}
          className="bg-destructive/20 hover:bg-destructive text-destructive hover:text-destructive-foreground border-destructive/50 rounded border px-4 py-2 text-sm font-bold transition-colors"
        >
          Reset local preferences
        </button>
      </div>
    </SectionShell>
  );
}
