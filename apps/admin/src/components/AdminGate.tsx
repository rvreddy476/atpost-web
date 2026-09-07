"use client"

import { useQuery } from "@tanstack/react-query"
import { ShieldAlert, ShieldQuestion, TriangleAlert } from "lucide-react"
import api from "@atpost/api-client"
import { isForbidden, isUnauthenticated } from "@/lib/catalogue"
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
 * Four verdicts, because the probe genuinely comes back four ways:
 *
 *   allowed      2xx. Render the console.
 *   signed-out   401. Nobody is signed in, so nothing can be said about
 *                anyone's permissions yet — offer the way in instead.
 *   denied       403. A named account, refused. The scope sentence is true
 *                here and only here.
 *   unknown      everything else. See the note above the banner below.
 */
type Verdict = "allowed" | "signed-out" | "denied" | "unknown"

/**
 * Where a signed-out visitor is sent.
 *
 * A plain <a>, not next/link: this app is served under basePath "/admin", so
 * <Link href="/login"> would render "/admin/login". The shell rewrites /admin
 * rather than redirecting to it, so the browser is already on the shell's
 * origin and this resolves to the one real auth page — which then honours
 * ?redirect and comes back here.
 */
const SIGN_IN_HREF = "/login?redirect=/admin"

export function AdminGate({ children }: { children: React.ReactNode }) {
  const probe = useQuery<Verdict>({
    queryKey: catalogueKeys.gate,
    retry: false,
    staleTime: 60_000,
    queryFn: async () => {
      try {
        await api.get(`${CATALOGUE}/attribute-schema`)
        return "allowed"
      } catch (error) {
        if (isUnauthenticated(error)) return "signed-out"
        if (isForbidden(error)) return "denied"
        return "unknown"
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

  if (probe.data === "signed-out") {
    return (
      <main className="mx-auto max-w-lg px-4 py-20 text-center">
        <ShieldQuestion className="mx-auto mb-4 h-10 w-10 text-gray-400" aria-hidden="true" />
        <h1 className="text-xl font-semibold text-gray-900">You are not signed in</h1>
        <p className="mt-2 text-sm text-gray-600">
          Sign in to continue to the admin console. If the account you use does not hold an admin
          scope, you will be told that after signing in.
        </p>
        <a
          href={SIGN_IN_HREF}
          className="mt-6 inline-block rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-700"
        >
          Sign in
        </a>
      </main>
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
        <a href={SIGN_IN_HREF} className="mt-6 inline-block text-sm font-semibold text-gray-900 underline">
          Sign in as someone else
        </a>
      </main>
    )
  }

  return (
    <>
      {/*
        "unknown" still opens the gate — a 500, a dropped connection, a 404 from
        an older gateway. That much is kept on purpose: a UX gate that locks the
        founder out of three read-only queues because a proxy hiccuped is worse
        than the thing it guards against, and the server is still the one saying
        no to every request behind it.

        Failing open in SILENCE was the actual defect. The console then looks
        exactly like a working one, so each button that fails afterwards reads
        as a bug in that button rather than as an access check that never
        happened. The banner is the fix: the gate says out loud that it does not
        know, and offers to ask again.
      */}
      {probe.data === "unknown" ? (
        <div
          role="status"
          className="border-b border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          <div className="mx-auto flex max-w-6xl items-start gap-2">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p className="flex-1">
              We could not check your admin access — the check itself failed, which says nothing
              about your permissions. The console is open, but the server may still refuse anything
              you try.
            </p>
            <button
              type="button"
              onClick={() => probe.refetch()}
              className="shrink-0 font-semibold underline"
            >
              Check again
            </button>
          </div>
        </div>
      ) : null}
      {children}
    </>
  )
}
