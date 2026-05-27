import { createFileRoute } from "@tanstack/react-router";

import { SetupPage } from "@/components/pages/setup-page";

export const Route = createFileRoute("/setup")({
  component: SetupPage,
});
