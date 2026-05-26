/**
 * Tiny typed fetch wrapper around the CloudShelf API.
 *
 * - All requests go through `/api/*`. In dev, Vite proxies to the Bun server on :3001.
 *   In prod the same Bun server serves both the SPA and /api on one port.
 * - Throws ApiClientError on non-2xx so callers (and React Query) can branch on it.
 */

import type { ApiError } from "@server/types";

export class ApiClientError extends Error {
  readonly status: number;
  readonly detail?: string;
  constructor(message: string, status: number, detail?: string) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.detail = detail;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
}

export async function apiFetch<T>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const { method = "GET", body, signal } = options;
  const res = await fetch(`/api${path}`, {
    method,
    headers: body !== undefined ? { "content-type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  });

  if (!res.ok) {
    let payload: ApiError | undefined;
    try {
      payload = (await res.json()) as ApiError;
    } catch {
      // empty body / non-JSON
    }
    throw new ApiClientError(
      payload?.error ?? `Request failed (${res.status})`,
      res.status,
      payload?.detail
    );
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
