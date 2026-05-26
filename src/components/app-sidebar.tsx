import * as React from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import {
  ChevronsUpDown,
  Home,
  LogOut,
  Plus,
  Server,
  Settings,
} from "@/lib/icons";

import { cn } from "@/lib/utils";
import { formatBytes } from "@/lib/format";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLogout, useMe } from "@/lib/api/auth";
import type { S3Connection } from "@server/types";

type AccentColor = "blue" | "mauve" | "subtext";

interface PlaceItem {
  label: string;
  to?: string;
  onClick?: () => void;
  icon: React.ReactNode;
  accent: AccentColor;
  badge?: React.ReactNode;
}

const ACCENT_TEXT: Record<AccentColor, string> = {
  blue: "text-ctp-blue",
  mauve: "text-ctp-mauve",
  subtext: "text-ctp-subtext",
};

const PLACES: PlaceItem[] = [
  { label: "All buckets", to: "/", icon: <Home className="size-4" />, accent: "blue" },
  { label: "Settings", to: "/settings", icon: <Settings className="size-4" />, accent: "subtext" },
];

export function AppSidebar({
  connections,
  activeConnection,
  onSelectConnection,
  storageUsedBytes = 0,
  storageTotalBytes,
}: {
  connections: S3Connection[];
  activeConnection: S3Connection | null;
  onSelectConnection?: (id: string) => void;
  storageUsedBytes?: number;
  /** Optional plan cap. When omitted, uses a 2 TB soft default. */
  storageTotalBytes?: number;
}) {
  const cap = storageTotalBytes ?? 2 * 1024 ** 4;
  const pct = Math.min(100, Math.round((storageUsedBytes / cap) * 100));

  return (
    <aside className="bg-ctp-mantle/80 border-ctp-surface0 hidden w-56 shrink-0 flex-col border-r md:flex">
      <div className="border-ctp-surface0 flex h-14 items-center gap-2 border-b px-4">
        <div className="bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-md font-mono text-xs font-bold">
          C
        </div>
        <span className="text-ctp-text text-sm font-medium tracking-tight">
          CloudShelf
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <SectionLabel>Places</SectionLabel>
        <div className="mb-6 space-y-0.5">
          {PLACES.map((item) => (
            <PlaceLink key={item.label} item={item} />
          ))}
        </div>

        <SectionLabel>Connections</SectionLabel>
        <div className="space-y-0.5">
          <ActiveConnectionSwitcher
            connections={connections}
            activeConnection={activeConnection}
            onSelectConnection={onSelectConnection}
          />
          {connections
            .filter((c) => c.id !== activeConnection?.id)
            .slice(0, 3)
            .map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onSelectConnection?.(c.id)}
                className="text-ctp-subtext hover:bg-ctp-surface0 hover:text-ctp-text flex w-full items-center gap-3 truncate rounded-md px-2 py-1.5 text-left text-sm opacity-70 transition-colors"
              >
                <Server className="text-ctp-subtext size-4 shrink-0" />
                <span className="truncate">{c.name}</span>
              </button>
            ))}
        </div>
      </div>

      <SignedInFooter
        storageUsedBytes={storageUsedBytes}
        storageTotalBytes={storageTotalBytes}
        pct={pct}
      />
    </aside>
  );
}

function SignedInFooter({
  storageUsedBytes,
  storageTotalBytes,
  pct,
}: {
  storageUsedBytes: number;
  storageTotalBytes?: number;
  pct: number;
}) {
  const me = useMe();
  const logout = useLogout();
  const navigate = useNavigate();

  const onSignOut = () => {
    logout.mutate(undefined, {
      onSettled: () => navigate({ to: "/login" }),
    });
  };

  return (
    <div className="border-ctp-surface0 border-t p-4">
      {me.data && (
        <div className="mb-3 flex items-center justify-between gap-2">
          <span
            className="text-ctp-subtext truncate text-xs"
            title={me.data.user}
          >
            Signed in as{" "}
            <span className="text-ctp-text font-medium">{me.data.user}</span>
          </span>
          <button
            type="button"
            onClick={onSignOut}
            disabled={logout.isPending}
            title="Sign out"
            className="text-ctp-subtext hover:bg-ctp-surface0 hover:text-ctp-red rounded p-1 transition-colors disabled:opacity-50"
          >
            <LogOut className="size-3.5" />
          </button>
        </div>
      )}
      <div className="mb-2 flex justify-between font-mono text-[10px]">
        <span className="text-ctp-subtext">
          {formatBytes(storageUsedBytes)}
          {storageTotalBytes ? ` / ${formatBytes(storageTotalBytes)}` : ""}
        </span>
        <span className="text-ctp-text">{pct}%</span>
      </div>
      <div className="bg-ctp-surface0 h-1 w-full overflow-hidden rounded-full">
        <div
          className="from-ctp-blue to-ctp-mauve h-1 rounded-full bg-gradient-to-r transition-[width] duration-300 ease-linear"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-ctp-subtext mb-2 px-2 text-[10px] font-bold tracking-widest uppercase">
      {children}
    </div>
  );
}

function PlaceLink({ item }: { item: PlaceItem }) {
  const location = useLocation();
  const isActive = item.to ? location.pathname === item.to : false;
  const accent = ACCENT_TEXT[item.accent];

  const inner = (
    <>
      <span className="flex items-center gap-3">
        <span className={cn("shrink-0", isActive ? "text-ctp-mauve" : accent)}>
          {item.icon}
        </span>
        {item.label}
      </span>
      {item.badge}
    </>
  );

  const className = cn(
    "flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm transition-colors group focus:outline-none",
    isActive
      ? "bg-ctp-surface1 text-ctp-mauve font-medium"
      : "text-ctp-subtext hover:bg-ctp-surface0 hover:text-ctp-text"
  );

  if (item.to) {
    return (
      <Link to={item.to} className={className}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={item.onClick} className={cn(className, "w-full text-left")}>
      {inner}
    </button>
  );
}

function ActiveConnectionSwitcher({
  connections,
  activeConnection,
  onSelectConnection,
}: {
  connections: S3Connection[];
  activeConnection: S3Connection | null;
  onSelectConnection?: (id: string) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="bg-ctp-surface0/30 text-ctp-text hover:bg-ctp-surface0 focus-visible:ring-ctp-mauve/40 group flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition-colors focus:outline-none focus-visible:ring-2"
        >
          <span className="flex min-w-0 items-center gap-3 overflow-hidden">
            <Server className="text-ctp-mauve size-4 shrink-0" />
            <span className="min-w-0 truncate">
              <span className="block truncate">
                {activeConnection?.name ?? "No connection"}
              </span>
              <span className="text-ctp-subtext flex items-center gap-1.5 text-[10px]">
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    activeConnection ? "bg-ctp-green" : "bg-ctp-red"
                  )}
                />
                {activeConnection ? "Connected" : "Offline"}
              </span>
            </span>
          </span>
          <ChevronsUpDown className="text-ctp-subtext group-hover:text-ctp-text size-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="text-ctp-subtext text-[10px] font-bold tracking-wider uppercase">
          Connections
        </DropdownMenuLabel>
        {connections.length === 0 && (
          <DropdownMenuItem disabled>No connections yet</DropdownMenuItem>
        )}
        {connections.map((c) => (
          <DropdownMenuItem
            key={c.id}
            onSelect={() => onSelectConnection?.(c.id)}
          >
            <Server className="size-4" />
            {c.name}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/setup" className="flex items-center gap-2">
            <Plus className="size-4" />
            Add a connection
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
