"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"
import api, {
  SESSION_BROADCAST_KEY,
  SESSION_CHANGE_EVENT,
  clearSession,
  hasSessionCookie,
  signOut as endSession,
} from "./client"

/* ═══════════════════════════════════════════════════════════════════════════
   "Am I signed in?", answered without ever reading a token.

   The access token is HttpOnly, so the old answer — decode what is in
   localStorage — is not available and must not be replaced by something that
   looks like it. This module answers the question in two parts, because it is
   really two questions with different costs and different deadlines.

   ── 1. Presence: is there a session in this browser? ──────────────────────

   Answered from the `csrf_token` cookie. auth-service sets it in the same
   response as the two HttpOnly ones and clears it in the same response as
   them (`setAuthCookies` / `clearAuthCookies`), it is deliberately NOT
   HttpOnly, and cookies ignore the port — so it is one synchronous string
   read, shared by every zone and every tab, that says whether this browser
   has been signed in and not signed out.

   It is a hint, not proof. It can outlive the credentials it stands for: the
   access token expires after a day, and if the refresh token is refused too,
   the cookie is still sitting there. That is corrected below rather than
   papered over — the first request 401s, the refresh is refused, and the
   client drops the cookie and broadcasts. One wrong paint, self-healing, and
   never in the dangerous direction: nothing is authorised on the strength of
   this, the server authorises everything.

   Why not the HttpOnly `access_token`, which the SERVER can read and would be
   the more accurate signal? Because the client cannot. Seeding the first paint
   from a fact the browser can never re-check would make the two sides of the
   hydration boundary disagree the moment the access token expired, and a
   session that is one refresh away from being fine would render as signed out.
   Both sides read the same cookie on purpose; see ./server.

   ── 2. Identity: which account is it? ─────────────────────────────────────

   `GET /v1/auth/me`. The honest answer, and the only one available — it
   returns the id, the address and, since identity became the role authority,
   the live role list. It costs a round trip, so the UI does not wait on it to
   decide its SHAPE: presence already said "signed in", the header renders as
   a signed-in header immediately, and the name fills in when the request
   lands. What that buys is the thing the localStorage version could never do
   — no signed-out flash, no layout jump from one to the other.

   ── First paint ───────────────────────────────────────────────────────────

   `SessionProvider initialSignedIn={...}` is seeded on the server from the
   same cookie (see ./server), so the server HTML and the first client render
   agree by construction and React has nothing to reconcile. A zone that does
   not pass it gets `null`, which means "unknown until an effect has run" —
   correct, but with the old flash. That degradation is deliberate: a zone
   opts into the guarantee, it is not silently assumed for it.

   ── More than one tab ─────────────────────────────────────────────────────

   The cookie is shared, so the tabs cannot disagree about the underlying
   fact — only about when they noticed. Three listeners, cheapest first:

     · `SESSION_CHANGE_EVENT` — this tab, immediate. Its literal value, and
       why that value may never be rebuilt from the product name, are in
       @momentum/brand's STORAGE_KEYS.
     · `storage` on a key nobody reads — other tabs, near-immediate. There is
       no "a cookie changed" event, so a sign-out writes a timestamp purely to
       make `storage` fire elsewhere.
     · `focus` / `visibilitychange` — the backstop, and the only one that
       cannot be missed. A tab that was asleep, restored from bfcache, or in a
       browser that dropped the storage event still re-reads the cookie the
       moment someone looks at it.

   Signing out in one tab therefore cannot leave three tabs believing they are
   signed in: the credential is gone from all of them the instant the server
   clears it, and the other two find out on the storage event, or at worst
   when they are next looked at.
   ═══════════════════════════════════════════════════════════════════════════ */

/** What `GET /v1/auth/me` says about the signed-in account. */
export interface SessionUser {
  id: string
  email: string
  phone?: string
  email_verified?: boolean
  phone_verified?: boolean
  two_factor_enabled?: boolean
  account_type?: string
  account_status?: string
  /** Resolved live from identity's tables, never from the token's claims. */
  roles?: string[]
  deactivated_at?: string | null
  scheduled_purge_date?: string | null
}

export type SessionStatus = "unknown" | "signed-in" | "signed-out"

export interface SessionState {
  /**
   * "unknown" only before the first effect on a zone that did not seed the
   * provider from the server. Callers must not read it as "signed out".
   */
  status: SessionStatus
  signedIn: boolean
  signedOut: boolean
  /** False only while `status` is "unknown". The shape of the old API. */
  known: boolean
  /** Null until `GET /v1/auth/me` lands, and for a signed-out browser. */
  user: SessionUser | null
  /** Null until the same. Prefer `signedIn` for "should this render?". */
  userId: string | null
  /** Re-read the cookie and re-ask the server. */
  refresh: () => void
  /** Revoke the session server-side, then tell every tab. */
  signOut: () => Promise<void>
}

/**
 * `/v1/auth/me` answers `{ data: … }`; some gateways unwrap. Accept both.
 *
 * The id is the one field that must be there — auth-service sends it twice, as
 * `id` and `user_id`, and a body with neither is not an identity whatever else
 * it contains. Exported because the shape of a wire response is exactly the
 * kind of thing that should be tested without mounting a React tree.
 */
export function unwrapMe(body: unknown): SessionUser | null {
  const outer = (body ?? {}) as Record<string, unknown>
  const inner = (outer.data && typeof outer.data === "object" ? outer.data : outer) as Record<
    string,
    unknown
  >
  const id = typeof inner.id === "string" ? inner.id : inner.user_id
  if (typeof id !== "string" || id === "") return null
  return { ...(inner as unknown as SessionUser), id }
}

function statusOf(error: unknown): number | undefined {
  return (error as { response?: { status?: number } } | undefined)?.response?.status
}

/**
 * One in-flight `/me` per document, shared by every consumer.
 *
 * Module state, which is normally the wrong shape for anything session-related
 * — but this is only ever assigned inside an effect, so it is unreachable
 * during server rendering and cannot leak one request's user into another's.
 */
let inFlightMe: Promise<SessionUser | null> | null = null

function fetchMe(): Promise<SessionUser | null> {
  if (!inFlightMe) {
    inFlightMe = api
      .get("/v1/auth/me")
      .then((res) => unwrapMe(res.data))
      .finally(() => {
        inFlightMe = null
      })
  }
  return inFlightMe
}

/**
 * The machinery, so that `useSession` works with or without a provider.
 *
 * `inert` exists because `useSession` has to call this unconditionally to obey
 * the rules of hooks, even when a provider has already done the work. An inert
 * instance subscribes to nothing and fetches nothing.
 */
function useSessionState(initialSignedIn: boolean | null, inert = false): SessionState {
  const [present, setPresent] = useState<boolean | null>(initialSignedIn)
  const [user, setUser] = useState<SessionUser | null>(null)
  // Bumped by refresh(). Without it, asking for a re-read while `present` is
  // already true changes none of the identity effect's dependencies and the
  // effect never runs again — refresh() would clear the user and then never
  // fetch a replacement.
  const [reloads, setReloads] = useState(0)

  // Presence: read once on mount, then on every signal that it may have moved.
  useEffect(() => {
    if (inert) return
    const read = () => setPresent(hasSessionCookie())
    read()

    const onStorage = (event: StorageEvent) => {
      // A null key is a whole-storage clear, which is also worth re-reading.
      if (event.key === null || event.key === SESSION_BROADCAST_KEY) read()
    }
    const onVisible = () => {
      if (document.visibilityState === "visible") read()
    }

    window.addEventListener(SESSION_CHANGE_EVENT, read)
    window.addEventListener("storage", onStorage)
    window.addEventListener("focus", read)
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      window.removeEventListener(SESSION_CHANGE_EVENT, read)
      window.removeEventListener("storage", onStorage)
      window.removeEventListener("focus", read)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [inert])

  // Identity: only ever asked for when presence says there is someone to ask
  // about. Asking while signed out would 401 on every mount of every page.
  useEffect(() => {
    if (inert) return
    if (present !== true) {
      setUser(null)
      return
    }
    let live = true
    fetchMe()
      .then((me) => {
        if (live) setUser(me)
      })
      .catch((error) => {
        if (!live) return
        // A 401 here has already been through the interceptor's refresh
        // attempt. Reaching this branch means the refresh was refused too, so
        // the presence cookie is lying and has been dropped; agree with that
        // rather than sit on a hint the server has just contradicted.
        if (statusOf(error) === 401) {
          setPresent(false)
          setUser(null)
          clearSession()
        }
        // Anything else — a 500, a dead proxy — says nothing about whether
        // anyone is signed in. Keep the presence answer and leave `user` null;
        // the caller sees a signed-in shell with no name in it, which is true.
      })
    return () => {
      live = false
    }
  }, [present, reloads, inert])

  const refresh = useCallback(() => {
    if (inert) return
    setPresent(hasSessionCookie())
    inFlightMe = null
    setUser(null)
    setReloads((n) => n + 1)
  }, [inert])

  const signOut = useCallback(async () => {
    await endSession()
    inFlightMe = null
    setPresent(false)
    setUser(null)
  }, [])

  return useMemo<SessionState>(
    () => ({
      status: present === null ? "unknown" : present ? "signed-in" : "signed-out",
      signedIn: present === true,
      signedOut: present === false,
      known: present !== null,
      user,
      userId: user?.id ?? null,
      refresh,
      signOut,
    }),
    [present, user, refresh, signOut],
  )
}

const SessionContext = createContext<SessionState | null>(null)

/**
 * Wrap a zone once, in its root layout, passing what the server saw.
 *
 *   // app/layout.tsx (a server component)
 *   const { signedIn } = await readServerSession()
 *   return <SessionProvider initialSignedIn={signedIn}>{children}</SessionProvider>
 *
 * `initialSignedIn` is what makes the first paint correct. Omitting it is
 * supported and costs only the flash.
 */
export function SessionProvider({
  initialSignedIn = null,
  children,
}: {
  initialSignedIn?: boolean | null
  children: React.ReactNode
}) {
  const value = useSessionState(initialSignedIn)
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

/**
 * The session, from the nearest provider — or a standalone copy when a zone
 * has not mounted one, so a component can be moved between zones without
 * knowing which of them wired the provider.
 */
export function useSession(): SessionState {
  const provided = useContext(SessionContext)
  const standalone = useSessionState(null, provided !== null)
  return provided ?? standalone
}
