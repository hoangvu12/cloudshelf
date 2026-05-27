import * as React from "react";

import { AppShell, AppStatusBar } from "@/components/app-shell";
import { AppSidebar } from "@/components/app-sidebar";
import { SettingsNav, type Section } from "@/components/settings/nav";
import { AppearanceSection } from "@/components/settings/section-appearance";
import { UploadsSection } from "@/components/settings/section-uploads";
import { ProfilesSection } from "@/components/settings/section-profiles";
import { ActivitySection } from "@/components/settings/section-activity";
import { KeyboardSection } from "@/components/settings/section-keyboard";
import { AboutSection } from "@/components/settings/section-about";
import { useConnections } from "@/lib/api/connections";
import { useActiveConnectionStore } from "@/stores/active-connection";

export function SettingsPage() {
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

  const [section, setSection] = React.useState<Section>("appearance");

  return (
    <AppShell
      sidebar={
        <AppSidebar
          connections={connections}
          activeConnection={activeConnection}
          onSelectConnection={setActive}
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
            {section === "activity" && <ActivitySection />}
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
