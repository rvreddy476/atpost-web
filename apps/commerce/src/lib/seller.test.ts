import { describe, expect, it } from 'vitest'
import {
  CANCEL_REASON_MAX,
  SELLER_TRANSITIONS,
  addressIsRoutingOnly,
  buildTimeline,
  canBookShipment,
  decodeAddressSnapshot,
  earningsCsvHref,
  isFenced,
  isNotFound,
  lineTotalMinor,
  nextOffset,
  normaliseHistoryRow,
  normaliseShipment,
  normaliseShipmentEvent,
  normaliseTracking,
  orderStatusUI,
  orderTotalMinor,
  returnStatusUI,
  sellerActionError,
  sellerActionPath,
  sellerActionsFor,
  sellerSubtotalMinor,
  shortId,
  summariseEarnings,
  timelineFromHistory,
  validateCancelReason,
  validateShipForm,
  variantSummary,
  type OrderHistoryRow,
} from './seller'

// The rules a seller's order page decides locally. Each block names the server
// fact it mirrors, so when the server moves, the failing test says where.

describe('sellerActionsFor mirrors migration 010 actor_type = seller', () => {
  it('lists exactly the four seller rows of order_status_transitions', () => {
    expect(SELLER_TRANSITIONS).toEqual([
      ['confirmed', 'packed'],
      ['confirmed', 'cancelled'],
      ['packed', 'shipped'],
      ['packed', 'cancelled'],
    ])
  })

  it('offers pack and cancel from confirmed', () => {
    expect(sellerActionsFor('confirmed').map((a) => a.kind)).toEqual(['pack', 'cancel'])
  })

  it('offers ship and cancel from packed', () => {
    expect(sellerActionsFor('packed').map((a) => a.kind)).toEqual(['ship', 'cancel'])
  })

  it('offers nothing once the courier has it, or after the end', () => {
    for (const s of ['shipped', 'out_for_delivery', 'delivered', 'cancelled', 'refunded', 'payment_pending']) {
      expect(sellerActionsFor(s)).toEqual([])
    }
  })

  it('has a seller route behind every action the table permits', () => {
    const packed = sellerActionsFor('packed')
    expect(packed.find((a) => a.kind === 'ship')?.route).toBe('/v1/commerce/seller/orders/{id}/ship')
    expect(packed.find((a) => a.kind === 'cancel')?.route).toBe('/v1/commerce/seller/orders/{id}/cancel')
    expect(sellerActionsFor('confirmed').find((a) => a.kind === 'pack')?.route).toBe('/v1/commerce/seller/orders/{id}/pack')
    for (const a of [...sellerActionsFor('confirmed'), ...sellerActionsFor('packed')]) {
      expect(a.route).toMatch(/^\/v1\/commerce\/seller\/orders\/\{id\}\//)
    }
  })
})

describe('sellerActionPath', () => {
  it('fills the order id into the seller route for each action', () => {
    expect(sellerActionPath('pack', 'o-1')).toBe('/v1/commerce/seller/orders/o-1/pack')
    expect(sellerActionPath('ship', 'o-1')).toBe('/v1/commerce/seller/orders/o-1/ship')
    expect(sellerActionPath('cancel', 'o-1')).toBe('/v1/commerce/seller/orders/o-1/cancel')
  })
  it('escapes an id that is not a plain uuid', () => {
    expect(sellerActionPath('pack', 'a/b')).toBe('/v1/commerce/seller/orders/a%2Fb/pack')
  })
})

describe('sellerActionError translates the 409s the seller routes answer', () => {
  const refusal = (status: number, code: string, message = 'server words') => ({
    response: { status, data: { error: { code, message } } },
  })

  it('explains TRANSITION_NOT_PERMITTED for pack and for ship', () => {
    expect(sellerActionError('pack', refusal(409, 'TRANSITION_NOT_PERMITTED'), 'x')).toMatch(/marked as packed/)
    expect(sellerActionError('ship', refusal(409, 'TRANSITION_NOT_PERMITTED'), 'x')).toMatch(/shipped/)
  })

  it('explains CANCEL_NOT_PERMITTED, TRACKING_NUMBER_IN_USE, ORDER_SHARED and REASON_REQUIRED', () => {
    expect(sellerActionError('cancel', refusal(409, 'CANCEL_NOT_PERMITTED'), 'x')).toMatch(/no longer be cancelled/)
    expect(sellerActionError('ship', refusal(409, 'TRACKING_NUMBER_IN_USE'), 'x')).toMatch(/already on another shipment/)
    expect(sellerActionError('pack', refusal(409, 'ORDER_SHARED'), 'x')).toMatch(/other sellers/)
    expect(sellerActionError('cancel', refusal(400, 'REASON_REQUIRED'), 'x')).toMatch(/reason/)
  })

  it('falls back to the server message, then to the default', () => {
    expect(sellerActionError('pack', refusal(500, 'INTERNAL', 'db down'), 'fallback')).toBe('db down')
    expect(sellerActionError('pack', { response: { status: 500 } }, 'fallback')).toBe('fallback')
    expect(sellerActionError('pack', undefined, 'fallback')).toBe('fallback')
  })
})

describe('validateCancelReason', () => {
  it('accepts a few words', () => {
    expect(validateCancelReason('Out of stock')).toBeNull()
  })
  it('refuses nothing, whitespace, and a bare couple of characters', () => {
    expect(validateCancelReason('')).toBeTruthy()
    expect(validateCancelReason('   ')).toBeTruthy()
    expect(validateCancelReason('no')).toBeTruthy()
  })
  it('caps the length', () => {
    expect(validateCancelReason('x'.repeat(CANCEL_REASON_MAX))).toBeNull()
    expect(validateCancelReason('x'.repeat(CANCEL_REASON_MAX + 1))).toBeTruthy()
  })
})

describe('canBookShipment follows CreateShipmentsForOrder, not the status table', () => {
  it('is live for a paid, confirmed order with no shipment', () => {
    expect(canBookShipment({ status: 'confirmed', payment_status: 'paid' }, null)).toBe(true)
    expect(canBookShipment({ status: 'packed', payment_status: 'paid' }, undefined)).toBe(true)
  })

  it('is live for cash on delivery even while payment is pending', () => {
    expect(canBookShipment({ status: 'confirmed', payment_status: 'pending', payment_method: 'cod' }, null)).toBe(true)
    expect(canBookShipment({ status: 'confirmed', payment_status: 'pending', payment_method: 'COD' }, null)).toBe(true)
  })

  it('refuses an unpaid prepaid order', () => {
    expect(canBookShipment({ status: 'confirmed', payment_status: 'pending', payment_method: 'razorpay' }, null)).toBe(false)
  })

  it('refuses once a shipment exists for this seller', () => {
    expect(canBookShipment({ status: 'confirmed', payment_status: 'paid' }, { status: 'booked' })).toBe(false)
    expect(canBookShipment({ status: 'confirmed', payment_status: 'paid' }, { status: 'pending' })).toBe(false)
  })

  it('refuses from any status the matrix does not let a seller act on', () => {
    for (const s of ['payment_pending', 'shipped', 'delivered', 'cancelled']) {
      expect(canBookShipment({ status: s, payment_status: 'paid' }, null)).toBe(false)
    }
  })
})

describe('status labels and colours', () => {
  it('names every status the orders CHECK admits', () => {
    for (const s of [
      'created', 'payment_pending', 'payment_failed', 'expired', 'paid', 'confirmed', 'packed', 'shipped',
      'out_for_delivery', 'delivered', 'cancelled', 'return_requested', 'return_approved', 'return_rejected',
      'return_picked_up', 'returned', 'refund_pending', 'refunded', 'awaiting_approval',
    ]) {
      const ui = orderStatusUI(s)
      expect(ui.label).not.toMatch(/_/)
      expect(ui.cls).toMatch(/^text-shop-/)
    }
  })

  it('colours the money moments gold and the end states good or bad', () => {
    expect(orderStatusUI('confirmed').cls).toBe('text-shop-gold')
    expect(orderStatusUI('delivered').cls).toBe('text-shop-good')
    expect(orderStatusUI('cancelled').cls).toBe('text-shop-bad')
    expect(orderStatusUI('shipped').cls).toBe('text-shop-interactive')
  })

  it('does not crash on a status it has never heard of', () => {
    expect(orderStatusUI('held_for_review')).toEqual({ label: 'Held for review', tone: 'muted', cls: 'text-shop-muted' })
    expect(orderStatusUI(undefined).label).toBe('Unknown')
  })

  it('has a return vocabulary of its own', () => {
    expect(returnStatusUI('requested').cls).toBe('text-shop-warn')
    expect(returnStatusUI('approved').cls).toBe('text-shop-good')
    expect(returnStatusUI('rejected').cls).toBe('text-shop-bad')
  })
})

describe('nextOffset on a route that filters after it pages', () => {
  it('keeps going after a short page, because the server may have dropped rows', () => {
    expect(nextOffset({ count: 3, offset: 0, limit: 20 })).toBe(20)
  })
  it('stops only on an empty page', () => {
    expect(nextOffset({ count: 0, offset: 40, limit: 20 })).toBeUndefined()
  })
  it('advances by the limit, not by what came back', () => {
    expect(nextOffset({ count: 20, offset: 20, limit: 20 })).toBe(40)
  })
})

describe('ship form validation', () => {
  it('normalises a tracking number the way the label prints it', () => {
    expect(normaliseTracking(' ab 12 cd-34 ')).toBe('AB12CD-34')
  })

  it('accepts a real AWB and a courier name', () => {
    expect(validateShipForm({ courier: 'Delhivery', tracking_number: '1234567890123' })).toEqual({})
    expect(validateShipForm({ courier: 'DHL', tracking_number: 'JD01-4600-0064-6987' })).toEqual({})
  })

  it('refuses an empty courier or an empty number', () => {
    const e = validateShipForm({ courier: ' ', tracking_number: '' })
    expect(e.courier).toBeTruthy()
    expect(e.tracking_number).toBeTruthy()
  })

  it('refuses a number that is too short, too long, or has punctuation', () => {
    expect(validateShipForm({ courier: 'Bluedart', tracking_number: '12345' }).tracking_number).toBeTruthy()
    expect(validateShipForm({ courier: 'Bluedart', tracking_number: 'A'.repeat(41) }).tracking_number).toBeTruthy()
    expect(validateShipForm({ courier: 'Bluedart', tracking_number: 'ABC#123456' }).tracking_number).toBeTruthy()
  })

  it('caps the courier name', () => {
    expect(validateShipForm({ courier: 'x'.repeat(61), tracking_number: '1234567890' }).courier).toBeTruthy()
  })
})

describe('money column selection after migration 007', () => {
  it('prefers paise and ignores a dead rupee column', () => {
    expect(orderTotalMinor({ total_minor: 92900, final_amount: 0 })).toBe(92900)
    expect(sellerSubtotalMinor({ seller_subtotal_minor: 92900, seller_subtotal: 929 })).toBe(92900)
    expect(lineTotalMinor({ final_price_minor: 49900, final_price: 0 })).toBe(49900)
  })

  it('falls back to rupees when the paise field is missing (bare /seller/orders rows, pre-007 orders)', () => {
    expect(orderTotalMinor({ final_amount: 12.99 })).toBe(1299)
    expect(sellerSubtotalMinor({ seller_subtotal: 929 })).toBe(92900)
    expect(lineTotalMinor({ final_price: 0.1 })).toBe(10)
  })

  it('reads zero as zero rather than as absent', () => {
    expect(orderTotalMinor({ total_minor: 0, final_amount: 0 })).toBe(0)
  })
})

describe('earningsCsvHref', () => {
  it('lives under the zone base so the proxy rewrite catches it', () => {
    expect(earningsCsvHref('/shop')).toBe('/shop/v1/commerce/seller/earnings.csv')
  })
  it('works from the root and strips a trailing slash', () => {
    expect(earningsCsvHref('')).toBe('/v1/commerce/seller/earnings.csv')
    expect(earningsCsvHref('/shop/')).toBe('/shop/v1/commerce/seller/earnings.csv')
  })
  it('appends no query, because the route reads none', () => {
    expect(earningsCsvHref('/shop')).not.toContain('?')
  })
})

describe('decodeAddressSnapshot', () => {
  const full = {
    contact_name: 'Asha Rao', phone: '9876543210', address_line_1: '12 MG Road',
    city: 'Bengaluru', state: 'KA', postal_code: '560001', country: 'IN',
  }

  it('reads the base64 the Go []byte arrives as', () => {
    const b64 = Buffer.from(JSON.stringify(full)).toString('base64')
    expect(decodeAddressSnapshot(b64)).toMatchObject(full)
  })

  it('reads a JSON string and an object too', () => {
    expect(decodeAddressSnapshot(JSON.stringify(full))).toMatchObject(full)
    expect(decodeAddressSnapshot(full)).toMatchObject(full)
  })

  it('answers null for nothing, junk, and an empty object', () => {
    expect(decodeAddressSnapshot(null)).toBeNull()
    expect(decodeAddressSnapshot('')).toBeNull()
    expect(decodeAddressSnapshot('not base64 and not json')).toBeNull()
    expect(decodeAddressSnapshot({})).toBeNull()
  })

  it('recognises a post-cutover routing-only snapshot', () => {
    const routing = decodeAddressSnapshot({ city: 'Pune', state: 'MH', postal_code: '411001', country: 'IN' })
    expect(routing).not.toBeNull()
    expect(addressIsRoutingOnly(routing!)).toBe(true)
    expect(addressIsRoutingOnly(decodeAddressSnapshot(full)!)).toBe(false)
  })
})

describe('normaliseShipment reads the tagged wire shape first', () => {
  it('maps the snake_case keys the json tags emit, all of them', () => {
    const sh = normaliseShipment({
      id: 'sh-1', order_id: 'o-1', seller_id: 's-1', courier: 'delhivery', tracking_number: 'AWB123456',
      courier_order_id: 'co-9', label_url: 'https://x/label.pdf', tracking_url: null, status: 'in_transit', eta: null,
      shipped_at: '2026-09-10T10:00:00Z', delivered_at: null, last_event_at: '2026-09-10T11:00:00Z',
      created_at: '2026-09-10T09:00:00Z', updated_at: '2026-09-10T11:00:00Z',
    })
    expect(sh).toEqual({
      id: 'sh-1', order_id: 'o-1', seller_id: 's-1', courier: 'delhivery', tracking_number: 'AWB123456',
      courier_order_id: 'co-9', tracking_url: null, label_url: 'https://x/label.pdf', status: 'in_transit', eta: null,
      shipped_at: '2026-09-10T10:00:00Z', delivered_at: null, last_event_at: '2026-09-10T11:00:00Z',
      created_at: '2026-09-10T09:00:00Z', updated_at: '2026-09-10T11:00:00Z',
    })
  })

  it('still reads the PascalCase spelling an untagged answer used', () => {
    const sh = normaliseShipment({
      ID: 'sh-1', OrderID: 'o-1', SellerID: 's-1', Courier: 'delhivery', TrackingNumber: 'AWB123456',
      TrackingURL: null, LabelURL: 'https://x/label.pdf', Status: 'in_transit', ETA: null,
      ShippedAt: '2026-09-10T10:00:00Z', DeliveredAt: null, CreatedAt: '2026-09-10T09:00:00Z',
    })
    expect(sh).toMatchObject({
      id: 'sh-1', courier: 'delhivery', tracking_number: 'AWB123456', label_url: 'https://x/label.pdf',
      status: 'in_transit', shipped_at: '2026-09-10T10:00:00Z', created_at: '2026-09-10T09:00:00Z',
      courier_order_id: null, last_event_at: null, updated_at: null,
    })
  })

  it('prefers snake_case when both spellings are present', () => {
    const sh = normaliseShipment({ id: 'new', ID: 'old', courier: 'dhl', Courier: 'stale', status: 'booked' })
    expect(sh).toMatchObject({ id: 'new', courier: 'dhl', status: 'booked' })
  })

  it('answers null for no shipment', () => {
    expect(normaliseShipment(null)).toBeNull()
    expect(normaliseShipment({})).toBeNull()
  })

  it('normalises events with either spelling', () => {
    expect(normaliseShipmentEvent({
      id: 'e1', shipment_id: 'sh-1', status: 'delivered', location: 'Pune', remark: null,
      occurred_at: '2026-09-11T00:00:00Z', created_at: '2026-09-11T00:00:01Z',
    })).toEqual({ id: 'e1', shipment_id: 'sh-1', status: 'delivered', location: 'Pune', remark: null, occurred_at: '2026-09-11T00:00:00Z' })
    expect(normaliseShipmentEvent({ ID: 'e1', Status: 'delivered', Location: 'Pune', OccurredAt: '2026-09-11T00:00:00Z' }))
      .toEqual({ id: 'e1', shipment_id: null, status: 'delivered', location: 'Pune', remark: null, occurred_at: '2026-09-11T00:00:00Z' })
    expect(normaliseShipmentEvent({ status: 'x' })).toBeNull()
  })
})

describe('normaliseHistoryRow reads order_status_history as the route sends it', () => {
  it('keeps every field and nulls the omitempty ones', () => {
    expect(normaliseHistoryRow({
      id: 'h1', order_id: 'o-1', to_status: 'created', actor_type: 'system', created_at: '2026-09-01T09:00:00Z',
    })).toEqual({
      id: 'h1', order_id: 'o-1', from_status: null, to_status: 'created', changed_by: null,
      actor_type: 'system', notes: null, created_at: '2026-09-01T09:00:00Z',
    })
  })
  it('refuses a row with no status or no time', () => {
    expect(normaliseHistoryRow({ id: 'h', created_at: '2026-09-01T09:00:00Z' })).toBeNull()
    expect(normaliseHistoryRow({ id: 'h', to_status: 'paid' })).toBeNull()
    expect(normaliseHistoryRow(null)).toBeNull()
  })
})

describe('timelineFromHistory', () => {
  const row = (id: string, to: string, at: string, extra: Partial<OrderHistoryRow> = {}) =>
    normaliseHistoryRow({ id, to_status: to, created_at: at, ...extra })!

  const history = [
    row('h1', 'created', '2026-09-01T09:00:00Z', { actor_type: 'system' }),
    row('h2', 'paid', '2026-09-01T09:05:00Z', { actor_type: 'system' }),
    row('h3', 'confirmed', '2026-09-01T09:05:01Z', { actor_type: 'system' }),
    row('h4', 'packed', '2026-09-02T09:00:00Z', { actor_type: 'seller', notes: 'packed by seller' }),
    row('h5', 'shipped', '2026-09-02T12:00:00Z', { actor_type: 'seller' }),
  ]

  it('walks the history in time order with the seller-facing labels', () => {
    const t = timelineFromHistory(history)
    expect(t.map((e) => e.key)).toEqual(['history-h1', 'history-h2', 'history-h3', 'history-h4', 'history-h5'])
    expect(t.map((e) => e.label)).toEqual(['Order placed', 'Payment received', 'Order confirmed', 'Packed', 'Handed to courier'])
    expect(t[3].detail).toBe('by you: packed by seller')
    expect(t[0].detail).toBe('by the platform')
  })

  it('merges courier events the order status never recorded, in time order', () => {
    const events = [
      normaliseShipmentEvent({ id: 'a', status: 'in_transit', location: 'Hub', occurred_at: '2026-09-03T08:00:00Z' })!,
    ]
    const keys = timelineFromHistory(history, events).map((e) => e.key)
    expect(keys).toEqual(['history-h1', 'history-h2', 'history-h3', 'history-h4', 'history-h5', 'event-a'])
  })

  it('drops a courier event whose status the history already records', () => {
    const delivered = [...history, row('h6', 'delivered', '2026-09-05T10:00:00Z', { actor_type: 'system' })]
    const events = [
      normaliseShipmentEvent({ id: 'd', status: 'delivered', occurred_at: '2026-09-05T10:00:00Z' })!,
      normaliseShipmentEvent({ id: 'x', status: 'in_transit', occurred_at: '2026-09-03T08:00:00Z' })!,
    ]
    const keys = timelineFromHistory(delivered, events).map((e) => e.key)
    expect(keys).toContain('event-x')
    expect(keys).not.toContain('event-d')
    expect(keys).toContain('history-h6')
  })

  it('shows a cancellation with who and why', () => {
    const t = timelineFromHistory([
      row('h1', 'confirmed', '2026-09-01T09:00:00Z'),
      row('h2', 'cancelled', '2026-09-01T10:00:00Z', { actor_type: 'seller', notes: 'out of stock' }),
    ])
    expect(t[1]).toMatchObject({ label: 'Cancelled', detail: 'by you: out of stock', at: '2026-09-01T10:00:00Z' })
  })

  it('is empty for an empty history', () => {
    expect(timelineFromHistory([])).toEqual([])
  })
})

describe('variantSummary', () => {
  it('renders option pairs from base64, JSON or an object', () => {
    const obj = { size: 'M', colour: 'Navy' }
    expect(variantSummary(obj)).toBe('Size: M · Colour: Navy')
    expect(variantSummary(JSON.stringify(obj))).toBe('Size: M · Colour: Navy')
    expect(variantSummary(Buffer.from(JSON.stringify(obj)).toString('base64'))).toBe('Size: M · Colour: Navy')
  })
  it('renders nothing for a line without options', () => {
    expect(variantSummary(null)).toBe('')
    expect(variantSummary('')).toBe('')
    expect(variantSummary({})).toBe('')
  })
})

describe('buildTimeline', () => {
  const order = { created_at: '2026-09-01T09:00:00Z', updated_at: '2026-09-03T09:00:00Z', status: 'shipped', payment_status: 'paid' }
  const shipment = normaliseShipment({
    ID: 'sh', Courier: 'delhivery', TrackingNumber: 'AWB1', Status: 'in_transit',
    CreatedAt: '2026-09-02T09:00:00Z', ShippedAt: '2026-09-02T12:00:00Z',
  })!

  it('walks placed, paid, booked, shipped, then courier events in time order', () => {
    const events = [
      normaliseShipmentEvent({ ID: 'b', Status: 'out_for_delivery', OccurredAt: '2026-09-04T08:00:00Z' })!,
      normaliseShipmentEvent({ ID: 'a', Status: 'in_transit', Location: 'Hub', OccurredAt: '2026-09-03T08:00:00Z' })!,
    ]
    const keys = buildTimeline(order, shipment, events).map((e) => e.key)
    expect(keys).toEqual(['placed', 'paid', 'booked', 'shipped', 'event-a', 'event-b'])
  })

  it('records payment without inventing a time for it', () => {
    const paid = buildTimeline(order, null).find((e) => e.key === 'paid')
    expect(paid?.at).toBeNull()
  })

  it('adds delivered from the shipment stamp only when no courier event already says so', () => {
    const delivered = { ...shipment, delivered_at: '2026-09-05T10:00:00Z' }
    expect(buildTimeline({ ...order, status: 'delivered' }, delivered).some((e) => e.key === 'delivered')).toBe(true)
    const ev = [normaliseShipmentEvent({ ID: 'd', Status: 'delivered', OccurredAt: '2026-09-05T10:00:00Z' })!]
    const keys = buildTimeline({ ...order, status: 'delivered' }, delivered, ev).map((e) => e.key)
    expect(keys).toContain('event-d')
    expect(keys).not.toContain('delivered')
  })

  it('ends a cancelled order with who and why', () => {
    const t = buildTimeline(
      { ...order, status: 'cancelled', cancelled_by: 'customer', cancellation_reason: 'changed mind' },
      null,
    )
    expect(t[t.length - 1]).toMatchObject({ key: 'cancelled', at: order.updated_at, detail: 'by customer: changed mind' })
  })

  it('is empty for an order with no dates at all', () => {
    expect(buildTimeline({ status: 'created' }, null)).toEqual([])
  })
})

describe('isFenced', () => {
  it('recognises the P0 fence answer', () => {
    expect(isFenced({ response: { status: 404, data: { error: { code: 'NOT_FOUND' } } } })).toBe(true)
    expect(isFenced({ response: { status: 404 } })).toBe(true)
  })
  it('does not mistake other failures for it', () => {
    expect(isFenced({ response: { status: 403 } })).toBe(false)
    expect(isFenced({ response: { status: 404, data: { error: { code: 'ORDER_NOT_FOUND' } } } })).toBe(false)
    expect(isFenced(undefined)).toBe(false)
  })
})

describe('isNotFound', () => {
  it('is any 404, whatever the code, so a missing history route falls back', () => {
    expect(isNotFound({ response: { status: 404 } })).toBe(true)
    expect(isNotFound({ response: { status: 404, data: { error: { code: 'ORDER_NOT_FOUND' } } } })).toBe(true)
  })
  it('is not a 403 or a network failure', () => {
    expect(isNotFound({ response: { status: 403 } })).toBe(false)
    expect(isNotFound(new Error('offline'))).toBe(false)
    expect(isNotFound(undefined)).toBe(false)
  })
})

describe('summariseEarnings', () => {
  it('sums each column and rounds once', () => {
    const rows = [
      { gross_amount: 100.1, commission_amount: 10.01, platform_fee: 2.002, tds_amount: 0.88, net_amount: 87.208 },
      { gross_amount: 200.2, commission_amount: 20.02, platform_fee: 4.004, tds_amount: 1.76, net_amount: 174.416 },
    ]
    expect(summariseEarnings(rows)).toEqual({
      count: 2, gross: 300.3, commission: 30.03, platform_fee: 6.01, tds: 2.64, net: 261.62,
    })
  })
  it('is all zeros for no rows', () => {
    expect(summariseEarnings([])).toEqual({ count: 0, gross: 0, commission: 0, platform_fee: 0, tds: 0, net: 0 })
  })
})

describe('shortId', () => {
  it('takes the first block of a uuid, upper-cased', () => {
    expect(shortId('7cd6ea3a-9c80-4f20-806f-5d08de0f914b')).toBe('7CD6EA3A')
    expect(shortId(undefined)).toBe('unknown')
  })
})
