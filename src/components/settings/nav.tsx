import * as React from "react";
import {
  Clock,
  Info,
  Keyboard,
  Monitor,
  Server,
  UploadCloud,
} from "@/lib/icons";
import { cn } from "@/lib/utils";

export type Section =
  | "appearance"
  | "uploads"
  | "profiles"
  | "activity"
  | "keyboard"
  | "about";

const NAV_ITEMS: { id: Section; label: string; icon: React.ReactNode }[] = [
  { id: "appearance", label: "Appearance", icon: <Monitor className="size-4" /> },
  { id: "uploads", label: "Uploads", icon: <UploadCloud className="size-4" /> },
  { id: "profiles", label: "Profiles", icon: <Server className="size-4" /> },
  { id: "activity", label: "Activity", icon: <Clock className="size-4" /> },
  { id: "keyboard", label: "Keyboard", icon: <Keyboard className="size-4" /> },
  { id: "about", label: "About", icon: <Info className="size-4" /> },
];

export function SettingsNav({
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
