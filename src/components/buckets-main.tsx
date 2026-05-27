import { Database, Plug, ServerCrash, ServerOff } from "@/lib/icons";

import { BucketsLoading } from "@/components/buckets-loading";
import { BucketsRenderer } from "@/components/buckets-renderer";
import { PrimaryAction } from "@/components/data-toolbar";
import { EmptyState } from "@/components/empty-state";
import type { BucketsPageState } from "@/components/buckets-page-state";
import type { Bucket } from "@server/types";

export function BucketsMain({
  state,
  buckets,
  pinnedNames,
  filter,
  onTogglePin,
  onAddConnection,
  onCreateBucket,
  onOpenBucket,
  onOpenSettings,
}: {
  state: BucketsPageState;
  buckets: Bucket[];
  pinnedNames: Set<string>;
  filter: string;
  onTogglePin: (name: string) => void;
  onAddConnection: () => void;
  onCreateBucket: () => void;
  onOpenBucket: (name: string) => void;
  onOpenSettings: (name: string) => void;
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
            <PrimaryAction onClick={onCreateBucket}>
              Create bucket
            </PrimaryAction>
          }
        />
      );

    case "ok":
      return (
        <BucketsRenderer
          buckets={buckets}
          pinnedNames={pinnedNames}
          filter={filter}
          onTogglePin={onTogglePin}
          onOpenBucket={onOpenBucket}
          onOpenSettings={onOpenSettings}
        />
      );
  }
}
