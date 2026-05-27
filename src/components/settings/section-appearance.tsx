import * as React from "react";
import { useTheme } from "next-themes";
import { Grid, List } from "@/lib/icons";
import { THEMES, type ThemeName } from "@/components/themes";
import { cn } from "@/lib/utils";
import { usePrefsStore, type ViewMode, type RowDensity } from "@/stores/prefs";
import { SectionShell } from "./section-shell";
import { Segmented, SettingRow } from "./rows";

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
  // useSyncExternalStore returns the client value on every read after hydration
  // without needing a setState round-trip.
  const mounted = React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
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

export function AppearanceSection() {
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
