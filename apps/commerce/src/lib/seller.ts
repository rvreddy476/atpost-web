// The seller's side of an order, as pure functions.
//
// Everything the MSeller order pages need to decide without a network round
// trip lives here: which buttons a status permits, what a status is called and
// what colour it wears, whether a tracking number looks like one, how the CSV
// link is spelled, and how the server's less tidy shapes (a PascalCase
// shipment, a base64 address blob) become something a page can render. Pure,
// so each rule is testable on its own and the pages stay thin.

import type { FulfillmentStage } from '@/hooks/useCommerce'

// ── The state machine, mirrored ────────────────────────────────────────
//
// Source of truth: commerce-service
//   database/migrations/010_gst_and_state_machine.sql
// The `order_status_transitions` rows with actor_type = 'seller', copied
// verbatim. The trigger in that migration refuses any transition not in the
// table, so a button offered here for a pair absent there would only ever
// produce a 400. Keep this list identical to the migration; do not "improve"
// it from the client side.
export const SELLER_TRANSITIONS: ReadonlyArray<readonly [from: string, to: string]> = [
  ['confirmed', 'packed'],
  ['confirmed', 'cancelled'],
  ['packed', 'shipped'],
  ['packed', 'cancelled'],
]

export type SellerActionKind = 'pack' | 'ship' | 'cancel'

export interface SellerAction {
  kind: SellerActionKind
  /** The status this action moves the order to. */
  to: string
  /**
   * The HTTP route that performs it, or null when the matrix permits the
   * transition but commerce-service exposes no seller route for it. A page
   * renders a null-route action disabled rather than hiding it: the seller
   * should see that the step exists and that the platform, not they, is what
   * is missing.
   *
   * As of 2026-09-12 (internal/http/handler.go, internal/http/shipments.go):
   *   ship   → POST /v1/commerce/orders/{id}/shipment
   *   pack   → no route
   *   cancel → no seller route. POST /orders/{id}/cancel hard-codes the actor
   *            as "customer" and checks customer ownership, so a seller
   *            calling it gets CANCEL_FAILED.
   */
  route: string | null
}

const ACTION_FOR_TARGET: Record<string, { kind: SellerActionKind; route: string | null }> = {
  packed: { kind: 'pack', route: null },
  shipped: { kind: 'ship', route: '/v1/commerce/orders/{id}/shipment' },
  cancelled: { kind: 'cancel', route: null },
}

/** The actions the transition table allows a seller from this status, in table order. */
export function sellerActionsFor(status: string): SellerAction[] {
  const out: SellerAction[] = []
  for (const [from, to] of SELLER_TRANSITIONS) {
    if (from !== status) continue
    const meta = ACTION_FOR_TARGET[to]
    if (!meta) continue
    out.push({ kind: meta.kind, to, route: meta.route })
  }
  return out
}

/**
 * Whether the Ship button should be live.
 *
 * The shipment route (service/shipments.go CreateShipmentsForOrder) has its
 * own gate that is NOT the status table: it refuses unless the gateway has
 * captured (`payment_status = paid`) or the order is COD, and it is idempotent
 * per seller, so a second booking returns the first. From the seller's chair
 * that means: the order is confirmed or packed, it is paid or cash on
 * delivery, and no shipment exists for them yet. The route itself does not
 * read `status` at all, which is why `confirmed` is accepted here even though
 * the matrix only lists packed → shipped for a seller: with no route to reach
 * `packed`, insisting on it would mean nobody could ever ship.
 */
export function canBookShipment(
  order: { status: string; payment_status?: string; payment_method?: string | null },
  shipment: { status?: string } | null | undefined,
): boolean {
  if (order.status !== 'confirmed' && order.status !== 'packed') return false
  const cod = (order.payment_method ?? '').toLowerCase() === 'cod'
  if (order.payment_status !== 'paid' && !cod) return false
  if (shipment && shipment.status && shipment.status !== 'pending') return false
  return !shipment
}

// ── Status vocabulary ───────────────────────────────────────────────────

export type StatusTone = 'warn' | 'gold' | 'interactive' | 'good' | 'bad' | 'muted'

interface StatusUI {
  label: string
  tone: StatusTone
}

/**
 * Every value `orders_status_check_v2` admits (migration 010), with the
 * label a seller reads and the hue it wears. Same reasoning as the buyer's
 * list: an order in motion is the interactive colour, money-taken moments are
 * gold, done is good, dead is bad, and anything waiting on someone is a
 * warning. Unknown statuses fall through to muted rather than crashing the
 * row, because a status added on the server tomorrow must not blank the page.
 */
const ORDER_STATUS_UI: Record<string, StatusUI> = {
  created: { label: 'Created', tone: 'muted' },
  payment_pending: { label: 'Payment pending', tone: 'warn' },
  payment_failed: { label: 'Payment failed', tone: 'bad' },
  expired: { label: 'Expired', tone: 'muted' },
  paid: { label: 'Paid', tone: 'gold' },
  confirmed: { label: 'Confirmed', tone: 'gold' },
  packed: { label: 'Packed', tone: 'interactive' },
  shipped: { label: 'Shipped', tone: 'interactive' },
  out_for_delivery: { label: 'Out for delivery', tone: 'interactive' },
  delivered: { label: 'Delivered', tone: 'good' },
  cancelled: { label: 'Cancelled', tone: 'bad' },
  return_requested: { label: 'Return requested', tone: 'warn' },
  return_approved: { label: 'Return approved', tone: 'warn' },
  return_rejected: { label: 'Return rejected', tone: 'muted' },
  return_picked_up: { label: 'Return picked up', tone: 'interactive' },
  returned: { label: 'Returned', tone: 'muted' },
  refund_pending: { label: 'Refund pending', tone: 'warn' },
  refunded: { label: 'Refunded', tone: 'muted' },
  awaiting_approval: { label: 'Awaiting approval', tone: 'warn' },
}

const RETURN_STATUS_UI: Record<string, StatusUI> = {
  requested: { label: 'Requested', tone: 'warn' },
  approved: { label: 'Approved', tone: 'good' },
  rejected: { label: 'Rejected', tone: 'bad' },
  refunded: { label: 'Refunded', tone: 'muted' },
  closed: { label: 'Closed', tone: 'muted' },
}

const TONE_CLASS: Record<StatusTone, string> = {
  warn: 'text-shop-warn',
  gold: 'text-shop-gold',
  interactive: 'text-shop-interactive',
  good: 'text-shop-good',
  bad: 'text-shop-bad',
  muted: 'text-shop-muted',
}

function humanise(status: string): string {
  const s = status.replace(/_/g, ' ').trim()
  return s ? s[0].toUpperCase() + s.slice(1) : 'Unknown'
}

export function orderStatusUI(status: string | undefined | null): { label: string; cls: string; tone: StatusTone } {
  const ui = ORDER_STATUS_UI[status ?? ''] ?? { label: humanise(status ?? ''), tone: 'muted' as const }
  return { label: ui.label, tone: ui.tone, cls: TONE_CLASS[ui.tone] }
}

export function returnStatusUI(status: string | undefined | null): { label: string; cls: string; tone: StatusTone } {
  const ui = RETURN_STATUS_UI[status ?? ''] ?? { label: humanise(status ?? ''), tone: 'muted' as const }
  return { label: ui.label, tone: ui.tone, cls: TONE_CLASS[ui.tone] }
}

// ── List filters ────────────────────────────────────────────────────────

/**
 * The chips on /sell/orders. These are the `stage` values
 * ListSellerFulfillment filters on server-side (service/service.go
 * fulfillmentMatchesStage), so a chip is a query, not a client-side sieve
 * over whichever pages happen to be loaded. The plain /seller/orders route
 * has no filter parameter at all, which is why the list is built on the
 * fulfillment route instead.
 */
export const FULFILLMENT_STAGES: ReadonlyArray<{ id: FulfillmentStage; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'unshipped', label: 'To ship' },
  { id: 'in_transit', label: 'In transit' },
  { id: 'delivered', label: 'Delivered' },
  { id: 'cancelled', label: 'Cancelled' },
]

/**
 * Offset paging over a route that filters AFTER it pages.
 *
 * ListSellerFulfillment fetches `limit` orders and then drops the ones that
 * miss the stage (and any with none of this seller's lines), so a page
 * shorter than `limit` does not mean the end: the next offset may hold more.
 * ListSellerEarnings does the same with COD lines. The only honest stop
 * signal such a route gives is an empty page, so that is the only one used.
 * The cost is one extra, empty request at the end of a list; the alternative
 * is a "Load more" that vanishes with orders still unseen.
 */
export function nextOffset(page: { count: number; offset: number; limit: number }): number | undefined {
  if (page.count === 0) return undefined
  return page.offset + page.limit
}

// ── Ship form ───────────────────────────────────────────────────────────

export interface ShipFormValues {
  courier: string
  tracking_number: string
}

export type ShipFormErrors = Partial<Record<keyof ShipFormValues, string>>

/** Trim, drop internal spaces, upper-case: "ab 12 cd" and "AB12CD" are the same number. */
export function normaliseTracking(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase()
}

const TRACKING_RE = /^[A-Z0-9-]{6,40}$/

/**
 * Field-level validation for the ship form. Couriers disagree on tracking
 * formats (AWB numbers are 10 to 14 digits, DHL uses 10, some use letters and
 * dashes), so the rule is deliberately loose: letters, digits and dashes,
 * six to forty of them. What it refuses is the empty string, a sentence, and
 * anything with punctuation that no courier prints on a label.
 */
export function validateShipForm(values: ShipFormValues): ShipFormErrors {
  const errors: ShipFormErrors = {}
  const courier = values.courier.trim()
  if (courier.length < 2) errors.courier = 'Name the courier.'
  else if (courier.length > 60) errors.courier = 'Keep the courier name under 60 characters.'

  const tracking = normaliseTracking(values.tracking_number)
  if (!tracking) errors.tracking_number = 'Enter the tracking number from the label.'
  else if (!TRACKING_RE.test(tracking))
    errors.tracking_number = 'Tracking numbers are 6 to 40 letters, digits or dashes.'
  return errors
}

// ── Money ───────────────────────────────────────────────────────────────
//
// Rendering is `inrMinor` / `inr` from ./money; nothing here formats. What
// these two do is pick the right column. Migration 007 made the *_minor
// columns authoritative and stopped maintaining the rupee ones, so
// `final_amount` reads 0.00 on every order the P0 checkout wrote. Prefer paise
// and only fall back to a rupee float when the paise field is absent, which
// happens on the bare /seller/orders projection and on pre-007 rows.

export function orderTotalMinor(order: { total_minor?: number | null; final_amount?: number | null }): number {
  if (typeof order.total_minor === 'number' && order.total_minor > 0) return order.total_minor
  return Math.round((order.final_amount ?? 0) * 100)
}

export function sellerSubtotalMinor(card: {
  seller_subtotal_minor?: number | null
  seller_subtotal?: number | null
}): number {
  if (typeof card.seller_subtotal_minor === 'number' && card.seller_subtotal_minor > 0)
    return card.seller_subtotal_minor
  return Math.round((card.seller_subtotal ?? 0) * 100)
}

export function lineTotalMinor(item: { final_price_minor?: number | null; final_price?: number | null }): number {
  if (typeof item.final_price_minor === 'number' && item.final_price_minor > 0) return item.final_price_minor
  return Math.round((item.final_price ?? 0) * 100)
}

// ── CSV ─────────────────────────────────────────────────────────────────

/**
 * The earnings CSV is a plain anchor, not a fetch: the browser follows it,
 * sends the session cookies, and honours the Content-Disposition the server
 * sets (attachment; filename="earnings.csv"). It goes through the same
 * `/v1/:path*` → `/api/proxy/:path*` rewrite every API call uses, under the
 * zone's basePath, which is exactly how ./media.ts builds image URLs.
 *
 * The route takes no query today (internal/http/handler.go
 * ExportSellerEarningsCSV ignores limit/offset and exports a fixed 500-row
 * window), so none is appended. `apiBase` is a parameter rather than read
 * from the environment inside, so the spelling is testable.
 */
export function earningsCsvHref(apiBase: string): string {
  const base = apiBase.replace(/\/+$/, '')
  return `${base}/v1/commerce/seller/earnings.csv`
}

// ── Server shapes that need tidying ─────────────────────────────────────

export interface DeliveryAddress {
  contact_name?: string
  phone?: string
  address_line_1?: string
  address_line_2?: string
  landmark?: string
  city?: string
  state?: string
  postal_code?: string
  country?: string
}

function fromBase64(s: string): string | null {
  try {
    if (typeof atob === 'function') return atob(s)
    return Buffer.from(s, 'base64').toString('utf8')
  } catch {
    return null
  }
}

/**
 * `delivery_address` on the seller card is a Go `[]byte`, which encoding/json
 * writes as base64. Underneath is the JSON snapshot taken at checkout
 * (internal/pii Address). After the PII cutover that snapshot carries only
 * the routing fields (city, state, postal code, country); the name, phone and
 * street live in a sealed column the seller detail route does not open. So a
 * decoded address may legitimately have no street, and the caller says so
 * rather than printing "undefined".
 *
 * Accepts the raw base64, a JSON string, or an already-parsed object, and
 * answers null for anything unreadable, so a bad blob costs one panel, not
 * the page.
 */
export function decodeAddressSnapshot(raw: unknown): DeliveryAddress | null {
  if (raw == null || raw === '') return null
  if (typeof raw === 'object') return pickAddress(raw as Record<string, unknown>)
  if (typeof raw !== 'string') return null

  const parsed = tryParse(raw) ?? tryParse(fromBase64(raw) ?? '')
  return parsed ? pickAddress(parsed) : null
}

function tryParse(s: string): Record<string, unknown> | null {
  if (!s || s[0] !== '{') return null
  try {
    const v = JSON.parse(s)
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function pickAddress(o: Record<string, unknown>): DeliveryAddress | null {
  const str = (k: string) => (typeof o[k] === 'string' && (o[k] as string).trim() ? (o[k] as string) : undefined)
  const addr: DeliveryAddress = {
    contact_name: str('contact_name'),
    phone: str('phone'),
    address_line_1: str('address_line_1'),
    address_line_2: str('address_line_2'),
    landmark: str('landmark'),
    city: str('city'),
    state: str('state'),
    postal_code: str('postal_code'),
    country: str('country'),
  }
  return Object.values(addr).some(Boolean) ? addr : null
}

/** True when the sealed fields are absent: the routing half is all the seller gets. */
export function addressIsRoutingOnly(addr: DeliveryAddress): boolean {
  return !addr.contact_name && !addr.address_line_1 && !addr.phone
}

export interface SellerShipment {
  id: string
  order_id: string
  seller_id: string
  courier: string
  tracking_number: string | null
  tracking_url: string | null
  label_url: string | null
  status: string
  eta: string | null
  shipped_at: string | null
  delivered_at: string | null
  created_at: string | null
}

export interface SellerShipmentEvent {
  id: string
  status: string
  location: string | null
  remark: string | null
  occurred_at: string
}

type Raw = Record<string, unknown>

/** Read a key in either spelling. Go structs with no json tags serialise as their field names. */
function pick(o: Raw, snake: string, pascal: string): unknown {
  return o[snake] !== undefined ? o[snake] : o[pascal]
}
const asStr = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)

/**
 * `postgres.Shipment` and `postgres.ShipmentEvent` (store/postgres/
 * shipments.go) carry `db` tags but no `json` tags, so the wire shape is
 * PascalCase: `ID`, `TrackingNumber`, `ShippedAt`. The hook types in
 * useCommerce.ts spell them snake_case, which is what a future json tag would
 * produce. Reading both means the page keeps working the day someone adds
 * the tags, and works today.
 */
export function normaliseShipment(raw: unknown): SellerShipment | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Raw
  const id = asStr(pick(o, 'id', 'ID'))
  if (!id) return null
  return {
    id,
    order_id: asStr(pick(o, 'order_id', 'OrderID')) ?? '',
    seller_id: asStr(pick(o, 'seller_id', 'SellerID')) ?? '',
    courier: asStr(pick(o, 'courier', 'Courier')) ?? '',
    tracking_number: asStr(pick(o, 'tracking_number', 'TrackingNumber')),
    tracking_url: asStr(pick(o, 'tracking_url', 'TrackingURL')),
    label_url: asStr(pick(o, 'label_url', 'LabelURL')),
    status: asStr(pick(o, 'status', 'Status')) ?? 'pending',
    eta: asStr(pick(o, 'eta', 'ETA')),
    shipped_at: asStr(pick(o, 'shipped_at', 'ShippedAt')),
    delivered_at: asStr(pick(o, 'delivered_at', 'DeliveredAt')),
    created_at: asStr(pick(o, 'created_at', 'CreatedAt')),
  }
}

export function normaliseShipmentEvent(raw: unknown): SellerShipmentEvent | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Raw
  const occurred = asStr(pick(o, 'occurred_at', 'OccurredAt'))
  if (!occurred) return null
  return {
    id: asStr(pick(o, 'id', 'ID')) ?? occurred,
    status: asStr(pick(o, 'status', 'Status')) ?? '',
    location: asStr(pick(o, 'location', 'Location')),
    remark: asStr(pick(o, 'remark', 'Remark')),
    occurred_at: occurred,
  }
}

/**
 * `variant_details` on an order line is another Go `[]byte`: base64 over a
 * JSON object of option name → value, snapshotted at checkout. Rendered as
 * "Size: M · Colour: Navy". Anything that does not decode to a flat object
 * of strings renders as nothing, which is what a line with no options should
 * show anyway.
 */
export function variantSummary(raw: unknown): string {
  const obj = raw && typeof raw === 'object'
    ? (raw as Raw)
    : typeof raw === 'string'
      ? (tryParse(raw) ?? tryParse(fromBase64(raw) ?? ''))
      : null
  if (!obj) return ''
  const parts: string[] = []
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string' && v.trim()) parts.push(`${humanise(k)}: ${v}`)
    else if (typeof v === 'number') parts.push(`${humanise(k)}: ${v}`)
  }
  return parts.join(' · ')
}

// ── Timeline ────────────────────────────────────────────────────────────

export interface TimelineEntry {
  key: string
  label: string
  /** ISO time, or null when the server records the fact but not the moment. */
  at: string | null
  detail?: string
}

/**
 * What happened to this order, in order.
 *
 * commerce-service writes every status change to `order_status_history`
 * (migration 010's trigger) but no seller route reads it back, so the
 * timeline is reconstructed from the timestamps the detail card does carry:
 * the order's created_at, the shipment's booking / shipped / delivered
 * stamps, the courier's events, and the order's cancellation. A fact the
 * server records without a timestamp (payment captured) is listed with
 * `at: null` and rendered without a time, rather than borrowing `updated_at`
 * and inventing one.
 */
export function buildTimeline(
  order: {
    created_at?: string | null
    updated_at?: string | null
    status: string
    payment_status?: string
    cancellation_reason?: string | null
    cancelled_by?: string | null
  },
  shipment: SellerShipment | null,
  events: SellerShipmentEvent[] = [],
): TimelineEntry[] {
  const out: TimelineEntry[] = []
  if (order.created_at) out.push({ key: 'placed', label: 'Order placed', at: order.created_at })
  if (order.payment_status === 'paid') out.push({ key: 'paid', label: 'Payment received', at: null })

  if (shipment) {
    out.push({
      key: 'booked',
      label: 'Shipment booked',
      at: shipment.created_at,
      detail: [shipment.courier, shipment.tracking_number].filter(Boolean).join(' · ') || undefined,
    })
    if (shipment.shipped_at) out.push({ key: 'shipped', label: 'Handed to courier', at: shipment.shipped_at })
  }

  const sorted = [...events].sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at))
  let sawDelivered = false
  for (const e of sorted) {
    if (e.status === 'delivered') sawDelivered = true
    out.push({
      key: `event-${e.id}`,
      label: orderStatusUI(e.status).label,
      at: e.occurred_at,
      detail: [e.location, e.remark].filter(Boolean).join(' · ') || undefined,
    })
  }
  if (shipment?.delivered_at && !sawDelivered)
    out.push({ key: 'delivered', label: 'Delivered', at: shipment.delivered_at })

  if (order.status === 'cancelled') {
    const by = order.cancelled_by ? `by ${order.cancelled_by}` : ''
    out.push({
      key: 'cancelled',
      label: 'Cancelled',
      at: order.updated_at ?? null,
      detail: [by, order.cancellation_reason].filter(Boolean).join(': ') || undefined,
    })
  }
  return out
}

// ── Errors ──────────────────────────────────────────────────────────────

/**
 * The P0 fence (internal/http/handler_p0.go FencedPrefixes) answers 404
 * NOT_FOUND, before routing, for every route family outside the launch loop.
 * As of 2026-09-12 that includes /seller/returns, /returns/{id}/approve and
 * /reject, /seller/earnings and /payout/preview. A page built on one of them
 * must tell the seller the feature is switched off on this server, which is
 * a different sentence from "your returns list is empty".
 */
export function isFenced(error: unknown): boolean {
  const e = error as { response?: { status?: number; data?: { error?: { code?: string } } } } | undefined
  return e?.response?.status === 404 && (e.response?.data?.error?.code ?? 'NOT_FOUND') === 'NOT_FOUND'
}

// ── Earnings ────────────────────────────────────────────────────────────

export interface EarningsTotals {
  count: number
  gross: number
  commission: number
  platform_fee: number
  tds: number
  net: number
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** Sum the rows in view. Rupee floats, as the earnings route sends them, rounded once at the end. */
export function summariseEarnings(
  rows: ReadonlyArray<{
    gross_amount: number
    commission_amount: number
    platform_fee: number
    tds_amount: number
    net_amount: number
  }>,
): EarningsTotals {
  let gross = 0, commission = 0, fee = 0, tds = 0, net = 0
  for (const r of rows) {
    gross += r.gross_amount
    commission += r.commission_amount
    fee += r.platform_fee
    tds += r.tds_amount
    net += r.net_amount
  }
  return {
    count: rows.length,
    gross: round2(gross),
    commission: round2(commission),
    platform_fee: round2(fee),
    tds: round2(tds),
    net: round2(net),
  }
}

/** A short, stable handle for a buyer the seller cannot name: the first block of the user id. */
export function shortId(id: string | undefined | null): string {
  if (!id) return 'unknown'
  return id.split('-')[0].toUpperCase()
}
