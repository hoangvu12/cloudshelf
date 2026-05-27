import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Plug, ServerOff } from "@/lib/icons";

import { AppShell } from "@/components/app-shell";
import { AppSidebar } from "@/components/app-sidebar";
import { EmptyState } from "@/components/empty-state";
import { ObjectBrowser } from "@/components/object-browser";
import {
  FilePreviewDrawer,
  FilePreviewPanel,
} from "@/components/file-preview-panel";
import {
  CommandPalette,
  useCommandPaletteShortcut,
} from "@/components/command-palette";
import { usePreviewStore } from "@/stores/preview";
import { useBuckets } from "@/lib/api/buckets";
import { useConnections } from "@/lib/api/connections";
import { useTrackNavEntry } from "@/lib/nav-history";
import { useActiveConnectionStore } from "@/stores/active-connection";

/**
 * /buckets/$bucketName/$  — splat captures the prefix (e.g. "photos/2025").
 * The empty splat means the bucket root.
 *
 * The route owns connection resolution + shell composition; ObjectBrowser
 * owns everything inside the content area (toolbar, list, dialogs, uploads).
 */
export const Route = createFileRoute("/buckets/$bucketName/$")({
  component: BucketPage,
});

function BucketPage() {
  const params = Route.useParams();
  const bucket = params.bucketName;
  const splat = params._splat ?? "";
  // The router gives us the URL fragment as-is — strip any trailing slash so
  // the prefix we hand to the API is canonical (always either "" or "x/y/").
  const prefix = splat ? (splat.endsWith("/") ? splat : splat + "/") : "";

  useTrackNavEntry({ kind: "bucket", bucket, prefix });

  const navigate = useNavigate();
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

  // Sidebar shows the current connection's bucket list so the user can hop
  // between buckets without going back to the home view.
  const bucketsQuery = useBuckets(activeId);
  const buckets = bucketsQuery.data ?? [];

  const [paletteOpen, setPaletteOpen] = useCommandPaletteShortcut();
  // The desktop aside stays mounted and animates its width — `previewOpen`
  // drives whether it occupies space, and the panel itself returns null when
  // there's nothing to show, so the collapsed state is just an empty 0-width
  // slot.
  const previewOpen = usePreviewStore((s) => s.openKey !== null);

  if (connectionsQuery.isLoading) {
    return <ShellWithEmpty />;
  }

  if (connectionsQuery.error) {
    return (
      <ShellWithEmpty>
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
      </ShellWithEmpty>
    );
  }

  if (!activeConnection) {
    return (
      <ShellWithEmpty>
        <EmptyState
          icon={<Plug />}
          title="No connection selected"
          description="Add an S3-compatible endpoint to start browsing."
          action={
            <button
              type="button"
              onClick={() => navigate({ to: "/setup" })}
              className="bg-primary text-primary-foreground inline-flex items-center gap-2 rounded px-3 py-1.5 font-mono text-xs font-bold transition-opacity hover:opacity-90"
            >
              <Plug className="size-3.5" />
              Add connection
            </button>
          }
        />
      </ShellWithEmpty>
    );
  }

  return (
    <AppShell
      sidebar={
        <AppSidebar
          connections={connections}
          activeConnection={activeConnection}
          onSelectConnection={(id) => {
            setActive(id);
            // Different connection → bucket might not exist there; bounce home.
            navigate({ to: "/" });
          }}
        />
      }
      previewOpen={previewOpen}
      previewPanel={
        <FilePreviewPanel
          connectionId={activeConnection.id}
          bucket={bucket}
          prefix={prefix}
        />
      }
    >
      <ObjectBrowser
        connectionId={activeConnection.id}
        bucket={bucket}
        prefix={prefix}
      />

      <FilePreviewDrawer
        connectionId={activeConnection.id}
        bucket={bucket}
        prefix={prefix}
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

/** Bare shell used for the pre-connection states (loading / API down / no conn). */
function ShellWithEmpty({ children }: { children?: React.ReactNode }) {
  return (
    <AppShell
      sidebar={
        <AppSidebar
          connections={[]}
          activeConnection={null}
        />
      }
    >
      {children ?? (
        <div className="flex-1 space-y-1 p-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="bg-muted/40 h-9 animate-pulse rounded"
              style={{ animationDelay: `${i * 60}ms` }}
            />
          ))}
        </div>
      )}
    </AppShell>
  );
}
