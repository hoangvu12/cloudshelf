import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useTheme } from "next-themes";
import {
  AlertTriangle,
  BookOpen,
  Bug,
  Cloud,
  Database,
  Edit2,
  Github,
  Grid,
  Info,
  Keyboard,
  List,
  Monitor,
  Plus,
  Server,
  Trash2,
  UploadCloud,
} from "@/lib/icons";

import { AppShell, AppStatusBar } from "@/components/app-shell";
import { AppSidebar } from "@/components/app-sidebar";
import { Slider } from "@/components/ui/slider";
import { THEMES, type ThemeName } from "@/components/theme-provider";
import {
  useConnections,
  useDeleteConnection,
} from "@/lib/api/connections";
import { useBuckets } from "@/lib/api/buckets";
import { cn } from "@/lib/utils";
import { SHORTCUTS } from "@/lib/shortcuts";
import { useActiveConnectionStore } from "@/stores/active-connection";
import { usePrefsStore, type ViewMode, type RowDensity } from "@/stores/prefs";
import type { S3Connection } from "@server/types";

type Section = "appearance" | "uploads" | "profiles" | "keyboard" | "about";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const connectionsQuery = useConnections();
  const connections = connectionsQuery.data ?? [];

  const storedActiveId = useActiveConnectionStore((s) => s.activeId);
  const setActive = useActiveConnectionStore((s) => s.setActive);
  const activeId =
    storedActiveId && connections.some((c) => c.id === storedActiveId)
      ? storedActiveId
      : connections[0]?.id ?? null;
  const activeConnection = connections.find((c) => c.id === activeId) ?? null;

  React.useEffect(() => {
    if (activeId && activeId !== storedActiveId) setActive(activeId);
  }, [activeId, storedActiveId, setActive]);

  const bucketsQuery = useBuckets(activeId);
  const totalBytes = (bucketsQuery.data ?? []).reduce(
    (sum, b) => sum + (b.sizeBytes ?? 0),
    0
  );

  const [section, setSection] = React.useState<Section>("appearance");

  return (
    <AppShell
      sidebar={
        <AppSidebar
          connections={connections}
          activeConnection={activeConnection}
          onSelectConnection={setActive}
          storageUsedBytes={totalBytes}
        />
      }
    >
      <div className="border-border flex h-14 shrink-0 items-center justify-between gap-4 border-b px-5">
        <div className="flex min-w-0 items-baseline gap-2">
          <h1 className="text-foreground truncate text-base font-medium">
            Settings
          </h1>
          <span className="text-muted-foreground truncate font-mono text-xs">
            ~/.config/cloudshelf/settings.conf
          </span>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <SettingsNav active={section} onChange={setSection} />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl p-8 sm:p-10">
            {section === "appearance" && <AppearanceSection />}
            {section === "uploads" && <UploadsSection />}
            {section === "profiles" && (
              <ProfilesSection
                connections={connections}
                activeId={activeId}
              />
            )}
            {section === "keyboard" && <KeyboardSection />}
            {section === "about" && <AboutSection />}
          </div>
        </main>
      </div>

      <AppStatusBar
        right={<span>Preferences saved automatically</span>}
      />
    </AppShell>
  );
}

const NAV_ITEMS: { id: Section; label: string; icon: React.ReactNode }[] = [
  { id: "appearance", label: "Appearance", icon: <Monitor className="size-4" /> },
  { id: "uploads", label: "Uploads", icon: <UploadCloud className="size-4" /> },
  { id: "profiles", label: "Profiles", icon: <Server className="size-4" /> },
  { id: "keyboard", label: "Keyboard", icon: <Keyboard className="size-4" /> },
  { id: "about", label: "About", icon: <Info className="size-4" /> },
];

function SettingsNav({
  active,
  onChange,
}: {
  active: Section;
  onChange: (next: Section) => void;
}) {
  return (
    <nav className="bg-card/60 border-border flex w-48 shrink-0 flex-col gap-0.5 border-r py-3">
      {NAV_ITEMS.map((item, i) => {
        const isAbout = item.id === "about";
        return (
          <React.Fragment key={item.id}>
            {isAbout && i > 0 && (
              <div className="border-border mx-4 my-2 border-t" />
            )}
            <button
              type="button"
              onClick={() => onChange(item.id)}
              aria-current={active === item.id ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 border-l-2 px-4 py-2.5 text-left text-sm font-medium transition-colors",
                active === item.id
                  ? "border-primary-text bg-muted text-primary-text"
                  : "text-muted-foreground hover:bg-muted border-transparent hover:text-foreground"
              )}
            >
              {item.icon}
              {item.label}
            </button>
          </React.Fragment>
        );
      })}
    </nav>
  );
}

// ─── Section: Appearance ────────────────────────────────────────────────

function AppearanceSection() {
  const viewMode = usePrefsStore((s) => s.viewMode);
  const setViewMode = usePrefsStore((s) => s.setViewMode);
  const density = usePrefsStore((s) => s.density);
  const setDensity = usePrefsStore((s) => s.setDensity);

  return (
    <SectionShell title="Appearance settings">
      <SettingRow
        label="Default view"
        description="How files are displayed when you open a bucket."
        control={
          <Segmented<ViewMode>
            value={viewMode}
            onChange={setViewMode}
            options={[
              {
                value: "list",
                label: (
                  <>
                    <List className="size-3.5" /> List
                  </>
                ),
              },
              {
                value: "grid",
                label: (
                  <>
                    <Grid className="size-3.5" /> Grid
                  </>
                ),
              },
            ]}
          />
        }
      />

      <SettingRow
        label="Row density"
        description="Spacing between items in list view."
        control={
          <Segmented<RowDensity>
            value={density}
            onChange={setDensity}
            options={[
              { value: "comfortable", label: "Comfortable" },
              { value: "compact", label: "Compact" },
            ]}
          />
        }
      />

      <SettingRow
        label="Color theme"
        description="Switches the entire palette. All themes are dark-aesthetic."
        control={<ThemePicker />}
      />
    </SectionShell>
  );
}

// ─── Section: Uploads ───────────────────────────────────────────────────

const MB = 1024 * 1024;
const PART_SIZE_OPTIONS = [8 * MB, 16 * MB, 32 * MB, 64 * MB];

function UploadsSection() {
  const partSize = usePrefsStore((s) => s.multipartPartSize);
  const concurrentUploads = usePrefsStore((s) => s.concurrentUploads);
  const concurrentParts = usePrefsStore((s) => s.concurrentParts);
  const overwriteWarning = usePrefsStore((s) => s.overwriteWarning);
  const resumeOnReload = usePrefsStore((s) => s.resumeOnReload);
  const patch = usePrefsStore((s) => s.patch);

  return (
    <SectionShell title="Transfer settings">
      <SettingRow
        label="Multipart chunk size"
        description="Size of parts for large file uploads."
        control={
          <Segmented<number>
            value={partSize}
            onChange={(v) => patch({ multipartPartSize: v })}
            options={PART_SIZE_OPTIONS.map((bytes) => ({
              value: bytes,
              label: `${bytes / MB} MB`,
            }))}
          />
        }
      />

      <SliderRow
        label="Concurrent uploads"
        description="Max number of files uploading at once."
        min={2}
        max={8}
        value={concurrentUploads}
        onChange={(v) => patch({ concurrentUploads: v })}
      />

      <SliderRow
        label="Concurrent parts per upload"
        description="Parallel connections per multipart file."
        min={2}
        max={8}
        value={concurrentParts}
        onChange={(v) => patch({ concurrentParts: v })}
      />

      <div className="border-border space-y-6 border-t pt-6">
        <SettingToggleRow
          label="Overwrite warning"
          description="Prompt before overwriting existing files."
          checked={overwriteWarning}
          onChange={(v) => patch({ overwriteWarning: v })}
        />
        <SettingToggleRow
          label="Resume on reload"
          description="Automatically resume paused uploads after a page refresh."
          checked={resumeOnReload}
          onChange={(v) => patch({ resumeOnReload: v })}
        />
      </div>
    </SectionShell>
  );
}

// ─── Section: Profiles ──────────────────────────────────────────────────

function ProfilesSection({
  connections,
  activeId,
}: {
  connections: S3Connection[];
  activeId: string | null;
}) {
  const navigate = useNavigate();
  const deleteConnection = useDeleteConnection();
  const setActive = useActiveConnectionStore((s) => s.setActive);

  const onDelete = (c: S3Connection) => {
    const ok = window.confirm(
      `Delete profile "${c.name}"? This removes it from CloudShelf but won't touch your files on the endpoint.`
    );
    if (!ok) return;
    deleteConnection.mutate(c.id, {
      onSuccess: () => {
        if (activeId === c.id) {
          const next = connections.find((other) => other.id !== c.id);
          setActive(next?.id ?? null);
        }
      },
    });
  };

  return (
    <div className="space-y-4">
      <div className="border-border mb-6 flex items-center justify-between border-b pb-2">
        <h2 className="text-accent-peach font-mono text-[10px] font-bold tracking-widest uppercase">
          S3 endpoints
        </h2>
        <button
          type="button"
          onClick={() => navigate({ to: "/setup" })}
          className="bg-input-bg border-surface-1 hover:border-primary-text hover:text-primary-text text-foreground flex items-center gap-2 rounded border px-3 py-1.5 font-mono text-xs transition-colors"
        >
          <Plus className="size-3.5" /> Add profile
        </button>
      </div>

      {connections.length === 0 && (
        <div className="border-border text-muted-foreground rounded-lg border border-dashed p-10 text-center text-sm">
          No profiles yet. Add one to start managing buckets.
        </div>
      )}

      {connections.map((c) => {
        const isActive = c.id === activeId;
        return (
          <div
            key={c.id}
            className={cn(
              "group flex items-center justify-between rounded-lg border p-4",
              isActive
                ? "border-primary-text/50 bg-muted/30"
                : "border-border bg-input-bg/50 hover:border-surface-1"
            )}
          >
            <div className="flex min-w-0 items-center gap-4">
              <ProfileIcon endpoint={c.endpoint} active={isActive} />
              <div className="min-w-0">
                <div className="text-foreground flex items-center gap-2 truncate text-sm font-semibold">
                  {c.name}
                  {isActive ? (
                    <ProfileBadge tone="green">Active</ProfileBadge>
                  ) : (
                    <ProfileBadge tone="muted">Saved</ProfileBadge>
                  )}
                </div>
                <div className="text-muted-foreground mt-1 truncate font-mono text-xs">
                  {c.endpoint}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
              {!isActive && (
                <button
                  type="button"
                  onClick={() => setActive(c.id)}
                  className="text-muted-foreground hover:bg-surface-1 hover:text-foreground rounded px-2 py-1 font-mono text-[11px] transition-colors"
                  title="Set as active"
                >
                  Activate
                </button>
              )}
              <button
                type="button"
                onClick={() => navigate({ to: "/setup" })}
                className="text-muted-foreground hover:bg-surface-1 hover:text-foreground rounded p-2 transition-colors"
                title="Edit"
              >
                <Edit2 className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => onDelete(c)}
                disabled={deleteConnection.isPending}
                className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded p-2 transition-colors disabled:opacity-50"
                title="Delete"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ProfileIcon({
  endpoint,
  active,
}: {
  endpoint: string;
  active: boolean;
}) {
  const lower = endpoint.toLowerCase();
  const Icon = lower.includes("localhost") || lower.includes("127.0.0.1")
    ? Server
    : lower.includes("minio")
    ? Database
    : Cloud;
  return (
    <Icon
      className={cn(
        "size-6 shrink-0",
        active ? "text-primary-text" : "text-muted-foreground"
      )}
    />
  );
}

function ProfileBadge({
  tone,
  children,
}: {
  tone: "green" | "muted";
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase",
        tone === "green"
          ? "border-accent-green/30 bg-accent-green/20 text-accent-green"
          : "border-surface-1 bg-muted text-muted-foreground"
      )}
    >
      {children}
    </span>
  );
}

// ─── Section: Keyboard ─────────────────────────────────────────────────

function KeyboardSection() {
  return (
    <SectionShell title="Keyboard shortcuts">
      <div className="border-border bg-card/50 overflow-hidden rounded-lg border">
        <div className="bg-muted/30 border-border text-muted-foreground grid grid-cols-2 border-b p-3 font-mono text-xs font-bold tracking-wider uppercase">
          <div>Shortcut</div>
          <div>Action</div>
        </div>
        <div className="divide-border/50 divide-y text-sm">
          {SHORTCUTS.map((s, i) => (
            <div
              key={i}
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

// ─── Section: About ────────────────────────────────────────────────────

function AboutSection() {
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
        <p className="text-muted-foreground mb-4 font-sans text-sm">
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

// ─── Shared building blocks ────────────────────────────────────────────

function SectionShell({
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

function SettingRow({
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

function SettingToggleRow({
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
    <SettingRow
      label={label}
      description={description}
      control={
        <button
          type="button"
          role="switch"
          aria-checked={checked}
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
      }
    />
  );
}

function SliderRow({
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

function Segmented<T extends string | number>({
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

// ─── Theme picker ───────────────────────────────────────────────────────
// Swatches are hardcoded per theme so each preview shows that theme's actual
// palette regardless of which one is currently active. Keep in sync with the
// primitive blocks in styles.css.
const THEME_OPTIONS: Record<
  ThemeName,
  { label: string; subtitle: string; bg: string; swatches: string[] }
> = {
  mocha: {
    label: "Catppuccin Mocha",
    subtitle: "Warm purples on aubergine",
    bg: "#1e1e2e",
    swatches: ["#cba6f7", "#f38ba8", "#a6e3a1", "#f9e2af", "#89b4fa"],
  },
  macchiato: {
    label: "Catppuccin Macchiato",
    subtitle: "Softer pastel midnight",
    bg: "#24273a",
    swatches: ["#c6a0f6", "#ed8796", "#a6da95", "#eed49f", "#8aadf4"],
  },
  "tokyo-night": {
    label: "Tokyo Night",
    subtitle: "Cool blues on midnight",
    bg: "#1a1b26",
    swatches: ["#bb9af7", "#f7768e", "#9ece6a", "#e0af68", "#7aa2f7"],
  },
  nord: {
    label: "Nord",
    subtitle: "Arctic frost and aurora",
    bg: "#2e3440",
    swatches: ["#b48ead", "#bf616a", "#a3be8c", "#ebcb8b", "#88c0d0"],
  },
  "rose-pine": {
    label: "Rosé Pine",
    subtitle: "Soho-vibe, but make it pastel",
    bg: "#191724",
    swatches: ["#c4a7e7", "#eb6f92", "#31748f", "#f6c177", "#9ccfd8"],
  },
  "rose-pine-moon": {
    label: "Rosé Pine Moon",
    subtitle: "Lighter sibling of Rosé Pine",
    bg: "#232136",
    swatches: ["#c4a7e7", "#eb6f92", "#3e8fb0", "#f6c177", "#9ccfd8"],
  },
  lilypichu: {
    label: "LilyPichu",
    subtitle: "Rose-tinted everything",
    bg: "#482a36",
    swatches: ["#d670ad", "#c95876", "#40bf95", "#cdb84b", "#4ba4cd"],
  },
  vencord: {
    label: "Vencord",
    subtitle: "Earthy Gruvbox warmth",
    bg: "#282828",
    swatches: ["#d3869b", "#ea6962", "#a8b665", "#d8a656", "#7caea3"],
  },
};

function ThemePicker() {
  const { theme, setTheme } = useTheme();
  // Avoid hydration flicker — useTheme is undefined until the client mounts.
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const active = mounted ? (theme as ThemeName | undefined) ?? "mocha" : null;

  return (
    <div className="grid w-full max-w-2xl grid-cols-2 gap-3 sm:grid-cols-3">
      {THEMES.map((name) => {
        const opt = THEME_OPTIONS[name];
        const isActive = active === name;
        return (
          <button
            key={name}
            type="button"
            onClick={() => setTheme(name)}
            aria-pressed={isActive}
            className={cn(
              "group flex flex-col gap-2 rounded-lg border p-3 text-left transition-colors",
              isActive
                ? "border-primary ring-primary/30 ring-2"
                : "border-border hover:border-surface-1"
            )}
          >
            <div
              className="border-border h-12 w-full overflow-hidden rounded-md border"
              style={{ backgroundColor: opt.bg }}
            >
              <div className="flex h-full items-center justify-center gap-1.5">
                {opt.swatches.map((c) => (
                  <span
                    key={c}
                    className="size-3 rounded-full"
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
            <div className="min-w-0">
              <div className="text-foreground truncate text-sm font-medium">
                {opt.label}
              </div>
              <div className="text-muted-foreground truncate font-mono text-[10px]">
                {opt.subtitle}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
