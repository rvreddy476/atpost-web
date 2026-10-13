"use client"

import { useEffect, useRef, useState } from 'react'
import { Eye } from 'lucide-react'
import { Dialog } from './Dialog'
import { buttonSecondary } from './buttons'
import { KycDocumentViewer } from '@/components/commerce/KycDocumentViewer'
import { useAdmin } from '@/components/shell/AdminShell'
import { useStepUp } from '@/components/shell/StepUpProvider'
import { apiUrl } from '@/lib/admin/api'
import { fetchPartnerEvidence } from '@/lib/admin/partnerEvidence'
import { stepUpWindowOpen, viewKycDocument, watermarkLines } from '@/lib/admin/kycView'

export function PartnerEvidenceButton({ path, title = 'Partner verification' }: { path: string; title?: string }) {
  const { me } = useAdmin()
  const requestStepUp = useStepUp()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [media, setMedia] = useState<{ bitmap?: ImageBitmap; url?: string; lines: string[] } | null>(null)
  const resources = useRef<{ bitmap?: ImageBitmap; url?: string }>({})
  const request = useRef<AbortController | null>(null)
  const video = useRef<HTMLVideoElement>(null)
  const clear = () => {
    request.current?.abort()
    video.current?.pause()
    resources.current.bitmap?.close()
    if (resources.current.url) URL.revokeObjectURL(resources.current.url)
    resources.current = {}
  }
  useEffect(() => {
    setMedia(null)
    setBusy(false)
    return clear
  }, [me.userId, path])
  const close = () => { clear(); setMedia(null); setBusy(false) }
  const open = async () => {
    clear()
    const controller = new AbortController()
    request.current = controller
    setBusy(true); setError('')
    try {
      const result = await viewKycDocument({
        stepUpWindowOpen: stepUpWindowOpen(me.stepUpValidUntil, Date.now()), requestStepUp,
        fetchImage: () => fetchPartnerEvidence(apiUrl(path), controller.signal),
      })
      if (controller.signal.aborted) return
      if (result.kind === 'error') { setError(result.message); return }
      if (result.kind !== 'ok') return
      const next = result.blob.type.startsWith('video/') ? { url: URL.createObjectURL(result.blob) } : { bitmap: await createImageBitmap(result.blob) }
      if (controller.signal.aborted) { next.bitmap?.close(); if (next.url) URL.revokeObjectURL(next.url); return }
      resources.current = next
      setMedia({ ...next, lines: watermarkLines(me.userId, new Date()) })
    } catch { if (!controller.signal.aborted) setError('This file cannot be displayed. Please request a replacement.') }
    finally { if (!controller.signal.aborted) setBusy(false) }
  }
  return <>
    <button type="button" className={buttonSecondary} disabled={busy} onClick={open}><Eye className="h-4 w-4" aria-hidden="true" />{busy ? 'Opening…' : 'View'}</button>
    {error ? <p role="alert" className="mt-1 text-xs text-mo-danger">{error}</p> : null}
    {media?.bitmap ? <KycDocumentViewer open title={title} bitmap={media.bitmap} watermark={media.lines} onClose={close} /> : null}
    {media?.url ? <Dialog open title={title} onClose={close} size="xl" className="kyc-viewer">
      <div className="relative select-none" onContextMenu={(e) => e.preventDefault()}>
        <video ref={video} src={media.url} controls controlsList="nodownload noremoteplayback" disablePictureInPicture playsInline className="mx-auto max-h-[70dvh] w-full rounded-mo bg-black" onError={() => setError('This browser cannot play this recording. Request an MP4 or WebM replacement.')} />
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center break-all px-6 text-center text-sm text-white opacity-60">{media.lines.join(' · ')}</div>
      </div>
    </Dialog> : null}
  </>
}
