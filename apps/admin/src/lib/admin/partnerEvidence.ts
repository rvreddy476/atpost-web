import type { KycFetchResult } from './kycView'

export const evidenceLimit = (type: string): number => {
  if (['video/mp4', 'video/webm', 'video/quicktime'].includes(type)) return 64 * 1024 * 1024
  if (['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'].includes(type)) return 15 * 1024 * 1024
  return 0
}

export async function fetchPartnerEvidence(url: string, signal: AbortSignal): Promise<KycFetchResult> {
  try {
    const response = await fetch(url, { credentials: 'include', cache: 'no-store', redirect: 'error', signal })
    if (!response.ok) {
      const data = await response.json().catch(() => null)
      return { ok: false, status: response.status, code: data?.error?.code ?? null }
    }
    const type = (response.headers.get('content-type') ?? '').split(';')[0].toLowerCase()
    const limit = evidenceLimit(type)
    if (!limit || Number(response.headers.get('content-length')) > limit) return { ok: false, status: 200, code: null, decode: true }
    const blob = await response.blob()
    if (!blob.size || blob.size > limit) return { ok: false, status: 200, code: null, decode: true }
    return { ok: true, blob }
  } catch { return { ok: false, status: null, code: null } }
}
