"use client"

import { useCallback, useEffect } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import type {
  Capabilities,
  CapabilitiesResponse,
  RoleDestination,
  RoleName,
} from "@atpost/types/auth"
import { BRAND } from "@momentum/brand"
import api, { SESSION_CHANGE_EVENT } from "./client"
import { useSession } from "./session"

/**
 * "Who am I allowed to be?", asked of the server rather than guessed.
 *
 * ── Why this lives in @atpost/api-client ──────────────────────────────────
 *
 * Capabilities are a property of the *session*, and this package already owns
 * the session: the cookie the presence signal is read from, `useSession`, the
 * 401→refresh interceptor, and the `SESSION_CHANGE_EVENT` this hook has to
 * listen to. Splitting "who is signed in" from "what they may do"
 * across two packages is how the two drift.
 *
 * The alternatives were worse. `@atpost/ui` is a design system with no data
 * layer at all — putting an axios call there would make every consumer of
 * `Button` pull the network stack. `packages/types` is pure types by charter.
 * Either app would fork it, which is the exact failure this endpoint exists to
 * end.
 *
 * It is reached by the SUBPATH `@atpost/api-client/capabilities`, not from the
 * package root, on purpose: `apps/shell` imports `@atpost/api-client` and has
 * neither React Query nor Tailwind. Re-exporting a hook from the barrel would
 * drag a data layer into a zone that does not have one.
 *
 * ── Freshness ─────────────────────────────────────────────────────────────
 *
 * Roles are read live from identity's own tables, so this answer is correct
 * the moment a role is granted — while the token's `scopes` claim is still
 * one refresh behind. That is only worth anything if the client does not sit
 * on a stale copy, so this query is never fresh (`staleTime: 0`) and refetches
 * on every mount. It is one small request behind an already-authenticated
 * call; caching it for minutes would trade the endpoint's whole point for
 * nothing.
 */

export const capabilityKeys = {
  me: ["auth", "capabilities"] as const,
}

/** `GET /v1/auth/me/capabilities`. */
export const CAPABILITIES_PATH = "/v1/auth/me/capabilities"

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object"

/**
 * `{ data: … }` is the house envelope, but identity-auth answers this route
 * bare. Accept both rather than pick one and be wrong on a gateway change.
 */
export function unwrapCapabilities(body: unknown): CapabilitiesResponse {
  if (isObject(body) && !("capabilities" in body) && isObject(body.data)) {
    return body.data as unknown as CapabilitiesResponse
  }
  return body as CapabilitiesResponse
}

function statusOf(error: unknown): number | undefined {
  return (error as { response?: { status?: number } } | undefined)?.response?.status
}

// ── Destinations ────────────────────────────────────────────────────────────

/**
 * The three admin roles, most senior first. Only the highest held is shown.
 *
 * A person who is moderator AND admin does not have two places to go — both
 * roles open the same console at /admin, and the console decides what they can
 * do once inside. Three near-identical "Admin console" rows in a menu of four
 * is a worse menu than one row named for the seniority they actually hold.
 */
const ADMIN_LADDER: ReadonlyArray<{ role: RoleName; label: string }> = [
  { role: "superadmin", label: "Superadmin" },
  { role: "admin", label: "Admin" },
  { role: "moderator", label: "Moderator" },
]

/**
 * Roles the web genuinely cannot serve, because there is no web app for them —
 * these three live only in the native app. They are NOT dropped; see
 * the comment on RoleSwitcher for why.
 */
const APP_ONLY_ROLES: ReadonlyArray<{ role: RoleName; label: string; what: string }> = [
  { role: "restaurant_owner", label: "Restaurant owner", what: "your kitchen and menu" },
  { role: "delivery_partner", label: "Delivery partner", what: "deliveries" },
  { role: "rider_partner", label: "Rider partner", what: "rides" },
]

const APP_ONLY_REASON = `Only in the ${BRAND.mobileApp} — there is no web console for this yet.`

/** Roles the derivation below handles by name. Anything else is unknown. */
const KNOWN_ROLES = new Set<string>([
  "seller",
  ...ADMIN_LADDER.map((a) => a.role),
  ...APP_ONLY_ROLES.map((a) => a.role),
])

/** "restaurant_owner" → "Restaurant owner", for a role added after this build. */
function humanise(role: string): string {
  const words = role.replace(/[_-]+/g, " ").trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * Turn the server's answer into the places this person could go.
 *
 * Pure, exported, and tested on its own — every rule the switcher has about
 * who sees what is decided here rather than inside a render.
 */
export function destinationsFor(response: CapabilitiesResponse | null | undefined): RoleDestination[] {
  if (!response) return []
  const caps: Partial<Record<string, boolean>> = response.capabilities ?? {}
  const destinations: RoleDestination[] = []

  // Every account is a customer, so this is where everyone starts — and where
  // login always lands. It is listed first for the same reason.
  if (response.is_customer !== false) {
    destinations.push({
      id: "customer",
      label: "Customer",
      description: `Browse and buy on ${BRAND.shop}`,
      href: "/shop",
      unavailableReason: null,
    })
  }

  if (caps.seller) {
    destinations.push({
      id: "seller",
      label: "Seller",
      description: "Your listings, orders and payouts",
      href: "/shop/sell",
      unavailableReason: null,
    })
  }

  const admin = ADMIN_LADDER.find((rung) => caps[rung.role])
  if (admin) {
    destinations.push({
      id: "admin",
      label: admin.label,
      description: "The admin console",
      href: "/admin",
      unavailableReason: null,
    })
  }

  for (const appOnly of APP_ONLY_ROLES) {
    if (!caps[appOnly.role]) continue
    destinations.push({
      id: appOnly.role,
      label: appOnly.label,
      description: `Manage ${appOnly.what} from your phone`,
      href: null,
      unavailableReason: APP_ONLY_REASON,
    })
  }

  // A role this build has never heard of. `capabilities` is exhaustive by
  // contract, so an eighth role appears here as an unfamiliar key — showing it
  // as "no web destination yet" is the only answer that is not a lie.
  for (const [role, held] of Object.entries(caps)) {
    if (!held || KNOWN_ROLES.has(role)) continue
    destinations.push({
      id: role,
      label: humanise(role),
      description: "A newer role on your account",
      href: null,
      unavailableReason: "This role has no web destination in this version.",
    })
  }

  return destinations
}

/**
 * Whether the switcher is worth showing at all.
 *
 * A control offering one option is noise, and a pure customer — almost
 * everybody — has exactly one. The count is of ENTRIES, not of actionable
 * ones: a delivery partner has a second hat, and the fact that the web cannot
 * open it is precisely what the menu is there to say.
 */
export function shouldShowSwitcher(destinations: RoleDestination[]): boolean {
  return destinations.length > 1
}

/** Does this person hold any of the three roles the admin console admits? */
export function hasAdminConsoleAccess(capabilities: Capabilities | null | undefined): boolean {
  if (!capabilities) return false
  return !!(capabilities.superadmin || capabilities.admin || capabilities.moderator)
}

// ── The hook ────────────────────────────────────────────────────────────────

export interface UseCapabilitiesResult {
  /** The raw response, or undefined until it arrives. */
  data: CapabilitiesResponse | undefined
  /** Every role in the vocabulary, answered. Null until the response arrives. */
  capabilities: Capabilities | null
  /** The places this person could go. Empty until the response arrives. */
  destinations: RoleDestination[]
  /**
   * Whether "signed in?" has an answer yet.
   *
   * True from the first paint in a zone whose layout seeded `SessionProvider`
   * from the request's cookies, and only after an effect in one that did not.
   * Callers must not read `false` as "signed out".
   */
  sessionKnown: boolean
  /** Known to be nobody: no session cookie, or the API answered 401. */
  signedOut: boolean
  /** The request is in flight (or has not started because we do not know yet). */
  isLoading: boolean
  /** The request failed for a reason that says nothing about permissions. */
  isError: boolean
  error: unknown
  refetch: () => void
}

export function useCapabilities(): UseCapabilitiesResult {
  const queryClient = useQueryClient()

  // "Is anyone signed in" is not this hook's question, and it is no longer
  // answered by reading storage during render. useSession owns it: seeded on
  // the server from the request's cookies where the zone wired that up, so
  // `known` can be true on the very first paint instead of only after an
  // effect, and settled from the cookie otherwise.
  const { signedIn, known } = useSession()

  useEffect(() => {
    const onSessionChange = () => {
      // Throw the cached answer away rather than merely marking it stale.
      //
      // On sign-out the query is disabled, so an invalidate would leave the
      // previous person's capabilities sitting in the cache and still being
      // returned — the next account to sign in on this browser would briefly
      // be offered their menu. reset() clears the data in both directions and
      // refetches only when the query is enabled again.
      queryClient.resetQueries({ queryKey: capabilityKeys.me })
    }

    window.addEventListener(SESSION_CHANGE_EVENT, onSessionChange)
    return () => window.removeEventListener(SESSION_CHANGE_EVENT, onSessionChange)
  }, [queryClient])

  const query = useQuery<CapabilitiesResponse>({
    queryKey: capabilityKeys.me,
    // Nothing to ask about a person who is not signed in, and asking would
    // 401 on every mount of every page that renders the header.
    enabled: signedIn,
    // See "Freshness" above: never cached as fresh, always re-read on mount.
    staleTime: 0,
    refetchOnMount: "always",
    retry: false,
    queryFn: async () => unwrapCapabilities((await api.get(CAPABILITIES_PATH)).data),
  })

  // React Query's own refetch is stable; wrapping it only drops the promise so
  // an onClick handler does not return one.
  const queryRefetch = query.refetch
  const refetch = useCallback(() => {
    void queryRefetch()
  }, [queryRefetch])

  const sessionKnown = known
  // A 401 here outranks the cookie: the readable presence cookie can outlive
  // the credentials it stands for, and the server has just said it does not
  // know this caller.
  const signedOut = sessionKnown && (!signedIn || statusOf(query.error) === 401)

  const data = query.data
  return {
    data,
    capabilities: data?.capabilities ?? null,
    destinations: destinationsFor(data),
    sessionKnown,
    signedOut,
    isLoading: !sessionKnown || (signedIn && query.isPending),
    isError: query.isError && statusOf(query.error) !== 401,
    error: query.error,
    refetch,
  }
}
