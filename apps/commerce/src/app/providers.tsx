"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { SessionProvider } from "@atpost/api-client/session"
import { useState } from "react"

// Commerce-zone providers. Intentionally lean: React Query, and the session.
// (postbook's Providers also wired chat presence + the message hub, which
// aren't part of the commerce surface.)
//
// `initialSignedIn` comes from the layout, which read it from the request's
// own cookies. Passing it down is what makes the header render as a signed-in
// header on the FIRST paint instead of after an effect — the shop's chrome
// used to resolve "am I signed in?" one tick late and visibly correct itself.
//
// Auth itself is still carried by @atpost/api-client, which is why there is no
// auth provider here: the session is a cookie auth-service set, shared by
// every zone and every tab, and this only reports on it.
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
      })
  )

  return (
    <QueryClientProvider client={queryClient}>
      {/* Inside the query client: useCapabilities is a React Query hook that
          asks the session whether there is anyone to ask about. */}
      <SessionProvider initialSignedIn={initialSignedIn}>{children}</SessionProvider>
    </QueryClientProvider>
  )
}
