import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Database, Plug, ServerCrash, ServerOff } from "@/lib/icons";

import { AppShell, AppStatusBar } from "@/components/app-shell";
import { AppSidebar } from "@/components/app-sidebar";
import { BreadcrumbPath } from "@/components/breadcrumb-path";
import { BucketList } from "@/components/bucket-list";
import { BucketGrid } from "@/components/bucket-grid";
import {
  CommandPalette,
  useCommandPaletteShortcut,
} from "@/components/command-palette";
import { DataToolbar, PrimaryAction } from "@/components/data-toolbar";
import { EmptyState } from "@/components/empty-state";
import { useBuckets } from "@/lib/api/buckets";
import { useConnections } from "@/lib/api/connections";
import { formatBytes, formatCount } from "@/lib/format";
import { useTrackNavEntry } from "@/lib/nav-history";
import { useActiveConnectionStore } from "@/stores/active-connection";
import { usePinnedBucketsStore } from "@/stores/pinned-buckets";
import { usePrefsStore } from "@/stores/prefs";
import type { Bucket } from "@server/types";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  useTrackNavEntry({ kind: "home" });
  const navigate = useNavigate();
  const connectionsQuery = useConnections();
  const connections = connectionsQuery.data ?? [];

  const storedActiveId = useActiveConnectionStore((s) => s.activeId);
  const setActive = useActiveConnectionStore((s) => s.setActive);
  const activeId =
    storedActiveId && connections.some((c) => c.id === storedActiveId)
      ? storedActiveId
      : connections[0]?.id ?? null;
  const activeConnection =
    connections.find((c) => c.id === activeId) ?? null;

  React.useEffect(() => {
    if (activeId && activeId !== storedActiveId) setActive(activeId);
  }, [activeId, storedActiveId, setActive]);

  const bucketsQuery = useBuckets(activeId);
  const buckets = bucketsQuery.data ?? [];

  const pinnedByConnection = usePinnedBucketsStore((s) => s.byConnection);
  const togglePin = usePinnedBucketsStore((s) => s.toggle);
  const pinnedNames = React.useMemo(
    () => new Set(activeId ? pinnedByConnection[activeId] ?? [] : []),
    [pinnedByConnection, activeId]
  );

  const [filter, setFilter] = React.useState("");
  const [paletteOpen, setPaletteOpen] = useCommandPaletteShortcut();

  const totalBytes = buckets.reduce((sum, b) => sum + (b.sizeBytes ?? 0), 0);

  const state = pageState({
    connections: connectionsQuery,
    buckets: bucketsQuery,
  });

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
      <div className="border-border bg-background flex h-12 shrink-0 items-center border-b px-4">
        <BreadcrumbPath />
      </div>

      <DataToolbar
        title={activeConnection?.name}
        filter={filter}
        onFilterChange={setFilter}
        primaryAction={
          <PrimaryAction onClick={() => setPaletteOpen(true)}>
            New bucket
          </PrimaryAction>
        }
      />

      <BucketsMain
        state={state}
        buckets={buckets}
        pinnedNames={pinnedNames}
        filter={filter}
        onTogglePin={(name) => activeId && togglePin(activeId, name)}
        onAddConnection={() => navigate({ to: "/setup" })}
        onOpenBucket={(name) =>
          navigate({
            to: "/buckets/$bucketName/$",
            params: { bucketName: name, _splat: "" },
          })
        }
      />

      <AppStatusBar
        left={
          state.kind === "ok" ? (
            <>
              <span>{formatCount(buckets.length)} buckets</span>
              <span>{formatBytes(totalBytes)} total</span>
            </>
          ) : null
        }
        right={<span>⌘K to search</span>}
      />

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        buckets={buckets}
        onSelectBucket={(name) =>
          navigate({
            to: "/buckets/$bucketName/$",
            params: { bucketName: name, _splat: "" },
          })
        }
      />
    </AppShell>
  );
}

type PageState =
  | { kind: "loading-connections" }
  | { kind: "api-unreachable"; message: string }
  | { kind: "no-connections" }
  | { kind: "loading-buckets" }
  | { kind: "buckets-error"; message: string }
  | { kind: "no-buckets" }
  | { kind: "ok" };

function pageState({
  connections,
  buckets,
}: {
  connections: ReturnType<typeof useConnections>;
  buckets: ReturnType<typeof useBuckets>;
}): PageState {
  if (connections.isLoading) return { kind: "loading-connections" };
  if (connections.error)
    return {
      kind: "api-unreachable",
      message:
        connections.error instanceof Error
          ? connections.error.message
          : "Unknown error",
    };
  if (!connections.data || connections.data.length === 0)
    return { kind: "no-connections" };
  if (buckets.isLoading) return { kind: "loading-buckets" };
  if (buckets.error)
    return {
      kind: "buckets-error",
      message:
        buckets.error instanceof Error ? buckets.error.message : "Unknown error",
    };
  if (!buckets.data || buckets.data.length === 0) return { kind: "no-buckets" };
  return { kind: "ok" };
}

function BucketsMain({
  state,
  buckets,
  pinnedNames,
  filter,
  onTogglePin,
  onAddConnection,
  onOpenBucket,
}: {
  state: PageState;
  buckets: Bucket[];
  pinnedNames: Set<string>;
  filter: string;
  onTogglePin: (name: string) => void;
  onAddConnection: () => void;
  onOpenBucket: (name: string) => void;
}) {
  switch (state.kind) {
    case "loading-connections":
    case "loading-buckets":
      return <BucketsLoading />;

    case "api-unreachable":
      return (
        <EmptyState
          icon={<ServerOff />}
          title="API unreachable"
          description={
            <>
              CloudShelf server isn't responding. Start it with{" "}
              <code className="bg-muted text-primary-text rounded px-1 py-0.5 font-mono text-[11px]">
                bun run dev:server
              </code>
              .
            </>
          }
        />
      );

    case "no-connections":
      return (
        <EmptyState
          icon={<Plug />}
          title="No connections yet"
          description="Add an S3-compatible endpoint to start browsing buckets."
          action={
            <PrimaryAction onClick={onAddConnection} icon={<Plug className="size-3.5" />}>
              Add connection
            </PrimaryAction>
          }
        />
      );

    case "buckets-error":
      return (
        <EmptyState
          icon={<ServerCrash />}
          title="Couldn't load buckets"
          description={
            <span className="font-mono text-[11px]">{state.message}</span>
          }
        />
      );

    case "no-buckets":
      return (
        <EmptyState
          icon={<Database />}
          title="No buckets"
          description="This connection doesn't have any buckets yet."
          action={
            <PrimaryAction onClick={() => console.log("create bucket")}>
              Create bucket
            </PrimaryAction>
          }
        />
      );

    case "ok":
      return <BucketsRenderer
        buckets={buckets}
        pinnedNames={pinnedNames}
        filter={filter}
        onTogglePin={onTogglePin}
        onOpenBucket={onOpenBucket}
      />;
  }
}

function BucketsRenderer(props: {
  buckets: Bucket[];
  pinnedNames: Set<string>;
  filter: string;
  onTogglePin: (name: string) => void;
  onOpenBucket: (name: string) => void;
}) {
  const viewMode = usePrefsStore((s) => s.viewMode);
  const Component = viewMode === "grid" ? BucketGrid : BucketList;
  return <Component {...props} sortKey="name" />;
}

function BucketsLoading() {
  return (
    <div className="flex-1 space-y-1 p-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="bg-muted/40 h-9 animate-pulse rounded-md"
          style={{ animationDelay: `${i * 60}ms` }}
        />
      ))}
    </div>
  );
}
