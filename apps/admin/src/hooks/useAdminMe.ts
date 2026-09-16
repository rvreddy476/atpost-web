"use client"

import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import api, { ADMIN_SESSION_ROUTES } from "@/lib/admin/api"
import { buildAdminNav, mfaBlocks, parseAdminMe, type AdminMe, type AdminNavModel } from "@/lib/admin/me"
import { MFA_REQUIRED, adminErrorMessage, readApiError } from "@/lib/admin/mutation"

export const ADMIN_ME_KEY = ["admin", "me"] as const

/**
 * The console's one question to the server: who is this admin, and what may
 * they see. Every verdict other than "ready" renders no navigation at all.
 *
 *   loading     first answer pending
 *   signed-out  401 (including ACTOR_REQUIRED)
 *   mfa         403 MFA_REQUIRED, or /me says MFA is required and unverified
 *   denied      403 for any other reason — signed in, but not an admin
 *   error       anything else (503 PERMISSIONS_UNAVAILABLE, network,
 *               unreadable body): FAIL CLOSED
 *   ready       `me` and `nav` are usable
 */
export type AdminAccess =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "mfa"; me: AdminMe | null }
  | { status: "denied"; message: string | null }
  | { status: "error"; message: string }
  | { status: "ready"; me: AdminMe; nav: AdminNavModel }

class UnreadableMe extends Error {}

export function useAdminMe(enabled = true) {
  const query = useQuery({
    queryKey: ADMIN_ME_KEY,
    // Off on the sign-in page: there is no session to ask about yet.
    enabled,
    queryFn: async () => {
      const response = await api.get("/v1/admin/me")
      const me = parseAdminMe(response.data)
      if (!me) throw new UnreadableMe("The server's answer about your access could not be read.")
      return me
    },
    retry: false,
    // Grants, revocations and the step-up window should show without a reload.
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  })

  const access = useMemo<AdminAccess>(() => {
    if (query.isPending) return { status: "loading" }
    if (query.isError) {
      const err = readApiError(query.error)
      if (err.status === 401) return { status: "signed-out" }
      if (err.status === 403 && err.code === MFA_REQUIRED) return { status: "mfa", me: null }
      if (err.status === 403) return { status: "denied", message: err.message }
      return {
        status: "error",
        message: query.error instanceof UnreadableMe ? query.error.message : adminErrorMessage(query.error, "The access check failed."),
      }
    }
    const me = query.data
    if (mfaBlocks(me)) return { status: "mfa", me }
    return { status: "ready", me, nav: buildAdminNav(me) }
  }, [query.isPending, query.isError, query.error, query.data])

  return { access, refetch: query.refetch, isFetching: query.isFetching }
}

/**
 * The signed-in admin's address, from the admin session itself
 * (GET /v1/auth/admin-session). Display only; null until known or when the
 * answer has no email.
 */
export function useAdminIdentity() {
  return useQuery({
    queryKey: ["admin", "session"],
    retry: false,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const body = (await api.get(ADMIN_SESSION_ROUTES.status)).data as { data?: { email?: unknown } } | undefined
      const email = body?.data?.email
      return typeof email === "string" && email !== "" ? email : null
    },
  })
}
