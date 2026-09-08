import axios, { AxiosError, InternalAxiosRequestConfig } from "axios"
import { STORAGE_KEYS } from "@momentum/brand"

/* ═══════════════════════════════════════════════════════════════════════════
   The session lives in cookies, not in this file.

   auth-service has always set three cookies on a successful login and on a 2FA
   verify (`setAuthCookies`, identity-platform/services/auth-service):

     access_token   HttpOnly, Path=/, SameSite=Lax, host-only in dev
     refresh_token  HttpOnly, Path=/, SameSite=Lax, host-only in dev
     csrf_token     NOT HttpOnly — readable by JS, by design

   Cookies ignore the port. One login on localhost is therefore already valid
   on :3000, :3001 and :3002, in every tab, without anything being copied
   anywhere. That is the single sign-on the product wants, and it existed
   server-side while this client threw it away: it persisted the tokens in
   localStorage instead, which is scoped per ORIGIN INCLUDING THE PORT, and
   that — nothing else — is why a session did not cross zones.

   So this client no longer holds a credential at all.

     · `withCredentials: true`, so the cookies actually go out.
     · No Authorization header. The access token is HttpOnly; JS cannot read
       it and must not try. Requests go to the zone's own same-origin proxy
       (`/api/proxy/[...path]`), which forwards the Cookie header upstream —
       and the api-gateway reads `access_token` from that cookie on every
       route (jwtExtractMiddleware, resolution order: Bearer header, then
       access_token cookie, then an allow-listed query token).
     · No X-User-Id. The gateway strips every client-supplied copy of the
       trusted identity headers and re-stamps them from the verified token, so
       sending one was decoration at best. "Who am I" is answered by
       `GET /v1/auth/me` — see ./session.
     · X-CSRF-Token is ECHOED from the csrf_token cookie, never minted. The
       identity services enforce a double-submit on cookie-authenticated
       writes (identity shared middleware `RequireCSRF`: a write authenticated
       by an ambient cookie must carry a header equal to the cookie). Now that
       we authenticate by cookie that check is live for us, and a locally
       invented value would fail every write with 403 CSRF_FAILED.

   Deliberately NOT done: the proxy does not promote the cookie to an
   `Authorization: Bearer` header. `RequireCSRF` skips the double-submit check
   when the caller presented a bearer token, on the reasoning that a bearer
   token is not ambient. Converting our ambient cookie into one at the proxy
   would hand us that exemption without earning it, and quietly disable CSRF
   protection for the entire web client.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Prefix every request and the refresh route share. "" in the shell, "/shop" in commerce. */
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || ""

/**
 * Fired whenever the answer to "is anyone signed in?" may have changed.
 *
 * The name is unchanged from the localStorage era on purpose — `useCapabilities`
 * and the shop's header already listen for it, and renaming it would have been
 * a second, unrelated change riding along with this one.
 *
 * It now reads from @momentum/brand's STORAGE_KEYS rather than being spelled
 * out here. That does NOT make it derived from the product name: the value in
 * that module is a frozen literal, and the reason it may never be rebuilt from
 * BRAND.name is written next to it. Routing it through there gives a rename a
 * single inventory of the strings it must leave alone.
 */
export const SESSION_CHANGE_EVENT = STORAGE_KEYS.sessionChangedEvent

/**
 * The one auth cookie JS is allowed to see. Set at login, cleared at logout.
 *
 * This is the presence signal — see ./session for why the readable cookie
 * rather than the HttpOnly one, and for what corrects it when it is wrong.
 */
const CSRF_COOKIE = "csrf_token"

/**
 * Written to localStorage purely to make `storage` fire in the OTHER tabs.
 *
 * The cookie is already shared between tabs, so this key carries no
 * information anyone reads — its value is a timestamp and nothing consults it.
 * It exists because there is no "a cookie changed" event, and waiting for the
 * next focus to notice a sign-out in another tab is a second too slow.
 *
 * Frozen, and for a harder reason than the event above: a browser that already
 * holds the old key keeps holding it, so a rename does not migrate tabs, it
 * splits them across two keys and a sign-out stops propagating.
 */
const BROADCAST_KEY = STORAGE_KEYS.sessionBroadcast

/**
 * The two slots the old localStorage session used.
 *
 * Removed on load rather than left to rot. A dead access token sitting in
 * localStorage is still a bearer credential to anything that can run script on
 * the origin, and "we stopped reading it" is not the same as "it is gone".
 */
const LEGACY_KEYS = [STORAGE_KEYS.legacySession, STORAGE_KEYS.legacyAuthTokens] as const

const canUseStorage = () =>
    typeof window !== "undefined" && typeof localStorage !== "undefined"

/** Read a cookie by name. Returns null on the server and when unset. */
function readCookie(name: string): string | null {
    if (typeof document === "undefined") return null
    const prefix = `${name}=`
    for (const part of document.cookie.split("; ")) {
        if (part.startsWith(prefix)) return decodeURIComponent(part.slice(prefix.length))
    }
    return null
}

/**
 * Drop the browser's copy of the presence cookie.
 *
 * Used when the server has said unambiguously that this browser is nobody — a
 * refused refresh, or a logout. `csrf_token` is not HttpOnly, so JS may delete
 * it, and leaving it behind would make the presence signal claim a session
 * that the next request will 401. The two HttpOnly cookies cannot be removed
 * from here and do not need to be: they are already worthless, and the server
 * clears them properly on the logout round trip.
 */
function dropPresenceCookie() {
    if (typeof document === "undefined") return
    document.cookie = `${CSRF_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`
}

/** Is there a session in this browser, as far as anything readable can say? */
export const hasSessionCookie = (): boolean => !!readCookie(CSRF_COOKIE)

/** The `storage` key other tabs watch. Exported for ./session, not for apps. */
export const SESSION_BROADCAST_KEY = BROADCAST_KEY

/**
 * Tell this tab, and every other tab, that the session may have changed.
 *
 * The same tab gets the DOM event; other tabs get `storage`, which fires only
 * in documents OTHER than the one that wrote it — exactly the fan-out wanted.
 */
export function notifySessionChanged() {
    if (typeof window === "undefined") return
    if (canUseStorage()) {
        try {
            localStorage.setItem(BROADCAST_KEY, String(Date.now()))
        } catch {
            /* Private mode, quota, a locked-down browser. The focus re-read in
               ./session still catches it; this is the fast path, not the only one. */
        }
    }
    window.dispatchEvent(new Event(SESSION_CHANGE_EVENT))
}

/**
 * Delete the localStorage session left by builds before cookie-mode.
 *
 * Runs once, on import, in the browser. This is the entire migration, and it
 * is a deletion rather than a conversion because there is nothing to carry
 * forward: the cookies these users already hold ARE the session — auth-service
 * set them on the same login that produced the localStorage record. Anyone
 * signed in before this change stays signed in; anyone whose cookies have
 * since expired lands on the login page, which is the correct outcome and the
 * one they would have reached anyway on their next request.
 *
 * Exported so the migration can be asserted directly rather than by reloading
 * a module and hoping the import side effect ran.
 */
export function purgeLegacySession() {
    if (!canUseStorage()) return
    try {
        for (const key of LEGACY_KEYS) localStorage.removeItem(key)
    } catch {
        /* Nothing to do and nothing to report: this is best-effort hygiene. */
    }
}

purgeLegacySession()

const api = axios.create({
    baseURL: API_BASE,
    // The whole point. Without this axios sends no cookies and the gateway
    // sees an anonymous request.
    withCredentials: true,
})

api.interceptors.request.use((config) => {
    const method = config.method?.toLowerCase()
    if (method && ["post", "put", "delete", "patch"].includes(method)) {
        config.headers["X-Requested-With"] = "XMLHttpRequest"
        // Echo, never mint. See the header note: the identity services compare
        // this header with the cookie byte for byte.
        const csrf = readCookie(CSRF_COOKIE)
        if (csrf) config.headers["X-CSRF-Token"] = csrf
    }

    // No Authorization here: the access token is HttpOnly and travels as a
    // cookie through the same-origin proxy.
    //
    // No X-User-Id here: the gateway deletes any inbound copy and re-stamps it
    // from the verified token, so this client asserts no identity of its own.
    //
    // No X-Admin-Role here, deliberately.
    //
    // This used to attach `X-Admin-Role: rider:admin` to every
    // /v1/rider/admin/* request, and rider-service authorised its entire
    // admin group on that header alone — approve, reject, suspend, block a
    // delivery partner. The gateway stripped X-Scopes but not this, so the
    // header was doing real authorisation work while being fully
    // client-controlled: anyone with a browser and any account had it.
    //
    // As of 2026-09-07 the gateway strips X-Admin-Role and re-stamps it from
    // the verified token, and rider-service reads the scopes claim instead.
    // Sending it from here would now be ignored at best. Authorisation comes
    // from the token; the client asserts nothing.

    return config
})

/**
 * End the session everywhere.
 *
 * `POST /v1/auth/logout` is what actually revokes it: auth-service clears all
 * three cookies (`clearAuthCookies`) and the zone proxy forwards those
 * Set-Cookie headers back, so the browser loses them for every port at once.
 * The local drop and the broadcast are belt and braces for the case where the
 * request never lands.
 */
export async function signOut(): Promise<void> {
    try {
        await api.post("/v1/auth/logout")
    } catch {
        /* A logout that cannot reach the server still has to sign this browser
           out locally — the alternative is a person clicking "sign out", seeing
           an error, and remaining signed in. */
    }
    dropPresenceCookie()
    notifySessionChanged()
}

/**
 * Announce a fresh sign-in.
 *
 * Called by the auth form after `POST /v1/auth/login` (or a register that came
 * back with a session). It takes no arguments and stores nothing: by the time
 * the response resolves the browser already holds the cookies the proxy
 * forwarded, so there is nothing left to persist. All this does is wake the
 * other tabs, and the React tree in this one.
 */
export const markSignedIn = notifySessionChanged

/** Sign this browser out locally, without a round trip. Used by the 401 path. */
export function clearSession() {
    dropPresenceCookie()
    notifySessionChanged()
}

type RefreshResult = "success" | "invalid" | "unavailable"

let refreshPromise: Promise<RefreshResult> | null = null

/**
 * Ask the zone's own route to rotate the session.
 *
 * No token in the body: the refresh token is HttpOnly, so the browser cannot
 * put it in one. `src/refresh.ts` already reads it from the cookie when the
 * body carries nothing, and forwards the rotated Set-Cookie headers back —
 * which is what keeps a cookie-mode session alive past the access token's day.
 *
 * The URL carries API_BASE because the route lives under the zone's basePath.
 * Unprefixed `/api/auth/refresh` only ever worked because requests in practice
 * went through the shell, which happens to host a route of its own at that
 * path; a zone reached directly (commerce on :3001) answered 404 and the
 * refresh silently became "unavailable" for ever.
 */
async function refreshAccessToken(): Promise<RefreshResult> {
    try {
        const res = await fetch(`${API_BASE}/api/auth/refresh`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: "{}",
        })

        if (!res.ok) {
            return res.status === 401 || res.status === 403 ? "invalid" : "unavailable"
        }

        // A 200 means auth-service accepted the refresh token and the proxy has
        // already handed the rotated cookies to the browser. There is nothing
        // in the body this client needs — it cannot hold a token anyway.
        return "success"
    } catch {
        return "unavailable"
    }
}

api.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
        const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean }

        if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
            originalRequest._retry = true

            if (!refreshPromise) {
                refreshPromise = refreshAccessToken().finally(() => {
                    refreshPromise = null
                })
            }

            const result = await refreshPromise

            if (result === "success") {
                // Nothing to re-attach: the rotated access token is a cookie the
                // browser sends on the retry by itself.
                return api(originalRequest)
            }

            // The refresh was REFUSED, not merely unreachable — this session is
            // dead and will never authenticate again. Leaving the presence
            // cookie in place would leave the app believing someone is signed
            // in with nothing to sign in WITH: every request 401s, and any
            // screen that refetches on error loops for ever. The shop's bag did
            // exactly that, several times a second, indefinitely.
            //
            // `unavailable` changes nothing, on purpose: a server that is down
            // is not a session that has ended, and signing someone out over a
            // blip is the thing that restraint protects against.
            if (result === "invalid") clearSession()
        }

        return Promise.reject(error)
    }
)

export default api
