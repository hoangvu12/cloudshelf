import { Outlet } from "@tanstack/react-router";

import { AuthGate } from "@/components/auth-gate";
import { ConnectionSnippetsDialog } from "@/components/connection-snippets";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { UploadPanel } from "@/components/upload-panel";
import { ShortcutsDialog, useShortcutsHelp } from "@/lib/shortcuts";

export function RootLayout() {
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
