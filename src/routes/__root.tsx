import { createRootRoute } from "@tanstack/react-router";

import { RootLayout } from "@/components/pages/root-layout";

export const Route = createRootRoute({
  component: RootLayout,
});
