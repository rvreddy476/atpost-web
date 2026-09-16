import { NextResponse, type NextRequest } from "next/server"
import { buildContentSecurityPolicy, splitOrigins } from "@/lib/security/headers"

/**
 * Per-request Content-Security-Policy for every page of the console.
 *
 * The nonce goes on the REQUEST's CSP header as well as the response's: Next
 * reads it from the request and stamps it onto the inline RSC <script> tags
 * and its own chunk scripts. See headers.ts for each directive's reasoning.
 * Pages are already dynamically rendered (the layout reads the session
 * cookie), so a per-request nonce costs no static optimisation.
 */
export function middleware(request: NextRequest) {
  const bytes = new Uint8Array(18)
  crypto.getRandomValues(bytes)
  const nonce = btoa(String.fromCharCode(...bytes))

  const csp = buildContentSecurityPolicy({
    nonce,
    dev: process.env.NODE_ENV === "development",
    apiOrigin: process.env.NEXT_PUBLIC_ADMIN_API_ORIGIN ?? null,
    imageOrigins: splitOrigins(process.env.ADMIN_IMAGE_ORIGINS ?? "https://*.cleestudio.com"),
  })

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set("x-nonce", nonce)
  requestHeaders.set("Content-Security-Policy", csp)

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set("Content-Security-Policy", csp)
  response.headers.set("Cache-Control", "no-store")
  return response
}

export const config = {
  // Pages only. Static chunks need no CSP, and the JSON routes carry the
  // stricter API policy from next.config.ts. Prefetches are skipped so a
  // cached prefetch never carries a stale nonce.
  // The root needs its own entry: with a base path the pattern below becomes
  // "/admin/(…)", which does not match "/admin" itself.
  matcher: [
    {
      source: "/",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
    {
      source: "/((?!api/|v1/|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
}
