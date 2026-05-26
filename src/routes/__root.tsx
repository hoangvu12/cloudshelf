import { Outlet, createRootRoute } from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { UploadPanel } from "@/components/upload-panel";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  return (
    <TooltipProvider delayDuration={150}>
      <Outlet />
      {/* Lives at the root so in-flight uploads survive navigation between buckets/prefixes. */}
      <UploadPanel />
      <Toaster position="bottom-right" richColors closeButton />
    </TooltipProvider>
  );
}
