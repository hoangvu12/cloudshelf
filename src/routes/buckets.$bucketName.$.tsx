import { createFileRoute } from "@tanstack/react-router";

import { BucketPage } from "@/components/pages/bucket-page";

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
