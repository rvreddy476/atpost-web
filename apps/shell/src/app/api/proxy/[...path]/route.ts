import type { NextRequest } from 'next/server'
import { proxyRequest } from '@atpost/api-client/proxy'

type Context = { params: Promise<{ path: string[] }> }
const handler = (request: NextRequest, context: Context) => proxyRequest(request as never, context)

export const GET = handler
export const POST = handler
export const PUT = handler
export const DELETE = handler
export const PATCH = handler
