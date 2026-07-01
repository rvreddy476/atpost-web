import { NextResponse } from 'next/server'

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
