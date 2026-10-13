import { describe, expect, it, vi } from 'vitest'
import { evidenceLimit, fetchPartnerEvidence } from './partnerEvidence'

describe('private partner evidence', () => {
  it('allows only safe image/video MIME types with bounded sizes', () => {
    expect(evidenceLimit('video/mp4')).toBe(64 * 1024 * 1024)
    expect(evidenceLimit('image/jpeg')).toBe(15 * 1024 * 1024)
    expect(evidenceLimit('image/svg+xml')).toBe(0)
    expect(evidenceLimit('text/html')).toBe(0)
  })
  it('uses credentials, rejects redirects and never caches private bytes', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('video', { headers: { 'content-type': 'video/mp4' } }))
    vi.stubGlobal('fetch', fetcher)
    try {
      const result = await fetchPartnerEvidence('/private/view', new AbortController().signal)
      expect(result.ok).toBe(true)
      expect(fetcher.mock.calls[0][1]).toMatchObject({ cache: 'no-store', credentials: 'include', redirect: 'error' })
    } finally { vi.unstubAllGlobals() }
  })
  it('rejects oversized responses before consuming their body', async () => {
    const response = new Response('video', { headers: { 'content-type': 'video/mp4', 'content-length': String(64 * 1024 * 1024 + 1) } })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
    try {
      expect((await fetchPartnerEvidence('/private/view', new AbortController().signal)).ok).toBe(false)
      expect(response.bodyUsed).toBe(false)
    } finally { vi.unstubAllGlobals() }
  })
})
