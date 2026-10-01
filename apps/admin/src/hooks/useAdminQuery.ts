"use client"

import { useQuery } from "@tanstack/react-query"
import api from "@/lib/admin/api"
import { readList, readObject, type Row } from "@/lib/admin/data"
import { adminErrorMessage, isStepUpRequired } from "@/lib/admin/mutation"

/** Every console read is keyed by its URL (query string included) under ["admin", app]. */
export const adminKey = (app: string, url?: string) => (url ? ["admin", app, url] : ["admin", app])

export interface AdminRead<T> {
  data: T
  raw: unknown
  isLoading: boolean
  isError: boolean
  /** A sentence for the error state, or null. */
  error: string | null
  needsStepUp: boolean
  refetch: () => void
}

function useAdminRaw(app: string, url: string, enabled: boolean, refetchInterval?: number) {
  return useQuery({
    queryKey: adminKey(app, url),
    queryFn: async () => (await api.get(url)).data as unknown,
    enabled,
    // A 403 or 503 will not fix itself on a retry; the error state offers one.
    retry: false,
    // Only while the tab is visible (react-query's default for intervals).
    refetchInterval: refetchInterval ?? false,
  })
}

/**
 * A list route. `rows` is [] while loading, on error, and for a `null` list.
 * `refetchInterval` (ms) re-reads it on a timer, for lists that change by
 * themselves (Live → live now).
 */
export function useAdminList(
  app: string,
  url: string,
  { enabled = true, keys, refetchInterval }: { enabled?: boolean; keys?: readonly string[]; refetchInterval?: number } = {},
): AdminRead<Row[]> {
  const q = useAdminRaw(app, url, enabled, refetchInterval)
  return {
    data: q.data === undefined ? [] : readList(q.data, keys),
    raw: q.data,
    isLoading: enabled && q.isLoading,
    isError: q.isError,
    error: q.isError ? adminErrorMessage(q.error, "This list could not be loaded.") : null,
    needsStepUp: q.isError && isStepUpRequired(q.error),
    refetch: () => void q.refetch(),
  }
}

/** An object route (stats, a detail view). */
export function useAdminObject(app: string, url: string, { enabled = true }: { enabled?: boolean } = {}): AdminRead<Row | null> {
  const q = useAdminRaw(app, url, enabled)
  return {
    data: q.data === undefined ? null : readObject(q.data),
    raw: q.data,
    isLoading: enabled && q.isLoading,
    isError: q.isError,
    error: q.isError ? adminErrorMessage(q.error, "This could not be loaded.") : null,
    needsStepUp: q.isError && isStepUpRequired(q.error),
    refetch: () => void q.refetch(),
  }
}
