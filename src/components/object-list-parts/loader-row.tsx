import { Loader2 } from "@/lib/icons";

export function LoaderRow({ loading }: { loading: boolean }) {
  return (
    <div className="text-muted-foreground flex h-full items-center justify-center gap-2 font-mono text-[11px]">
      {loading ? (
        <>
          <Loader2 className="text-primary-text size-3.5 animate-spin" />
          Loading more…
        </>
      ) : (
        <span className="text-muted-foreground">scroll to load more</span>
      )}
    </div>
  );
}
