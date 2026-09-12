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
   * The HTTP route that performs it, with `{id}` standing for the order id;
   * `sellerActionPath` fills it in. Every seller row of the matrix has a
   * route since commerce-service internal/http/handler_seller_fulfilment.go
   * (2026-09-12):
   *   pack   → POST /v1/commerce/seller/orders/{id}/pack
   *   ship   → POST /v1/commerce/seller/orders/{id}/ship    (the seller-prefixed
   *            spelling of POST /orders/{id}/shipment; same handler, same gate)
   *   cancel → POST /v1/commerce/seller/orders/{id}/cancel  body {reason}
   * Pack and cancel are idempotent: a repeat answers 200 with applied=false
   * and the state the order is already in, which the page treats as done.
   */
  route: string
}

const ACTION_FOR_TARGET: Record<string, { kind: SellerActionKind; route: string }> = {
  packed: { kind: 'pack', route: '/v1/commerce/seller/orders/{id}/pack' },
  shipped: { kind: 'ship', route: '/v1/commerce/seller/orders/{id}/ship' },
  cancelled: { kind: 'cancel', route: '/v1/commerce/seller/orders/{id}/cancel' },
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

const ROUTE_FOR_KIND: Record<SellerActionKind, string> = {
  pack: ACTION_FOR_TARGET.packed.route,
  ship: ACTION_FOR_TARGET.shipped.route,
  cancel: ACTION_FOR_TARGET.cancelled.route,
}

/** The concrete path for one action on one order, so the hooks spell no route of their own. */
export function sellerActionPath(kind: SellerActionKind, orderId: string): string {
  return ROUTE_FOR_KIND[kind].replace('{id}', encodeURIComponent(orderId))
}

/**
 * What the seller reads when a fulfilment write is refused.
 *
 * The seller routes answer with a code the page can explain better than the
 * server's one-liner. 409 TRANSITION_NOT_PERMITTED: the matrix has no seller
 * row from the order's current status (pack after the courier has it). 409
 * CANCEL_NOT_PERMITTED: past the point a seller may cancel. 409
 * TRACKING_NUMBER_IN_USE: shipments are unique on courier + number because a
 * webhook is matched by that pair. 409 ORDER_SHARED: a legacy multi-seller
 * order no single seller may move. 400 REASON_REQUIRED: the cancel form was
 * bypassed. Anything else falls back to the server's own message, then to
 * the caller's default.
 */
export function sellerActionError(kind: SellerActionKind, error: unknown, fallback: string): string {
  const { code, message } = apiEnvelope(error)
  switch (code) {
    case 'TRANSITION_NOT_PERMITTED':
      return kind === 'pack'
        ? 'This order cannot be marked as packed from where it is now. Reload to see its current state.'
        : 'This order cannot be shipped from where it is now. Reload to see its current state.'
    case 'CANCEL_NOT_PERMITTED':
      return 'This order can no longer be cancelled from your side; it has already moved on.'
    case 'TRACKING_NUMBER_IN_USE':
      return 'That tracking number is already on another shipment with this courier. Check the label.'
    case 'ORDER_SHARED':
      return 'This order has lines from other sellers, so no single seller can move it.'
    case 'REASON_REQUIRED':
      return 'Give the buyer a reason for the cancellation.'
    default:
      return message || fallback
  }
}

/**
 * Whether the Ship button should be live.
 *
 * The shipment route (service/shipments.go CreateShipmentsForOrder) has its
 * own gate that is NOT the status table: it refuses unless the gateway has
 * captured (`payment_status = paid`) or the order is COD, and it is idempotent
 * per seller, so a second booking returns the first. From the seller's chair
 * that means: the order is confirmed or packed, it is paid or cash on
 * delivery, and no shipment exists for them yet. `confirmed` is accepted as
 * well as `packed` even though the matrix only lists packed → shipped for a
 * seller: the store (order_fulfilment.go MarkOrderShipped) walks confirmed →
 * packed → shipped as two audited steps when a seller books from `confirmed`.
 * Booking is packing.
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
 * over whichever pages happen to be loaded.
 *
 * /seller/orders now returns enriched rows (the header plus item_count,
 * seller_subtotal_minor, total_minor, payment_method), but it still has no
 * stage parameter, and its row carries neither the seller's lines nor the
 * address snapshot the list row reads. Serving "All" from it and the other
 * four chips from /seller/fulfillment would mean two row shapes behind one
 * list, so the list stays on the fulfilment route for every chip.
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

// ── Cancel form ─────────────────────────────────────────────────────────

export const CANCEL_REASON_MAX = 500

/**
 * The reason a seller gives for cancelling. The server refuses an empty one
 * (400 REASON_REQUIRED) because the buyer reads it on their order page; the
 * form refuses it first, and refuses a bare couple of characters that would
 * satisfy the server and tell the buyer nothing. Returns the message, or
 * null when the reason is fine.
 */
export function validateCancelReason(raw: string): string | null {
  const reason = raw.trim()
  if (reason.length < 3) return 'Tell the buyer why, in a few words.'
  if (reason.length > CANCEL_REASON_MAX) return `Keep the reason under ${CANCEL_REASON_MAX} characters.`
  return null
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
  courier_order_id: string | null
  tracking_url: string | null
  label_url: string | null
  status: string
  eta: string | null
  shipped_at: string | null
  delivered_at: string | null
  last_event_at: string | null
  created_at: string | null
  updated_at: string | null
}

export interface SellerShipmentEvent {
  id: string
  shipment_id: string | null
  status: string
  location: string | null
  remark: string | null
  occurred_at: string
}

type Raw = Record<string, unknown>

/**
 * Read a key in the snake_case spelling first, then the PascalCase one.
 * snake_case wins when both are present because it is the tagged, current
 * wire shape; the PascalCase fallback is for a cached or older answer.
 */
function pick(o: Raw, snake: string, pascal: string): unknown {
  return o[snake] !== undefined ? o[snake] : o[pascal]
}
const asStr = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)

/**
 * `postgres.Shipment` and `postgres.ShipmentEvent` (store/postgres/
 * shipments.go) carry json tags since 2026-09-12, so the wire shape is
 * snake_case: `id`, `tracking_number`, `shipped_at`, plus the three keys the
 * untagged struct never surfaced by that name (`courier_order_id`,
 * `last_event_at`, `updated_at`). Before the tags the same fields arrived
 * PascalCase (`ID`, `TrackingNumber`, `ShippedAt`); that spelling is still
 * read, second, so a stale server or a cached response does not blank the
 * page. Missing keys read as null, never as the string "undefined".
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
    courier_order_id: asStr(pick(o, 'courier_order_id', 'CourierOrderID')),
    tracking_url: asStr(pick(o, 'tracking_url', 'TrackingURL')),
    label_url: asStr(pick(o, 'label_url', 'LabelURL')),
    status: asStr(pick(o, 'status', 'Status')) ?? 'pending',
    eta: asStr(pick(o, 'eta', 'ETA')),
    shipped_at: asStr(pick(o, 'shipped_at', 'ShippedAt')),
    delivered_at: asStr(pick(o, 'delivered_at', 'DeliveredAt')),
    last_event_at: asStr(pick(o, 'last_event_at', 'LastEventAt')),
    created_at: asStr(pick(o, 'created_at', 'CreatedAt')),
    updated_at: asStr(pick(o, 'updated_at', 'UpdatedAt')),
  }
}

export function normaliseShipmentEvent(raw: unknown): SellerShipmentEvent | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Raw
  const occurred = asStr(pick(o, 'occurred_at', 'OccurredAt'))
  if (!occurred) return null
  return {
    id: asStr(pick(o, 'id', 'ID')) ?? occurred,
    shipment_id: asStr(pick(o, 'shipment_id', 'ShipmentID')),
    status: asStr(pick(o, 'status', 'Status')) ?? '',
    location: asStr(pick(o, 'location', 'Location')),
    remark: asStr(pick(o, 'remark', 'Remark')),
    occurred_at: occurred,
  }
}

// ── Order history ───────────────────────────────────────────────────────

/**
 * One row of `order_status_history`, as GET /seller/orders/{id}/history
 * sends it (postgres.OrderStatusHistory, json-tagged, omitempty). The
 * trigger from migration 010 writes one per status change; `from_status` is
 * null on the first row, `changed_by` is null for the system, and `notes` is
 * whatever the writer said: "packed by seller", "packed at shipment
 * booking", a cancellation reason.
 */
export interface OrderHistoryRow {
  id: string
  order_id: string | null
  from_status: string | null
  to_status: string
  changed_by: string | null
  actor_type: string | null
  notes: string | null
  created_at: string
}

export function normaliseHistoryRow(raw: unknown): OrderHistoryRow | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Raw
  const to = asStr(o.to_status)
  const at = asStr(o.created_at)
  if (!to || !at) return null
  return {
    id: asStr(o.id) ?? `${to}@${at}`,
    order_id: asStr(o.order_id),
    from_status: asStr(o.from_status),
    to_status: to,
    changed_by: asStr(o.changed_by),
    actor_type: asStr(o.actor_type),
    notes: asStr(o.notes),
    created_at: at,
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

const HISTORY_LABEL: Record<string, string> = {
  created: 'Order placed',
  paid: 'Payment received',
  confirmed: 'Order confirmed',
  packed: 'Packed',
  shipped: 'Handed to courier',
  cancelled: 'Cancelled',
}

const ACTOR_LABEL: Record<string, string> = {
  seller: 'by you',
  customer: 'by the buyer',
  system: 'by the platform',
  admin: 'by support',
}

/**
 * What happened to this order, from the audit trail.
 *
 * The status history is the spine: every row is a status change with the
 * moment it happened, who made it, and the writer's note (a cancellation
 * reason, "packed at shipment booking"). The courier's events are merged in
 * for the steps the order's own status does not record (a hub scan, an
 * attempted delivery), but an event whose status the history already has as
 * a row (out_for_delivery, delivered, both written by the webhook) is
 * dropped rather than listed twice. Sorted by time, oldest first, which is
 * how the route already sends the rows.
 */
export function timelineFromHistory(
  history: ReadonlyArray<OrderHistoryRow>,
  events: ReadonlyArray<SellerShipmentEvent> = [],
): TimelineEntry[] {
  const out: TimelineEntry[] = []
  const seen = new Set<string>()
  for (const row of history) {
    seen.add(row.to_status)
    const who = row.actor_type ? ACTOR_LABEL[row.actor_type] ?? `by ${row.actor_type}` : ''
    out.push({
      key: `history-${row.id}`,
      label: HISTORY_LABEL[row.to_status] ?? orderStatusUI(row.to_status).label,
      at: row.created_at,
      detail: [who, row.notes].filter(Boolean).join(': ') || undefined,
    })
  }
  for (const e of events) {
    if (seen.has(e.status)) continue
    out.push({
      key: `event-${e.id}`,
      label: orderStatusUI(e.status).label,
      at: e.occurred_at,
      detail: [e.location, e.remark].filter(Boolean).join(' · ') || undefined,
    })
  }
  return out.sort((a, b) => Date.parse(a.at ?? '') - Date.parse(b.at ?? ''))
}

/**
 * What happened to this order, reconstructed.
 *
 * The fallback for when GET /seller/orders/{id}/history is not there (a
 * server that predates it answers 404): the timeline is rebuilt from the
 * timestamps the detail card does carry, which are the order's created_at,
 * the shipment's booking / shipped / delivered stamps, the courier's events,
 * and the order's cancellation. A fact the card records without a timestamp
 * (payment captured) is listed with `at: null` and rendered without a time,
 * rather than borrowing `updated_at` and inventing one.
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

/** The gateway's error envelope, read without trusting any field to exist. */
function apiEnvelope(error: unknown): { status: number; code: string; message: string } {
  const e = error as { response?: { status?: number; data?: { error?: { code?: string; message?: string } } } } | undefined
  const err = e?.response?.data?.error
  return {
    status: e?.response?.status ?? 0,
    code: typeof err?.code === 'string' ? err.code : '',
    message: typeof err?.message === 'string' ? err.message : '',
  }
}

/** True for a plain 404: the route is not on this server, whatever the code says. */
export function isNotFound(error: unknown): boolean {
  return apiEnvelope(error).status === 404
}

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
