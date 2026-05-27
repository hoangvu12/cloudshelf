import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { AppShell, AppStatusBar } from "@/components/app-shell";
import { AppSidebar } from "@/components/app-sidebar";
import { BreadcrumbPath } from "@/components/breadcrumb-path";
import { BucketsMain } from "@/components/buckets-main";
import { bucketsPageState } from "@/components/buckets-page-state";
import { BucketSettingsDialog, CreateBucketDialog } from "@/components/bucket-dialogs";
import {
  CommandPalette,
  useCommandPaletteShortcut,
} from "@/components/command-palette";
import { DataToolbar, PrimaryAction } from "@/components/data-toolbar";
import { useBuckets, useCreateBucket } from "@/lib/api/buckets";
import { useConnections } from "@/lib/api/connections";
import { formatCount } from "@/lib/format";
import { useTrackNavEntry } from "@/lib/nav-history";
import { useActiveConnectionStore } from "@/stores/active-connection";
import { usePinnedBucketsStore } from "@/stores/pinned-buckets";

export function HomePage() {
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
  const [createBucketOpen, setCreateBucketOpen] = React.useState(false);
  const [settingsBucket, setSettingsBucket] = React.useState<string | null>(null);

  const createBucket = useCreateBucket(activeId, {
    onSuccess: ({ name }) => {
      toast.success(`Bucket "${name}" created`);
      setCreateBucketOpen(false);
    },
    onError: (err) => toast.error(err.message),
  });

  const state = bucketsPageState({
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
          <PrimaryAction
            onClick={() => setCreateBucketOpen(true)}
            disabled={!activeId}
          >
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
        onCreateBucket={() => setCreateBucketOpen(true)}
        onOpenBucket={(name) =>
          navigate({
            to: "/buckets/$bucketName/$",
            params: { bucketName: name, _splat: "" },
          })
        }
        onOpenSettings={(name) => setSettingsBucket(name)}
      />

      <AppStatusBar
        left={
          state.kind === "ok" ? (
            <span>{formatCount(buckets.length)} buckets</span>
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

      <CreateBucketDialog
        open={createBucketOpen}
        onOpenChange={setCreateBucketOpen}
        pending={createBucket.isPending}
        onSubmit={(name) => createBucket.mutate({ name })}
      />

      <BucketSettingsDialog
        open={settingsBucket !== null}
        onOpenChange={(o) => !o && setSettingsBucket(null)}
        connectionId={activeId}
        bucket={settingsBucket}
      />
    </AppShell>
  );
}
