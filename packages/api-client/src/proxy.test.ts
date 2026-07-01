import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'
import { proxyRequest } from './proxy'

function request(requestId?: string): NextRequest {
  const headers = new Headers()
  if (requestId) headers.set('x-request-id', requestId)
  return {
    method: 'GET',
    headers,
    nextUrl: new URL('http://localhost/api/proxy/commerce/products?q=phone'),
  } as unknown as NextRequest
}

afterEach(() => vi.unstubAllGlobals())

describe('proxyRequest', () => {
  it('returns a safe gateway error and preserves the request id', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connection refused')))
    const response = await proxyRequest(request('request-123'), {
      params: Promise.resolve({ path: ['commerce', 'products'] }),
    })

    expect(response.status).toBe(502)
    expect(response.headers.get('x-request-id')).toBe('request-123')
    expect(response.headers.get('cache-control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual({
      error: { code: 'UPSTREAM_UNAVAILABLE', message: 'The service is temporarily unavailable.' },
    })
  })

  it('does not forward stale compression metadata for streamed responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('ok', {
      headers: { 'content-encoding': 'gzip', 'content-length': '200', 'x-service': 'commerce' },
    })))
    const response = await proxyRequest(request(), {
      params: Promise.resolve({ path: ['commerce', 'products'] }),
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('content-encoding')).toBeNull()
    expect(response.headers.get('content-length')).toBeNull()
    expect(response.headers.get('x-service')).toBe('commerce')
    expect(response.headers.get('x-request-id')).toBeTruthy()
  })
})
