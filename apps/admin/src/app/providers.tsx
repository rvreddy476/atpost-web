"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ToastProvider } from "@atpost/ui"
import { useState } from "react"

// No consumer SessionProvider here: the console's session is the admin session
// (admin_* cookies), and whether it exists is answered by the server —
// /v1/admin/me in AdminShell — not by the consumer csrf_token presence cookie.
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
