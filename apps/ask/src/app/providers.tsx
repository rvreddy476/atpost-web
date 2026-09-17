"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { SessionProvider } from "@atpost/api-client/session"
import { ToastProvider } from "@atpost/ui"
import { useState } from "react"

/**
 * Ask-zone providers: React Query, the session, and toasts.
 *
 * Copied from apps/commerce. No retries on 401/403/404 — those are answers,
 * not blips, and the gateway's dormant-gate 404 in particular must reach the
 * screen at once as "Ask isn't available yet" rather than after two retries.
 *
 * `initialSignedIn` comes from the layout, which read the request's own
 * cookie, so the first paint already knows which feed tabs to draw.
 */
export function Providers({
  initialSignedIn = null,
  children,
}: {
  initialSignedIn?: boolean | null
  children: React.ReactNode
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: (failureCount, error) => {
              const status = (error as { response?: { status?: number } })?.response?.status
              return status !== 401 && status !== 403 && status !== 404 && failureCount < 2
            },
            staleTime: 30_000,
          },
        },
      }),
  )

  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider initialSignedIn={initialSignedIn}>
        <ToastProvider position="bottom-center">{children}</ToastProvider>
      </SessionProvider>
    </QueryClientProvider>
  )
}
