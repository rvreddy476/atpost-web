import type { NextRequest } from 'next/server'
import { POST as refresh } from '@atpost/api-client/refresh'

export async function POST(request: NextRequest) {
  return refresh(request as never)
}
