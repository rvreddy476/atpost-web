import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
const state = vi.hoisted(() => ({ data: [] as unknown[], isLoading: false, isError: false }))
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ ...state, refetch: () => undefined }) }))
vi.mock('@/hooks/useSellerOnboarding', () => ({ useOnboardingStatus: () => ({ data: null }) }))
vi.mock('@atpost/api-client', () => ({ default: { get: vi.fn(), post: vi.fn() } }))
import { DeliveryPinPicker, LocalDeliveryTracking, readLocalJobs } from './LocalDelivery'
afterEach(() => { state.data = []; state.isLoading = false; state.isError = false })
describe('Local delivery handover', () => {
  it('does not convert malformed tracking responses to empty or usable shipments', () => {
    expect(readLocalJobs([])).toEqual([])
    const job = { id: 'job', shipment_id: 'shipment', seller_id: 'seller', status: 'assigned', pickup_label: 'Pickup', drop_label: 'Destination' }
    expect(readLocalJobs([job])).toEqual([job])
    for (const raw of [null, {}, [null], [{ ...job, id: '' }], [{ ...job, status: 'unknown' }], [{ ...job, seller_id: undefined }]]) {
      expect(() => readLocalJobs(raw)).toThrow('Delivery status could not be read.')
    }
  })
  it('does not expose a location or request permission before opt-in', () => {
    const html = renderToStaticMarkup(<DeliveryPinPicker label="Saved private address" onChange={() => undefined} />)
    expect(html).toContain('Add precise location (optional)')
    expect(html).not.toContain('Saved private address')
    expect(html).not.toContain('iframe')
  })
  it('distinguishes loading and failure from no local shipments', () => {
    state.isLoading = true
    expect(renderToStaticMarkup(<LocalDeliveryTracking orderId="order" />)).toContain('Checking local delivery')
    state.isLoading = false; state.isError = true
    expect(renderToStaticMarkup(<LocalDeliveryTracking orderId="order" />)).toContain('could not be checked')
    state.isError = false
    expect(renderToStaticMarkup(<LocalDeliveryTracking orderId="order" />)).toBe('')
  })
  it.each(['awaiting_ready', 'unassigned', 'failed', 'delivered', 'cancelled'])('never reveals customer codes for %s', status => {
    state.data = [{ id: 'job', shipment_id: 'shipment', status }]
    expect(renderToStaticMarkup(<LocalDeliveryTracking orderId="order" />)).not.toContain('Show delivery code')
  })
  it('separates customer receipt from seller pickup confirmation', () => {
    state.data = [{ id: 'job', shipment_id: 'shipment', status: 'assigned' }]
    const customer = renderToStaticMarkup(<LocalDeliveryTracking orderId="order" />)
    expect(customer).toContain('Show delivery code')
    expect(customer).not.toContain('Show pickup code')
    const seller = renderToStaticMarkup(<LocalDeliveryTracking orderId="order" seller />)
    expect(seller).toContain('Show pickup code')
    expect(seller).not.toContain('Show delivery code')
  })
})
