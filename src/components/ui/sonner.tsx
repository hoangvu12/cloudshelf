"use client"

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "@/lib/icons"
import { Toaster as Sonner, type ToasterProps } from "sonner"

/**
 * Every theme we ship is dark-aesthetic — pinning sonner to "dark" so it
 * doesn't fall back to its light styles when next-themes hands it a palette
 * name like "mocha" that it doesn't recognize.
 *
 * Colors live in styles.css under "Sonner toast styling" — a single place
 * keeps the per-type tinting (icon + left accent bar) in sync with the active
 * palette via our semantic tokens.
 */
const Toaster = (props: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      className="toaster"
      icons={{
        success: <CircleCheckIcon className="text-success size-4" />,
        info: <InfoIcon className="text-info size-4" />,
        warning: <TriangleAlertIcon className="text-accent-yellow size-4" />,
        error: <OctagonXIcon className="text-destructive size-4" />,
        loading: <Loader2Icon className="text-primary-text size-4 animate-spin" />,
      }}
      {...props}
    />
  )
}

export { Toaster }
