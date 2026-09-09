import { NextRequest, NextResponse } from "next/server"

const API_GATEWAY = process.env.API_GATEWAY_URL || "http://localhost:8080"
const UPSTREAM_TIMEOUT_MS = Math.min(Math.max(Number(process.env.API_PROXY_TIMEOUT_MS) || 30_000, 1_000), 120_000)

const FORWARDED_HEADERS = [
    // `cookie` is the credential. The browser holds access_token and
    // refresh_token as httpOnly cookies it cannot read, and this route —
    // running on the server, on the same origin — hands them to the gateway,
    // which resolves a JWT from the `access_token` cookie on every route.
    // That is the whole of how a signed-in browser reaches an authenticated
    // API without any JavaScript ever touching a token.
    "cookie",
    // Kept for a non-browser caller presenting its own bearer token. The web
    // client no longer sends one — it has nothing to send.
    "authorization",
    // The double-submit half of the CSRF pair. The identity services compare
    // this against the csrf_token cookie on every cookie-authenticated write,
    // so dropping it here would 403 every mutation the web makes.
    "x-csrf-token",
    "x-requested-with",
    "content-type",
    "accept",
    // x-user-id is deliberately NOT forwarded. The gateway deletes every
    // client-supplied copy of the trusted identity headers before deriving
    // them from the verified token, so forwarding it achieved nothing except
    // suggesting to a reader that the client's claim about who it is mattered.
    //
    // Conditional GETs. The category attribute-schema route is ETagged and the
    // seller's listing form revalidates it on every category switch; without
    // this the validator never reaches the gateway and every hit is a full
    // payload the client already holds.
    "if-none-match",
    // Idempotency. `POST /v1/posts` REQUIRES this header — 400
    // MISSING_IDEMPOTENCY_KEY without it and 400 INVALID_IDEMPOTENCY_KEY for
    // anything that is not a UUID, both verified against the live gateway —
    // and post-service uses it to make a retried create durably idempotent.
    //
    // It is named here because this list is an ALLOWLIST: a header the browser
    // sets and this route does not name is dropped silently, and the failure
    // that produces is a nasty one to chase. The request visibly carries an
    // Idempotency-Key in the network tab and the gateway answers that one is
    // required.
    //
    // The Tube upload studio (apps/tube/src/tube/uploadApi.ts) is the first
    // caller to send one. Commerce's checkout sends `idempotency_key` in the
    // BODY — a different mechanism on a different service, unaffected either
    // way.
    "idempotency-key",
]

export async function proxyRequest(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
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
    const requestId = req.headers.get("x-request-id") || crypto.randomUUID()
    headers.set("x-request-id", requestId)

    // Read body for non-GET/HEAD requests
    let body: BodyInit | null = null
    if (req.method !== "GET" && req.method !== "HEAD") {
        body = await req.arrayBuffer()
    }

    // For /serve endpoints, follow redirects so the proxy streams image bytes
    // directly to the browser (avoids cross-origin redirect issues with MinIO).
    const timeout = AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
    let upstream: Response
    try {
        upstream = await fetch(url.toString(), {
            method: req.method,
            headers,
            body,
            redirect: "follow",
            signal: timeout,
        })
    } catch {
        const status = timeout.aborted ? 504 : 502
        return NextResponse.json(
            { error: { code: timeout.aborted ? "UPSTREAM_TIMEOUT" : "UPSTREAM_UNAVAILABLE", message: "The service is temporarily unavailable." } },
            { status, headers: { "cache-control": "no-store", "x-request-id": requestId } },
        )
    }

    // 304 is a success for the caller, not an error: the client's cached copy is
    // still good. It must also go back with no body at all — a null-body status
    // carrying one is a TypeError, which is what made the old error branch turn
    // a perfectly good revalidation into a 500.
    if (upstream.status === 304) {
        const notModified = new Headers({ "x-request-id": requestId })
        const etag = upstream.headers.get("etag")
        if (etag) notModified.set("etag", etag)
        const cacheControl = upstream.headers.get("cache-control")
        if (cacheControl) notModified.set("cache-control", cacheControl)
        forwardSetCookies(upstream, notModified)
        return new NextResponse(null, { status: 304, headers: notModified })
    }

    if (!upstream.ok) {
        const errBody = await upstream.text()
        console.warn(`[proxy] upstream error status=${upstream.status} request_id=${requestId}`)
        const errHeaders = new Headers({
            "content-type": upstream.headers.get("content-type") ?? "application/json",
            "cache-control": "no-store",
            "x-request-id": requestId,
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
        // fetch may transparently decompress responses; forwarding the original
        // encoding/length would make the browser interpret the streamed bytes incorrectly.
        if (!["transfer-encoding", "connection", "keep-alive", "set-cookie", "content-encoding", "content-length"].includes(lower)) {
            responseHeaders.set(key, value)
        }
    })
    responseHeaders.set("x-request-id", requestId)
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
