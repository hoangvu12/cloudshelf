import * as React from "react";
import {
  Outlet,
  createRootRoute,
  useLocation,
  useNavigate,
} from "@tanstack/react-router";
import { ConnectionSnippetsDialog } from "@/components/connection-snippets";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { UploadPanel } from "@/components/upload-panel";
import { Loader2 } from "@/lib/icons";
import { ApiClientError } from "@/lib/api/client";
import { useMe } from "@/lib/api/auth";
import { ShortcutsDialog, useShortcutsHelp } from "@/lib/shortcuts";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  const [helpOpen, setHelpOpen] = useShortcutsHelp();
  return (
    <TooltipProvider delayDuration={150}>
      <AuthGate>
        <Outlet />
        {/* Lives at the root so in-flight uploads survive navigation between buckets/prefixes. */}
        <UploadPanel />
        <ShortcutsDialog open={helpOpen} onOpenChange={setHelpOpen} />
        <ConnectionSnippetsDialog />
      </AuthGate>
      <Toaster position="bottom-right" richColors closeButton />
    </TooltipProvider>
  );
}

/**
 * Gates everything except /login behind a valid session. While the initial
 * /me request is in flight we show a small spinner so we don't flash a
 * half-rendered app before the redirect.
 */
function AuthGate({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const isLoginRoute = location.pathname === "/login";
  const me = useMe();

  const isUnauthorized =
    me.error instanceof ApiClientError && me.error.status === 401;

  React.useEffect(() => {
    if (!isLoginRoute && isUnauthorized) {
      navigate({ to: "/login" });
    }
  }, [isLoginRoute, isUnauthorized, navigate]);

  if (isLoginRoute) return <>{children}</>;
  if (me.isLoading || isUnauthorized) return <AuthLoading />;
  return <>{children}</>;
}

function AuthLoading() {
  return (
    <div className="bg-background text-muted-foreground flex min-h-screen items-center justify-center">
      <Loader2 className="size-6 animate-spin" />
    </div>
  );
}
