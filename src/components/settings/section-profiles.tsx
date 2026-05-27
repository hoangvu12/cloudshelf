import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Cloud,
  Database,
  Edit2,
  Plus,
  Server,
  Terminal,
  Trash2,
} from "@/lib/icons";
import { useDeleteConnection } from "@/lib/api/connections";
import { cn } from "@/lib/utils";
import { useActiveConnectionStore } from "@/stores/active-connection";
import { useSnippetsStore } from "@/stores/snippets";
import type { S3Connection } from "@server/types";

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

export function ProfilesSection({
  connections,
  activeId,
}: {
  connections: S3Connection[];
  activeId: string | null;
}) {
  const navigate = useNavigate();
  const deleteConnection = useDeleteConnection();
  const setActive = useActiveConnectionStore((s) => s.setActive);
  const openSnippets = useSnippetsStore((s) => s.open);

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
                onClick={() => openSnippets(c.id)}
                className="text-muted-foreground hover:bg-surface-1 hover:text-foreground rounded p-2 transition-colors"
                title="CLI snippets"
              >
                <Terminal className="size-4" />
              </button>
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
