import { NextResponse } from 'next/server'

export function GET() {
  return NextResponse.json({ status: 'ok', service: '@atpost/shell', revision: process.env.APP_REVISION || 'development', timestamp: new Date().toISOString() }, { headers: { 'cache-control': 'no-store' } })
}
