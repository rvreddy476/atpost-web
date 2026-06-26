import { NextRequest, NextResponse } from "next/server"

const API_GATEWAY = process.env.API_GATEWAY_URL || "http://localhost:8080"

const FORWARDED_HEADERS = [
    "authorization",
    "x-user-id",
    "x-csrf-token",
    "x-requested-with",
    "content-type",
    "accept",
    "cookie",
]

async function proxyRequest(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
    const { path } = await params
    const target = `${API_GATEWAY}/v1/${path.join("/")}`
    const url = new URL(target)

    // Forward query params
    req.nextUrl.searchParams.forEach((value, key) => {
        url.searchParams.set(key, value)
    })

    // Build forwarded headers
    const headers = new Headers()
    for (const name of FORWARDED_HEADERS) {
        const value = req.headers.get(name)
        if (value) {
            headers.set(name, value)
        }
    }

    // Read body for non-GET/HEAD requests
    let body: BodyInit | null = null
    if (req.method !== "GET" && req.method !== "HEAD") {
        body = await req.arrayBuffer()
    }

    // For /serve endpoints, follow redirects so the proxy streams image bytes
    // directly to the browser (avoids cross-origin redirect issues with MinIO).
    const upstream = await fetch(url.toString(), {
        method: req.method,
        headers,
        body,
        redirect: "follow",
    })

    if (!upstream.ok) {
        const errBody = await upstream.text()
        console.log(`[proxy] Upstream ERROR ${upstream.status}: ${errBody}`)
        const errHeaders = new Headers({
            "content-type": upstream.headers.get("content-type") ?? "application/json",
        })
        // Forward Set-Cookie even on error responses (e.g. logout/clear-cookie
        // paths may return non-2xx) so httpOnly auth cookies stay consistent.
        forwardSetCookies(upstream, errHeaders)
        return new NextResponse(errBody, {
            status: upstream.status,
            statusText: upstream.statusText,
            headers: errHeaders,
        })
    }

    // Stream the response back
    const responseHeaders = new Headers()
    upstream.headers.forEach((value, key) => {
        const lower = key.toLowerCase()
        // Skip hop-by-hop headers and set-cookie (handled separately below —
        // Headers.forEach folds multiple Set-Cookie into one comma-joined value,
        // which corrupts the httpOnly access/refresh/csrf cookies).
        if (!["transfer-encoding", "connection", "keep-alive", "set-cookie"].includes(lower)) {
            responseHeaders.set(key, value)
        }
    })
    forwardSetCookies(upstream, responseHeaders)

    return new NextResponse(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: responseHeaders,
    })
}

// forwardSetCookies copies each Set-Cookie header individually from the upstream
// response onto out. Uses getSetCookie() (undici) which returns the cookies
// unfolded, so multiple httpOnly cookies survive intact. This is what lets the
// browser hold the auth tokens in httpOnly cookies instead of JS-readable storage.
function forwardSetCookies(upstream: Response, out: Headers) {
    const getSetCookie = (upstream.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie
    const cookies = typeof getSetCookie === "function" ? getSetCookie.call(upstream.headers) : []
    for (const cookie of cookies) {
        out.append("set-cookie", cookie)
    }
}

export const GET = proxyRequest
export const POST = proxyRequest
export const PUT = proxyRequest
export const DELETE = proxyRequest
export const PATCH = proxyRequest
