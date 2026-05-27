import * as React from "react";
import { toast } from "sonner";

import { CheckIcon, Copy, Eye, EyeOff } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useConnections } from "@/lib/api/connections";
import {
  highlightToTokens,
  type ShikiLang,
  type ThemedToken,
} from "@/lib/highlighter";
import { useCopied } from "@/lib/use-copied";
import { cn } from "@/lib/utils";
import { useSnippetsStore } from "@/stores/snippets";
import type { S3Connection } from "@server/types";

const MASK = "********";

type SnippetKey = "aws" | "boto3" | "mc" | "rclone";

const TABS: { key: SnippetKey; label: string; lang: ShikiLang }[] = [
  { key: "aws", label: "aws-cli", lang: "bash" },
  { key: "boto3", label: "boto3", lang: "python" },
  { key: "mc", label: "mc", lang: "bash" },
  { key: "rclone", label: "rclone", lang: "ini" },
];

function awsSnippet(c: S3Connection, secret: string): string {
  return [
    "# Configure a one-time profile",
    `aws configure set aws_access_key_id ${c.accessKeyId} --profile cloudshelf`,
    `aws configure set aws_secret_access_key ${secret} --profile cloudshelf`,
    `aws configure set region ${c.region} --profile cloudshelf`,
    "",
    "# List buckets",
    `aws s3 ls --endpoint-url ${c.endpoint} --profile cloudshelf`,
  ].join("\n");
}

function boto3Snippet(c: S3Connection, secret: string): string {
  const extra = c.forcePathStyle
    ? `\n    config=boto3.session.Config(s3={"addressing_style": "path"}),`
    : "";
  return [
    "import boto3",
    "",
    `s3 = boto3.client(`,
    `    "s3",`,
    `    endpoint_url="${c.endpoint}",`,
    `    region_name="${c.region}",`,
    `    aws_access_key_id="${c.accessKeyId}",`,
    `    aws_secret_access_key="${secret}",${extra}`,
    `)`,
    "",
    `for b in s3.list_buckets()["Buckets"]:`,
    `    print(b["Name"])`,
  ].join("\n");
}

function mcSnippet(c: S3Connection, secret: string): string {
  return [
    `mc alias set cloudshelf ${c.endpoint} ${c.accessKeyId} ${secret} --api S3v4`,
    `mc ls cloudshelf`,
  ].join("\n");
}

function rcloneSnippet(c: S3Connection, secret: string): string {
  const lines = [
    "[cloudshelf]",
    "type = s3",
    "provider = Other",
    `endpoint = ${c.endpoint}`,
    `region = ${c.region}`,
    `access_key_id = ${c.accessKeyId}`,
    `secret_access_key = ${secret}`,
  ];
  if (c.forcePathStyle) lines.push("force_path_style = true");
  return lines.join("\n");
}

function buildSnippet(
  key: SnippetKey,
  conn: S3Connection,
  secret: string
): string {
  switch (key) {
    case "aws":
      return awsSnippet(conn, secret);
    case "boto3":
      return boto3Snippet(conn, secret);
    case "mc":
      return mcSnippet(conn, secret);
    case "rclone":
      return rcloneSnippet(conn, secret);
  }
}

/**
 * Ready-to-paste CLI/SDK snippets for the saved connection. Mounted once at the
 * root; opened by setting `openConnectionId` in `useSnippetsStore`. The secret
 * key is masked in the on-screen view by default; "Reveal" swaps it in. Copy
 * always copies the real snippet so the fast path stays one-click.
 */
export function ConnectionSnippetsDialog() {
  const openConnectionId = useSnippetsStore((s) => s.openConnectionId);
  const close = useSnippetsStore((s) => s.close);
  const connectionsQuery = useConnections();
  const conn =
    connectionsQuery.data?.find((c) => c.id === openConnectionId) ?? null;

  const open = openConnectionId !== null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>CLI snippets</DialogTitle>
          <DialogDescription className="font-mono text-xs">
            {conn ? (
              <>
                <code className="break-all">{conn.name}</code>
                <span className="text-muted-foreground"> · {conn.endpoint}</span>
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        {conn ? (
          <SnippetsBody conn={conn} />
        ) : (
          <div className="text-muted-foreground py-6 text-center font-mono text-xs">
            Connection not found.
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={close}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SnippetsBody({ conn }: { conn: S3Connection }) {
  const [active, setActive] = React.useState<SnippetKey>("aws");
  const [revealed, setRevealed] = React.useState(false);

  const activeTab = TABS.find((t) => t.key === active)!;
  const realSnippet = buildSnippet(active, conn, conn.secretAccessKey);
  const displaySnippet = revealed
    ? realSnippet
    : buildSnippet(active, conn, MASK);

  const [copied, flashCopied] = useCopied();
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(realSnippet);
      flashCopied();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't copy");
    }
  };

  return (
    // min-w-0 on the outer grid cell stops <pre>'s intrinsic content width
    // (long aws secrets, single-line mc command) from pushing past the
    // dialog's max-w-2xl. Without it, grid items default to min-width: auto
    // and the dialog visibly stretches.
    <div className="min-w-0 space-y-4">
      <Tabs
        value={active}
        onValueChange={(v) => setActive(v as SnippetKey)}
        className="min-w-0"
      >
        <div className="flex min-w-0 items-center justify-between gap-2">
          <TabsList>
            {TABS.map((t) => (
              <TabsTrigger key={t.key} value={t.key} className="font-mono">
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setRevealed((r) => !r)}
              title={revealed ? "Hide secret key" : "Reveal secret key"}
            >
              {revealed ? (
                <>
                  <EyeOff /> Hide
                </>
              ) : (
                <>
                  <Eye /> Reveal
                </>
              )}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleCopy}
              className={copied ? "text-success" : undefined}
            >
              {copied ? (
                <>
                  <CheckIcon /> Copied
                </>
              ) : (
                <>
                  <Copy /> Copy
                </>
              )}
            </Button>
          </div>
        </div>

        <TabsContent value={active} className="mt-3 min-w-0">
          <HighlightedBlock code={displaySnippet} lang={activeTab.lang} />
        </TabsContent>
      </Tabs>

      <p className="text-muted-foreground font-mono text-[10px] leading-relaxed">
        Copy includes the real secret even while hidden. Treat the snippet like
        a credential — anyone with it can read and write to this endpoint.
      </p>
    </div>
  );
}

/**
 * Shiki-highlighted code block. Falls through to plain pre-formatted text while
 * the worker tokenizes (or if it errors). Reuses the shared `highlightToTokens`
 * worker so the snippets dialog doesn't spin up a second Shiki instance.
 */
function HighlightedBlock({ code, lang }: { code: string; lang: ShikiLang }) {
  const [tokens, setTokens] = React.useState<ThemedToken[][] | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setTokens(null);
    highlightToTokens(code, lang)
      .then((toks) => {
        if (!cancelled) setTokens(toks);
      })
      .catch(() => {
        if (!cancelled) setTokens(null);
      });
    return () => {
      cancelled = true;
    };
  }, [code, lang]);

  return (
    <pre
      className={cn(
        "border-border bg-input-bg/50 text-foreground max-h-[55vh] overflow-auto rounded-md border p-4 font-mono text-[11px] leading-relaxed whitespace-pre"
      )}
      // Radix Dialog wraps in react-remove-scroll which can swallow wheel
      // events on elements that have horizontal overflow but no vertical
      // overflow (the snippet block, almost always). Translate shift+wheel
      // and trackpad horizontal nudges into scrollLeft explicitly so the
      // long aws-cli / mc lines are reachable.
      onWheel={(e) => {
        const el = e.currentTarget;
        if (el.scrollWidth <= el.clientWidth) return;
        const horizontal = e.deltaX !== 0 ? e.deltaX : e.shiftKey ? e.deltaY : 0;
        if (horizontal === 0) return;
        el.scrollLeft += horizontal;
        e.preventDefault();
      }}
    >
      {tokens ? renderTokens(tokens) : code}
    </pre>
  );
}

function renderTokens(tokens: ThemedToken[][]): React.ReactNode {
  return tokens.map((line, i) => (
    <React.Fragment key={i}>
      {line.length === 0 ? (
        " "
      ) : (
        line.map((t, j) => (
          <span key={j} style={tokenStyle(t)}>
            {t.content}
          </span>
        ))
      )}
      {"\n"}
    </React.Fragment>
  ));
}

/** Shiki's FontStyle is a bitfield: Italic=1, Bold=2, Underline=4. NotSet=-1
 *  (all bits set), so gate on `> 0` to avoid styling unstyled tokens. */
function tokenStyle(t: ThemedToken): React.CSSProperties {
  const fs = t.fontStyle ?? 0;
  const styled = fs > 0;
  return {
    color: t.color,
    backgroundColor: t.bgColor,
    fontStyle: styled && (fs & 1) !== 0 ? "italic" : undefined,
    fontWeight: styled && (fs & 2) !== 0 ? "bold" : undefined,
    textDecoration: styled && (fs & 4) !== 0 ? "underline" : undefined,
  };
}
