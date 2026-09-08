"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { SessionProvider } from "@atpost/api-client/session"
import { ToastProvider } from "@atpost/ui"
import { useState } from "react"

// `initialSignedIn` is read from the request's cookies by the layout. AdminGate
// renders "You are not signed in" the moment the session is known to be empty,
// so without the seed an administrator with a perfectly good session sees that
// refusal for a frame on every hard load. With it, the gate's first paint is
// already "checking your admin access".
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
        defaultOptions: { queries: { refetchOnWindowFocus: false, retry: false } },
      })
  )
  return (
    <QueryClientProvider client={queryClient}>
      {/* Inside the query client, because every catalogue mutation's onError
          reports through useToast(). */}
      <SessionProvider initialSignedIn={initialSignedIn}>
        <ToastProvider>{children}</ToastProvider>
      </SessionProvider>
    </QueryClientProvider>
  )
}
