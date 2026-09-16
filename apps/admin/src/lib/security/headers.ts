/**
 * Browser security for the admin console, and ONLY for it. Consumer zones keep
 * the defaults in packages/config/next-config.mjs.
 *
 * The console is served on its own host (e.g. admin.cleestudio.com), so it can
 * afford a policy a consumer zone embedding third-party media cannot:
 *
 *   default-src 'none'  and each fetch directive opened only as far as needed.
 *
 * ── Relaxations, and why each is necessary ────────────────────────────────
 *
 * script-src 'nonce-…' 'strict-dynamic'
 *   Next's App Router streams its React Server Component payload as INLINE
 *   <script> tags (`self.__next_f.push(...)`). `script-src 'self'` alone blocks
 *   them and the page never hydrates. A per-request nonce, generated in
 *   middleware.ts and picked up by Next from the request's CSP header, admits
 *   exactly those tags and nothing an attacker injects. 'strict-dynamic' lets
 *   the nonced bootstrap load its own chunks; 'self' stays as the fallback for
 *   browsers without strict-dynamic.
 *
 * 'unsafe-eval' — DEVELOPMENT ONLY. React's dev build and Turbopack's HMR
 *   evaluate code. Production never carries it.
 *
 * style-src-attr 'unsafe-inline'
 *   React renders `style={{…}}` props as style ATTRIBUTES in server HTML (the
 *   shared Tree component in the catalogue editor does). Attribute styles
 *   cannot load resources or run script, and <style> ELEMENTS stay locked to
 *   'self' plus the nonce, so CSS-based exfiltration through injected
 *   selectors is still refused.
 *
 * style-src-elem 'unsafe-inline' — DEVELOPMENT ONLY. The dev server injects
 *   un-nonced <style> tags for hot reload.
 *
 * img-src data: blob:
 *   next/font and the document viewer use data: and blob: URLs; product and
 *   document images come from the media origins passed in.
 */

export interface CspOptions {
  nonce: string
  dev: boolean
  /** Origin of the API when the browser calls it directly; omitted when proxied. */
  apiOrigin?: string | null
  /** Extra image origins (product photos, KYC documents). */
  imageOrigins?: string[]
}

/** Only `scheme://host[:port]` survives; anything else is dropped, not trusted. */
export function sanitiseOrigin(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  // A wildcard subdomain is a valid CSP source but not a valid URL.
  const wildcard = /^https:\/\/\*\.[a-z0-9.-]+$/i
  if (wildcard.test(trimmed)) return trimmed.toLowerCase()
  try {
    const url = new URL(trimmed)
    if (url.protocol !== "https:" && url.protocol !== "http:") return null
    return url.origin
  } catch {
    return null
  }
}

export function splitOrigins(value: string | null | undefined): string[] {
  return (value ?? "")
    .split(/[\s,]+/)
    .map((v) => sanitiseOrigin(v))
    .filter((v): v is string => !!v)
}

export function buildContentSecurityPolicy({ nonce, dev, apiOrigin, imageOrigins = [] }: CspOptions): string {
  if (!/^[A-Za-z0-9+/=_-]{16,}$/.test(nonce)) throw new Error("CSP nonce must be at least 16 base64 characters")
  const api = sanitiseOrigin(apiOrigin)
  const images = imageOrigins.map((o) => sanitiseOrigin(o)).filter((o): o is string => !!o)

  const directives: Record<string, string[]> = {
    "default-src": ["'none'"],
    "script-src": ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(dev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", `'nonce-${nonce}'`],
    "style-src-elem": dev ? ["'self'", "'unsafe-inline'"] : ["'self'", `'nonce-${nonce}'`],
    "style-src-attr": ["'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", ...images],
    "font-src": ["'self'", "data:"],
    // Dev needs the HMR websocket on the same host.
    "connect-src": ["'self'", ...(api ? [api] : []), ...(dev ? ["ws:", "wss:"] : [])],
    "manifest-src": ["'self'"],
    "worker-src": ["'self'", "blob:"],
    "frame-src": ["'none'"],
    "object-src": ["'none'"],
    "base-uri": ["'none'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  }

  const parts = Object.entries(directives).map(([name, values]) => `${name} ${values.join(" ")}`)
  if (!dev) parts.push("upgrade-insecure-requests")
  return parts.join("; ")
}

/** For JSON routes (the proxy, health, refresh): nothing may render from them. */
export const API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"

export interface StaticHeader {
  key: string
  value: string
}

/** Headers that do not vary per request, set from next.config.ts. */
export function staticSecurityHeaders({ production }: { production: boolean }): StaticHeader[] {
  const headers: StaticHeader[] = [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "no-referrer" },
    {
      key: "Permissions-Policy",
      value:
        "accelerometer=(), autoplay=(), camera=(), display-capture=(), fullscreen=(self), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), midi=(), payment=(), picture-in-picture=(), publickey-credentials-get=(self), usb=(), interest-cohort=()",
    },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
    { key: "X-Robots-Tag", value: "noindex, nofollow" },
  ]
  // HSTS over http is ignored by browsers, but a local https dev host would be
  // pinned for two years — so production only.
  if (production) {
    headers.push({ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" })
  }
  return headers
}

/**
 * Where the console is mounted.
 *
 *   ADMIN_BASE_PATH unset   "/admin"  — local dev and the multi-zone shell
 *   ADMIN_BASE_PATH ""/"/"  ""        — the root of its own host
 *   ADMIN_BASE_PATH "/ops"  "/ops"
 *
 * Read at BUILD time: Next bakes basePath into the bundle, so the own-host
 * image is built with ADMIN_BASE_PATH="".
 */
export function resolveAdminBasePath(value: string | undefined): "" | `/${string}` {
  if (value === undefined) return "/admin"
  const trimmed = value.trim().replace(/\/+$/, "")
  if (trimmed === "") return ""
  if (!/^\/[a-z0-9][a-z0-9/_-]*$/i.test(trimmed)) {
    throw new Error(`ADMIN_BASE_PATH must be empty or an absolute path like /admin; received: ${value}`)
  }
  return trimmed as `/${string}`
}
