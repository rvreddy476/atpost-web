'use client'

import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '@atpost/api-client'
import { useOnboardingStatus } from '@/hooks/useSellerOnboarding'
import { loadGoogleMaps, selectedPlace, type GooglePlace, type PlacesLibrary } from '@/lib/deliveryMaps'

export type DeliveryPin = { latitude: number; longitude: number; label: string }

/** No device-location request and no saved-address disclosure until opt-in. */
export function DeliveryPinPicker({ label, onChange }: { label: string; onChange: (pin: DeliveryPin | null) => void }) {
  const [open, setOpen] = useState(false)
  const [candidate, setCandidate] = useState<DeliveryPin | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState('')
  const host = useRef<HTMLDivElement>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  useEffect(() => {
    if (!open) return
    let gone = false
    let element: HTMLElement | undefined
    let version = 0
    void (async () => {
      try {
        const google = await loadGoogleMaps()
        const places = await google.maps.importLibrary('places') as PlacesLibrary
        if (gone || !host.current) return
        element = new places.PlaceAutocompleteElement({ includedRegionCodes: ['in'] })
        element.setAttribute('aria-label', 'Search the exact delivery or pickup address')
        element.addEventListener('gmp-error', () => { if (!gone) setError('Address search is unavailable. You can continue with the existing courier service.') })
        element.addEventListener('gmp-select', async event => {
          const request = ++version
          setConfirmed(false); setCandidate(null); onChangeRef.current(null)
          try {
            const place = (event as Event & { placePrediction: { toPlace(): GooglePlace } }).placePrediction.toPlace()
            await place.fetchFields({ fields: ['location', 'formattedAddress', 'addressComponents'] })
            if (gone || version !== request) return
            const result = selectedPlace(place)
            if (!result?.address) throw new Error('Choose an address with a valid map location.')
            setCandidate({ latitude: result.lat, longitude: result.lng, label: result.address }); setError('')
          } catch { if (!gone && request === version) setError('That address could not be located. Please search again.') }
        })
        host.current.replaceChildren(element)
      } catch { if (!gone) setError('Address search is not available. Existing courier delivery remains available without a map pin.') }
    })()
    return () => { gone = true; element?.remove() }
  }, [open])
  return <div className="space-y-3">
    {!open ? <button className="btn btn-outline btn-sm" type="button" onClick={() => setOpen(true)}>Add precise location (optional)</button> : <>
      <p className="text-sm text-shop-muted">Search uses Google Maps. Choose the location that matches: <strong>{label}</strong>. Your device location is not requested.</p>
      <div ref={host} className="min-h-12" />
      {candidate ? <div className="panel p-4 space-y-3"><p className="text-sm">{candidate.label}</p><label className="choice-row"><input type="checkbox" checked={confirmed} onChange={e => { setConfirmed(e.target.checked); onChangeRef.current(e.target.checked ? candidate : null) }} /><span>This is the exact delivery / pickup address.</span></label></div> : null}
      {error ? <p role="alert" className="text-sm text-shop-bad">{error}</p> : null}
      <button type="button" className="quiet-link" onClick={() => { setOpen(false); setCandidate(null); setConfirmed(false); onChangeRef.current(null) }}>Remove map pin</button>
    </>}
  </div>
}

type LocalJob = { id: string; shipment_id: string; seller_id: string; status: string; pickup_label: string; drop_label: string }
export function readLocalJobs(raw: unknown): LocalJob[] {
  if (!Array.isArray(raw) || raw.some(row => !row || typeof row !== 'object' ||
    ['id', 'shipment_id', 'seller_id', 'status', 'pickup_label', 'drop_label'].some(key => typeof row[key] !== 'string') ||
    !row.id || !row.shipment_id || !row.seller_id || !Object.hasOwn(stateLabel, row.status))) {
    throw new Error('Delivery status could not be read.')
  }
  return raw as LocalJob[]
}
export function SellerPickupLocation() {
  const seller = useOnboardingStatus()
  const id = seller.data?.id
  const [pin, setPin] = useState<DeliveryPin | null>(null)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const q = useQuery({ queryKey: ['commerce', 'seller-pickup', id], enabled: !!id, retry: false, queryFn: async () => (await api.get(`/v1/commerce/delivery/sellers/${id}/location`)).data.data as DeliveryPin | null })
  if (!id) return null
  return <section className="panel panel-pad my-5 space-y-3"><h2 className="panel-heading">Local delivery pickup location</h2><p className="text-sm text-shop-muted">For sellers enrolled by an admin in local delivery. This does not enable local delivery or change existing shipments.</p>
    {q.isLoading ? <p role="status">Checking saved location…</p> : q.isError ? <p role="alert">Saved location could not be loaded. <button className="quiet-link" onClick={() => q.refetch()}>Retry</button></p> : <p className="text-sm">{q.data?.label ?? 'No pickup pin saved.'}</p>}
    {!editing ? <button className="btn btn-outline btn-sm" disabled={q.isLoading || q.isError} onClick={() => setEditing(true)}>{q.data ? 'Update pickup location' : 'Set pickup location'}</button> : <><DeliveryPinPicker label={seller.data?.store_name ?? 'your store pickup address'} onChange={setPin} /><button className="btn btn-gold btn-sm" disabled={!pin || busy} onClick={async () => { if (!pin) return; setBusy(true); setError(''); try { await api.put(`/v1/commerce/delivery/sellers/${id}/location`, pin); await q.refetch(); setEditing(false); setPin(null) } catch { setError('Pickup location could not be saved. Try again.') } finally { setBusy(false) } }}>{busy ? 'Saving…' : 'Save pickup location'}</button></>}
    {error ? <p role="alert" className="text-sm text-shop-bad">{error}</p> : null}
  </section>
}
const stateLabel: Record<string, string> = { awaiting_ready: 'Seller preparing your order', unassigned: 'Waiting for an available delivery partner', assigned: 'Delivery partner assigned', picked_up: 'Picked up — on the way', delivered: 'Delivered', failed: 'Delivery needs support', cancelled: 'Local delivery cancelled' }

export function LocalDeliveryTracking({ orderId, seller = false }: { orderId: string; seller?: boolean }) {
  const q = useQuery({ queryKey: ['commerce', 'local-delivery', orderId, seller], queryFn: async () => {
    const raw = (await api.get(`/v1/commerce/delivery/orders/${orderId}/jobs`)).data.data
    return readLocalJobs(raw)
  }, retry: false, refetchInterval: 15000 })
  if (q.isLoading) return <p className="text-sm text-shop-muted" role="status">Checking local delivery…</p>
  if (q.isError) return <div className="notice notice-error" role="alert">Local delivery status could not be checked. <button className="quiet-link" onClick={() => q.refetch()}>Retry</button></div>
  if (!q.data?.length) return null
  return <section className="panel panel-pad space-y-4"><h2 className="panel-heading">Local delivery</h2>{q.data.map(job => <DeliveryHandover key={`${job.id}:${job.status}`} job={job} seller={seller} refresh={() => { void q.refetch() }} />)}</section>
}

function DeliveryHandover({ job, seller, refresh }: { job: LocalJob; seller: boolean; refresh: () => void }) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const revealVersion = useRef(0)
  useEffect(() => {
    const clear = () => { if (document.hidden) { revealVersion.current++; setCode('') } }
    document.addEventListener('visibilitychange', clear)
    return () => { revealVersion.current++; document.removeEventListener('visibilitychange', clear) }
  }, [])
  const reveal = async () => {
    const request = ++revealVersion.current
    setBusy(true); setError(''); setCode('')
    try {
      if (seller) {
        const raw = (await api.post(`/v1/commerce/delivery/seller/jobs/${job.id}/ready`, {})).data.data
        if (typeof raw?.pickup_code !== 'string' || !raw.pickup_code) throw new Error('Pickup code unavailable')
        if (request === revealVersion.current && !document.hidden) setCode(raw.pickup_code)
        refresh()
      } else {
        const raw = (await api.get(`/v1/commerce/delivery/customer/jobs/${job.id}/code`)).data.data
        if (typeof raw?.delivery_code !== 'string' || !raw.delivery_code) throw new Error('Delivery code unavailable')
        if (request === revealVersion.current && !document.hidden) setCode(raw.delivery_code)
      }
    } catch { setError('The code is not available for the current job state. Refresh and try again.') }
    finally { setBusy(false) }
  }
  const canReveal = seller ? ['awaiting_ready', 'unassigned', 'assigned'].includes(job.status) : ['assigned', 'picked_up'].includes(job.status)
  return <div className="rounded-lg border border-shop-line p-4 space-y-3"><div className="font-semibold">{stateLabel[job.status] ?? 'Delivery status updating'}</div><p className="text-xs text-shop-faint">Shipment {job.shipment_id}</p><p className="text-sm text-shop-muted">{seller ? job.pickup_label : job.drop_label}</p>
    {canReveal ? <><p className="text-sm">{seller ? 'Mark the parcel ready, then share this pickup code only when handing it to the assigned delivery partner.' : 'Share this delivery code with the assigned partner only when you receive this shipment.'}</p><button className="btn btn-outline btn-sm" disabled={busy} onClick={reveal}>{busy ? 'Checking…' : seller && job.status === 'awaiting_ready' ? 'Parcel ready for pickup' : seller ? 'Show pickup code' : 'Show delivery code'}</button></> : null}
    {code ? <div role="status" className="text-2xl font-semibold tracking-widest">{code} <button className="quiet-link text-sm tracking-normal" onClick={() => setCode('')}>Hide</button></div> : null}
    {error ? <p role="alert" className="text-sm text-shop-bad">{error}</p> : null}
  </div>
}

