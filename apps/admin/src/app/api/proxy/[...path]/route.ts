import { NextRequest } from "next/server"
import { proxyRequest } from "@atpost/api-client/proxy"
import { adminProxyHeaders } from "@/lib/admin/cookies"

/**
 * The console's same-origin gateway proxy: the shared implementation
 * (Set-Cookie forwarding, allowlisted headers), fed a request whose Cookie
 * header holds ONLY the admin session cookies and no Authorization header.
 * A consumer session that shares a parent domain with this host therefore
 * never reaches the gateway from the console. See lib/admin/cookies.ts.
 */
type Context = { params: Promise<{ path: string[] }> }

async function adminProxy(req: NextRequest, ctx: Context) {
  const hasBody = req.method !== "GET" && req.method !== "HEAD"
  const forwarded = new NextRequest(req.url, {
    method: req.method,
    headers: adminProxyHeaders(req.headers),
    body: hasBody ? await req.arrayBuffer() : undefined,
  })
  return proxyRequest(forwarded, ctx)
}

export const GET = adminProxy
export const POST = adminProxy
export const PUT = adminProxy
export const DELETE = adminProxy
export const PATCH = adminProxy
