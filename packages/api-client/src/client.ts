import axios, { AxiosError, InternalAxiosRequestConfig } from "axios"

const SESSION_KEY = "postbook_session"
const TOKEN_KEY = "postbook_auth_tokens"
const SESSION_CHANGE_EVENT = "postbook:session-changed"

const canUseStorage = () =>
    typeof window !== "undefined" && typeof localStorage !== "undefined"

const getAccessToken = (): string | null => {
    if (!canUseStorage()) return null
    try {
        const raw = localStorage.getItem(TOKEN_KEY)
        if (!raw) return null
        const record = JSON.parse(raw) as { accessToken?: string }
        return record.accessToken ?? null
    } catch {
        return null
    }
}

const getRefreshToken = (): string | null => {
    if (!canUseStorage()) return null
    try {
        const raw = localStorage.getItem(TOKEN_KEY)
        if (!raw) return null
        const record = JSON.parse(raw) as { refreshToken?: string }
        return record.refreshToken ?? null
    } catch {
        return null
    }
}

const saveTokens = (accessToken: string, refreshToken: string) => {
    if (!canUseStorage()) return
    const record = { accessToken, refreshToken, updatedAt: Date.now() }
    localStorage.setItem(TOKEN_KEY, JSON.stringify(record))
}

const clearStoredAuth = () => {
    if (!canUseStorage()) return
    localStorage.removeItem(SESSION_KEY)
    localStorage.removeItem(TOKEN_KEY)
    window.dispatchEvent(new Event(SESSION_CHANGE_EVENT))
}

// Removes only the expired access/refresh tokens — does NOT touch the session
// user record and does NOT fire session-changed. Keeps the user visually logged
// in while preventing stale tokens from being sent on future requests.
const clearExpiredTokens = () => {
    if (!canUseStorage()) return
    localStorage.removeItem(TOKEN_KEY)
}

const getUserId = (): string | null => {
    if (!canUseStorage()) return null
    try {
        const raw = localStorage.getItem(SESSION_KEY)
        if (!raw) return null
        const user = JSON.parse(raw) as { id?: string }
        return user.id ?? null
    } catch {
        return null
    }
}

/**
 * Public accessor for the current user's ID. Returns null when no
 * session is active. Reads from the same storage slot used by the
 * axios interceptor so the value is consistent across surfaces.
 *
 * Components subscribe to session changes via SESSION_CHANGE_EVENT
 * if they need to react; the snapshot returned by this function is
 * a point-in-time read.
 */
export const getCurrentUserId = getUserId

/**
 * Persist a login result so subsequent api calls carry the Bearer token and
 * X-User-Id. Writes the same storage slots the interceptor reads. Call after a
 * successful POST /v1/auth/login (or register). `user` must include `id`.
 */
export const saveSession = (
    tokens: { accessToken: string; refreshToken: string },
    user: { id: string } & Record<string, unknown>
) => {
    if (!canUseStorage()) return
    saveTokens(tokens.accessToken, tokens.refreshToken)
    localStorage.setItem(SESSION_KEY, JSON.stringify(user))
    window.dispatchEvent(new Event(SESSION_CHANGE_EVENT))
}

/** Clear the session (logout). */
export const clearSession = clearStoredAuth

const ensureCsrfToken = (): string => {
    if (typeof document === "undefined") return ""
    const match = document.cookie.split("; ").find((c) => c.startsWith("csrf_token="))
    if (match) return match.split("=")[1]
    const token = crypto.randomUUID()
    document.cookie = `csrf_token=${token}; path=/`
    return token
}

const api = axios.create({
    baseURL: process.env.NEXT_PUBLIC_API_BASE_URL || "",
    withCredentials: false,
})

api.interceptors.request.use((config) => {
    const token = getAccessToken()
    if (token) {
        config.headers["Authorization"] = `Bearer ${token}`
    }

    const userId = getUserId()
    if (userId) {
        config.headers["X-User-Id"] = userId
    }

    if (config.method && ["post", "put", "delete", "patch"].includes(config.method.toLowerCase())) {
        config.headers["X-Requested-With"] = "XMLHttpRequest"
        config.headers["X-CSRF-Token"] = ensureCsrfToken()
    }

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

type RefreshResult = "success" | "invalid" | "unavailable"

let refreshPromise: Promise<RefreshResult> | null = null

async function refreshAccessToken(): Promise<RefreshResult> {
    const refreshToken = getRefreshToken()
    if (!refreshToken) return "invalid"

    try {
        const res = await fetch("/api/auth/refresh", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refreshToken }),
        })

        if (!res.ok) {
            return res.status === 401 || res.status === 403 ? "invalid" : "unavailable"
        }

        const payload = await res.json()
        // Match the same extraction order as responseMapper.ts:getTokens()
        // Handles: { data: { access_token } }, { data: { tokens: { access_token } } },
        //          { tokens: { access_token } }, { access_token }
        const primary = payload?.data ?? payload?.result ?? payload
        const tokens = primary?.tokens ?? primary
        const newAccess = tokens?.access_token ?? tokens?.accessToken ?? tokens?.token
        const newRefresh = tokens?.refresh_token ?? tokens?.refreshToken

        if (newAccess) {
            saveTokens(newAccess, newRefresh ?? refreshToken)
            return "success"
        }
        return "invalid"
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
                const newToken = getAccessToken()
                if (newToken) {
                    originalRequest.headers["Authorization"] = `Bearer ${newToken}`
                }
                return api(originalRequest)
            }

            // The refresh was REFUSED, not merely unreachable — this session is
            // dead and will never authenticate again. Clearing only the tokens
            // and keeping the user record, as this did, leaves the app believing
            // someone is signed in with nothing to sign in WITH: every request
            // 401s, and any screen that refetches on error loops for ever. The
            // shop's bag did exactly that, several times a second, indefinitely.
            //
            // `unavailable` still keeps the record: a server that is down is not
            // a session that has ended, and signing someone out over a blip is
            // the thing the old comment was rightly protecting against.
            if (result === "invalid") clearStoredAuth()
            else clearExpiredTokens()
        } else if (error.response?.status === 401) {
            clearExpiredTokens()
        }

        return Promise.reject(error)
    }
)

export default api
