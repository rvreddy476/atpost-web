import { NextResponse } from 'next/server'

/**
 * `service` is an OPERATIONS identifier, not a brand string, which is why it
 * is spelled out here rather than read from @momentum/brand. It answers "which
 * deployment am I talking to?" for a load balancer and a dashboard, its first
 * two sources are environment variables set per deployment, and the last-ditch
 * fallback is this repository's own name. Renaming the product does not rename
 * the repository, and a health endpoint that changes its service label on a
 * rebrand breaks the alert routing that keys off it.
 */
export function GET() {
  return NextResponse.json(
    {
      status: 'ok',
      service: process.env.SERVICE_NAME || process.env.npm_package_name || 'atpost-web',
      revision: process.env.APP_REVISION || process.env.VERCEL_GIT_COMMIT_SHA || 'development',
      timestamp: new Date().toISOString(),
    },
    { headers: { 'cache-control': 'no-store' } },
  )
}
