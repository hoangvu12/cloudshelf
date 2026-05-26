import { Outlet, createRootRoute } from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  return (
    <TooltipProvider delayDuration={150}>
      <Outlet />
      <Toaster position="bottom-right" richColors closeButton />
    </TooltipProvider>
  );
}
