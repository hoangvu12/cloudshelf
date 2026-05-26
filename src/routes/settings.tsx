import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
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
import {
  useConnections,
  useDeleteConnection,
} from "@/lib/api/connections";
import { useBuckets } from "@/lib/api/buckets";
import { cn } from "@/lib/utils";
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
      <div className="border-ctp-surface0 flex h-14 shrink-0 items-center justify-between gap-4 border-b px-5">
        <div className="flex min-w-0 items-baseline gap-2">
          <h1 className="text-ctp-text truncate text-base font-medium">
            Settings
          </h1>
          <span className="text-ctp-subtext truncate font-mono text-xs">
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
    <nav className="bg-ctp-mantle/60 border-ctp-surface0 flex w-48 shrink-0 flex-col gap-0.5 border-r py-3">
      {NAV_ITEMS.map((item, i) => {
        const isAbout = item.id === "about";
        return (
          <React.Fragment key={item.id}>
            {isAbout && i > 0 && (
              <div className="border-ctp-surface0 mx-4 my-2 border-t" />
            )}
            <button
              type="button"
              onClick={() => onChange(item.id)}
              aria-current={active === item.id ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 border-l-2 px-4 py-2.5 text-left text-sm font-medium transition-colors",
                active === item.id
                  ? "border-ctp-mauve bg-ctp-surface0 text-ctp-mauve"
                  : "text-ctp-subtext hover:bg-ctp-surface0 border-transparent hover:text-ctp-text"
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
    <SectionShell title="Appearance settings" accent="mauve">
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
        description="CloudShelf is dark-only — Catppuccin Mocha is part of the visual identity."
        control={
          <Segmented<"dark">
            value="dark"
            onChange={() => {}}
            options={[{ value: "dark", label: "Dark" }]}
          />
        }
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
    <SectionShell title="Transfer settings" accent="blue">
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

      <div className="border-ctp-surface0 space-y-6 border-t pt-6">
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
      <div className="border-ctp-surface0 mb-6 flex items-center justify-between border-b pb-2">
        <h2 className="text-ctp-peach font-mono text-[10px] font-bold tracking-widest uppercase">
          S3 endpoints
        </h2>
        <button
          type="button"
          onClick={() => navigate({ to: "/setup" })}
          className="bg-ctp-crust border-ctp-surface1 hover:border-ctp-mauve hover:text-ctp-mauve text-ctp-text flex items-center gap-2 rounded border px-3 py-1.5 font-mono text-xs transition-colors"
        >
          <Plus className="size-3.5" /> Add profile
        </button>
      </div>

      {connections.length === 0 && (
        <div className="border-ctp-surface0 text-ctp-subtext rounded-lg border border-dashed p-10 text-center text-sm">
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
                ? "border-ctp-mauve/50 bg-ctp-surface0/30"
                : "border-ctp-surface0 bg-ctp-crust/50 hover:border-ctp-surface1"
            )}
          >
            <div className="flex min-w-0 items-center gap-4">
              <ProfileIcon endpoint={c.endpoint} active={isActive} />
              <div className="min-w-0">
                <div className="text-ctp-text flex items-center gap-2 truncate text-sm font-semibold">
                  {c.name}
                  {isActive ? (
                    <ProfileBadge tone="green">Active</ProfileBadge>
                  ) : (
                    <ProfileBadge tone="muted">Saved</ProfileBadge>
                  )}
                </div>
                <div className="text-ctp-subtext mt-1 truncate font-mono text-xs">
                  {c.endpoint}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
              {!isActive && (
                <button
                  type="button"
                  onClick={() => setActive(c.id)}
                  className="text-ctp-subtext hover:bg-ctp-surface1 hover:text-ctp-text rounded px-2 py-1 font-mono text-[11px] transition-colors"
                  title="Set as active"
                >
                  Activate
                </button>
              )}
              <button
                type="button"
                onClick={() => navigate({ to: "/setup" })}
                className="text-ctp-subtext hover:bg-ctp-surface1 hover:text-ctp-text rounded p-2 transition-colors"
                title="Edit"
              >
                <Edit2 className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => onDelete(c)}
                disabled={deleteConnection.isPending}
                className="text-ctp-subtext hover:text-ctp-red hover:bg-ctp-red/10 rounded p-2 transition-colors disabled:opacity-50"
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
        active ? "text-ctp-mauve" : "text-ctp-subtext"
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
          ? "border-ctp-green/30 bg-ctp-green/20 text-ctp-green"
          : "border-ctp-surface1 bg-ctp-surface0 text-ctp-subtext"
      )}
    >
      {children}
    </span>
  );
}

// ─── Section: Keyboard ─────────────────────────────────────────────────

const SHORTCUTS: { keys: React.ReactNode; action: string }[] = [
  { keys: <KeyCombo keys={["⌘", "K"]} />, action: "Global search" },
  { keys: <KeyCombo keys={["⌘", "U"]} />, action: "Upload files" },
  { keys: <KeyCombo keys={["⌘", "⇧", "N"]} />, action: "New bucket / New folder" },
  {
    keys: (
      <>
        <Kbd>⌫</Kbd> or <Kbd>Del</Kbd>
      </>
    ),
    action: "Delete selected items",
  },
  { keys: <KeyCombo keys={["⌘", "A"]} />, action: "Select all in view" },
  {
    keys: (
      <>
        <Kbd>J</Kbd> / <Kbd>K</Kbd> or <Kbd>↓</Kbd> / <Kbd>↑</Kbd>
      </>
    ),
    action: "Navigate list up/down",
  },
  { keys: <Kbd>Space</Kbd>, action: "Toggle preview sidebar" },
  { keys: <Kbd>/</Kbd>, action: "Focus path navigation" },
  { keys: <Kbd>F2</Kbd>, action: "Rename selected item" },
  { keys: <KeyCombo keys={["⌘", "C"]} />, action: "Copy public link" },
  { keys: <Kbd>?</Kbd>, action: "Show all shortcuts" },
  { keys: <Kbd>Esc</Kbd>, action: "Close modals / Clear selection" },
];

function KeyboardSection() {
  return (
    <SectionShell title="Keyboard shortcuts" accent="green">
      <div className="border-ctp-surface0 bg-ctp-mantle/50 overflow-hidden rounded-lg border">
        <div className="bg-ctp-surface0/30 border-ctp-surface0 text-ctp-subtext grid grid-cols-2 border-b p-3 font-mono text-xs font-bold tracking-wider uppercase">
          <div>Shortcut</div>
          <div>Action</div>
        </div>
        <div className="divide-ctp-surface0/50 divide-y text-sm">
          {SHORTCUTS.map((s, i) => (
            <div
              key={i}
              className="hover:bg-ctp-surface0/20 grid grid-cols-2 items-center p-3"
            >
              <div className="flex items-center gap-1">{s.keys}</div>
              <div className="text-ctp-subtext">{s.action}</div>
            </div>
          ))}
        </div>
      </div>
    </SectionShell>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="bg-ctp-mantle border-ctp-surface1 text-ctp-text inline-block rounded border border-b-2 px-1.5 py-0.5 font-mono text-[11px] shadow-sm">
      {children}
    </kbd>
  );
}

function KeyCombo({ keys }: { keys: string[] }) {
  return (
    <>
      {keys.map((k, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span className="text-ctp-subtext mx-1 text-xs">+</span>}
          <Kbd>{k}</Kbd>
        </React.Fragment>
      ))}
    </>
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
    <SectionShell title="System information" accent="mauve">
      <div className="bg-ctp-mantle/80 border-ctp-surface0 flex flex-col gap-6 rounded-lg border p-5 sm:flex-row sm:justify-between">
        <div>
          <h3 className="text-ctp-text flex items-center gap-2 text-xl font-bold">
            <Cloud className="text-ctp-mauve size-6" />
            CloudShelf
          </h3>
          <p className="text-ctp-subtext mt-1 font-mono text-xs">
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

        <div className="bg-ctp-crust border-ctp-surface0 flex min-w-[200px] flex-col gap-3 rounded border p-4">
          <div className="text-ctp-surface1 font-mono text-[10px] font-bold tracking-widest uppercase">
            Backend
          </div>
          <BackendStat label="Status" value={
            <span className="text-ctp-green flex items-center gap-1.5 font-mono">
              <span className="bg-ctp-green size-1.5 rounded-full" /> OK
            </span>
          } />
          <BackendStat label="API" value={<span className="text-ctp-text font-mono">/api</span>} />
        </div>
      </div>

      <div className="border-ctp-red/30 bg-ctp-red/5 rounded-lg border p-5">
        <h3 className="text-ctp-red mb-2 flex items-center gap-2 text-sm font-bold tracking-wider uppercase">
          <AlertTriangle className="size-4" /> Danger zone
        </h3>
        <p className="text-ctp-subtext mb-4 text-sm">
          Clear all locally saved preferences, pinned buckets, and upload queue.
          This won't delete your connection profiles or any files on your S3
          endpoints.
        </p>
        <button
          type="button"
          onClick={resetLocalData}
          className="bg-ctp-red/20 hover:bg-ctp-red text-ctp-red hover:text-ctp-crust border-ctp-red/50 rounded border px-4 py-2 text-sm font-bold transition-colors"
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
      <span className="text-ctp-subtext">{label}</span>
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
      className="text-ctp-blue hover:underline flex items-center gap-1"
    >
      {icon}
      {children}
    </a>
  );
}

// ─── Shared building blocks ────────────────────────────────────────────

function SectionShell({
  title,
  accent,
  children,
}: {
  title: string;
  accent: "mauve" | "blue" | "peach" | "green";
  children: React.ReactNode;
}) {
  const accentClass = {
    mauve: "text-ctp-mauve",
    blue: "text-ctp-blue",
    peach: "text-ctp-peach",
    green: "text-ctp-green",
  }[accent];
  return (
    <div className="space-y-6">
      <h2
        className={cn(
          "border-ctp-surface0 border-b pb-2 font-mono text-[10px] font-bold tracking-widest uppercase",
          accentClass
        )}
      >
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
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="text-ctp-text text-sm font-medium">{label}</div>
        <div className="text-ctp-subtext mt-1 text-xs">{description}</div>
      </div>
      <div className="shrink-0">{control}</div>
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
              ? "border-ctp-mauve bg-ctp-mauve"
              : "border-ctp-surface1 bg-ctp-surface0"
          )}
        >
          <span
            className={cn(
              "absolute top-[1px] left-[1px] size-[14px] rounded-full transition-transform",
              checked
                ? "bg-ctp-crust translate-x-[14px]"
                : "bg-ctp-subtext translate-x-0"
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
          <div className="text-ctp-text text-sm font-medium">{label}</div>
          <div className="text-ctp-subtext mt-1 text-xs">{description}</div>
        </div>
        <div className="text-ctp-blue bg-ctp-surface0 border-ctp-surface1 min-w-[32px] rounded border px-2 py-1 text-center font-mono text-xs">
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
    <div className="bg-ctp-crust border-ctp-surface0 inline-flex rounded-md border p-0.5">
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
                ? "bg-ctp-surface1 text-ctp-text shadow-sm"
                : "text-ctp-subtext hover:text-ctp-text"
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
