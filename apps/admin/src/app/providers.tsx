"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ToastProvider } from "@atpost/ui"
import { useState } from "react"

export function Providers({ children }: { children: React.ReactNode }) {
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
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  )
}
