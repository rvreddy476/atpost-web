"use client"

import { useQuery } from "@tanstack/react-query"
import { ShieldAlert, ShieldQuestion } from "lucide-react"
import api from "@atpost/api-client"
import { isForbidden } from "@/lib/catalogue"
import { CATALOGUE, catalogueKeys } from "@/hooks/useCatalogue"

/**
 * Renders the console only for a caller the API is willing to answer.
 *
 * THIS IS A UX GATE, NOT A SECURITY BOUNDARY. Every route behind it is still
 * enforced by admin-service on every request; the server remains the authority
 * and this component can be bypassed by anyone with a devtools console. What it
 * buys is that someone without the scope sees one honest sentence instead of a
 * taxonomy editor whose every button fails.
 *
 * The probe is the API's own answer, deliberately: the access token carries no
 * `scopes` claim for any current user, and there is no "am I an admin"
 * endpoint, so there is nothing to decode and nothing to ask. A 2xx on the
 * catalogue's own read route is the only truthful signal available.
 *
 * Anything that is not an explicit 401/403 — a 404 from an older gateway, a
 * dropped connection, a 500 — opens the gate rather than closing it. A gate
 * that locks the founder out of three read-only queues because a proxy hiccuped
 * would be worse than the thing it is guarding against, and the server is still
 * the one saying no.
 */
export function AdminGate({ children }: { children: React.ReactNode }) {
  const probe = useQuery<"allowed" | "denied">({
    queryKey: catalogueKeys.gate,
    retry: false,
    staleTime: 60_000,
    queryFn: async () => {
      try {
        await api.get(`${CATALOGUE}/attribute-schema`)
        return "allowed"
      } catch (error) {
        if (isForbidden(error)) return "denied"
        return "allowed"
      }
    },
  })

  if (probe.isLoading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-16 text-center text-sm text-gray-500">
        <ShieldQuestion className="mx-auto mb-3 h-6 w-6 text-gray-400" aria-hidden="true" />
        Checking your admin access…
      </div>
    )
  }

  if (probe.data === "denied") {
    return (
      <main className="mx-auto max-w-lg px-4 py-20 text-center">
        <ShieldAlert className="mx-auto mb-4 h-10 w-10 text-gray-400" aria-hidden="true" />
        <h1 className="text-xl font-semibold text-gray-900">You do not have admin access</h1>
        <p className="mt-2 text-sm text-gray-600">
          This console is limited to accounts holding the moderator, admin or superadmin scope. Ask
          an existing administrator to grant yours, then sign in again.
        </p>
      </main>
    )
  }

  return <>{children}</>
}
