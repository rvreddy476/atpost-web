"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useState } from "react"

// Commerce-zone providers. Intentionally lean: just React Query. (postbook's
// Providers also wired chat presence + the message hub, which aren't part of
// the commerce surface.) Auth is carried by @atpost/api-client (Bearer + 401→
// refresh), so no auth provider is needed here.
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { refetchOnWindowFocus: false, retry: false },
        },
      })
  )

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
