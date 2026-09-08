import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'
import { proxyRequest } from './proxy'

function request(requestId?: string, extraHeaders: Record<string, string> = {}): NextRequest {
  const headers = new Headers(extraHeaders)
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

  // The cookie IS the credential now. The browser holds access_token as an
  // httpOnly cookie it cannot read; this route, running on the server, is the
  // only thing that can carry it to the gateway — which resolves a JWT from
  // `access_token` on every route. Drop this forward and the whole web client
  // is anonymous.
  it('forwards the session cookie and the CSRF header upstream', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('ok'))
    vi.stubGlobal('fetch', fetchMock)

    await proxyRequest(
      request(undefined, {
        cookie: 'access_token=jwt-value; csrf_token=csrf-value',
        'x-csrf-token': 'csrf-value',
      }),
      { params: Promise.resolve({ path: ['commerce', 'cart'] }) },
    )

    const sent = fetchMock.mock.calls[0][1].headers as Headers
    expect(sent.get('cookie')).toBe('access_token=jwt-value; csrf_token=csrf-value')
    expect(sent.get('x-csrf-token')).toBe('csrf-value')
  })

  // The gateway deletes every client-supplied copy of the trusted identity
  // headers before deriving them from the verified token, so forwarding this
  // only ever suggested to a reader that the client's claim about who it is
  // counted for something.
  it('never forwards a client-asserted X-User-Id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('ok'))
    vi.stubGlobal('fetch', fetchMock)

    await proxyRequest(request(undefined, { 'x-user-id': 'somebody-elses-id' }), {
      params: Promise.resolve({ path: ['commerce', 'cart'] }),
    })

    const sent = fetchMock.mock.calls[0][1].headers as Headers
    expect(sent.get('x-user-id')).toBeNull()
  })
})
