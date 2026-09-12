'use client'

// The MSeller order surface's data layer: what useCommerce.ts does not already
// give the seller pages. Everything that already existed there (the order
// detail, the returns inbox and its approve / reject, the earnings row type)
// is imported and re-used rather than re-declared, so there is one spelling
// of each route in the zone.

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@atpost/api-client'
import type { FulfillmentStage, Order, OrderItem, SellerEarning, SellerReturnCard } from '@/hooks/useCommerce'
import {
  nextOffset,
  normaliseHistoryRow,
  normaliseShipment,
  normaliseShipmentEvent,
  normaliseTracking,
  sellerActionPath,
  type OrderHistoryRow,
  type SellerShipment,
  type SellerShipmentEvent,
  type ShipFormValues,
} from '@/lib/seller'

export const SELLER_PAGE_SIZE = 20

/**
 * The order header as the seller detail route sends it. `Order` in
 * useCommerce.ts predates migration 007, so it has the rupee columns and none
 * of the paise ones; the fields added here are the authoritative money and
 * the cancellation stamp the timeline reads.
 */
export type SellerOrder = Order & {
  subtotal_minor?: number
  discount_minor?: number
  shipping_minor?: number
  tax_minor?: number
  coupon_discount_minor?: number
  total_minor?: number
  cancellation_reason?: string | null
  cancelled_by?: string | null
  gift_message?: string | null
}

export type SellerOrderItem = OrderItem & {
  unit_price_minor?: number
  final_price_minor?: number
  variant_details?: string | null
  image_url?: string
  thumbnail_url?: string
}

/**
 * One order from the seller's side, as GET /seller/fulfillment and GET
 * /seller/orders/{id} both return it (service.SellerOrderCard). `shipment` is
 * left `unknown` on purpose: the wire shape is the untagged Go struct and
 * `normaliseShipment` is the only reader.
 */
export interface SellerOrderCardWire {
  order: SellerOrder
  items: SellerOrderItem[]
  shipment?: unknown
  seller_subtotal_minor?: number
  seller_subtotal: number
  delivery_address?: string | null
}

// ── Orders list ─────────────────────────────────────────────────────────

interface OrderPage {
  orders: SellerOrderCardWire[]
  offset: number
}

/**
 * The seller's orders, newest first, one stage at a time, in offset pages.
 *
 * Built on /seller/fulfillment rather than /seller/orders. The latter now
 * sends enriched rows (item_count, seller_subtotal_minor, total_minor,
 * payment_method) and could carry the "All" chip alone, but it has no stage
 * parameter and its row lacks the seller's lines and the address snapshot
 * the list row renders; the fulfilment route carries all of that for every
 * chip, so one route and one row shape serve the whole list. The route
 * orders by created_at DESC (store.GetOrdersBySeller) and takes
 * limit/offset, not a cursor; the paging rule is in `nextOffset` and its
 * comment explains the odd stop condition.
 */
export function useSellerOrderPages(stage: FulfillmentStage, limit = SELLER_PAGE_SIZE) {
  return useInfiniteQuery<OrderPage>({
    queryKey: ['commerce', 'seller', 'fulfillment', 'pages', stage, limit],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const offset = pageParam as number
      const res = await api.get('/v1/commerce/seller/fulfillment', { params: { stage, limit, offset } })
      return { orders: (res.data.data?.orders as SellerOrderCardWire[] | undefined) ?? [], offset }
    },
    getNextPageParam: (last) => nextOffset({ count: last.orders.length, offset: last.offset, limit }),
  })
}

// ── Order detail ────────────────────────────────────────────────────────

/**
 * The seller's view of one order. `useSellerOrderDetail` in useCommerce.ts
 * hits the same route, but its declared type carries the rupee-era Order and
 * a snake_case Shipment the server does not send; this one is typed to the
 * wire. Same query key, so an invalidation from either reaches both.
 */
export function useSellerOrder(orderId: string | undefined) {
  return useQuery<SellerOrderCardWire>({
    queryKey: ['commerce', 'seller', 'order', orderId],
    queryFn: async () => (await api.get(`/v1/commerce/seller/orders/${orderId}`)).data.data,
    enabled: !!orderId,
    retry: false,
  })
}

export interface OrderShipmentWithEvents {
  shipment: SellerShipment
  events: SellerShipmentEvent[]
}

/**
 * Every shipment on the order with its courier events, normalised.
 *
 * GET /orders/{id}/shipments admits a seller on the order (shipments.go
 * requireOrderRole with writeOnly=false). It is the only seller-reachable
 * source of courier events, which is what the timeline is mostly made of. On
 * a multi-seller order it returns the other sellers' shipments too; the page
 * keeps the one whose id matches the card's.
 */
export function useOrderShipments(orderId: string | undefined) {
  return useQuery<OrderShipmentWithEvents[]>({
    queryKey: ['commerce', 'shipments', orderId],
    queryFn: async () => {
      const raw = (await api.get(`/v1/commerce/orders/${orderId}/shipments`)).data.data?.shipments
      const list = Array.isArray(raw) ? raw : []
      const out: OrderShipmentWithEvents[] = []
      for (const entry of list as Array<{ shipment?: unknown; events?: unknown[] }>) {
        const shipment = normaliseShipment(entry?.shipment)
        if (!shipment) continue
        const events = (entry.events ?? []).map(normaliseShipmentEvent).filter((e): e is SellerShipmentEvent => !!e)
        out.push({ shipment, events })
      }
      return out
    },
    enabled: !!orderId,
    retry: false,
  })
}

/**
 * The order's status audit trail: GET /seller/orders/{id}/history, oldest
 * first, normalised. A server that predates the route answers 404; the page
 * reads that as "no history here" and falls back to the derived timeline,
 * which is why this does not retry.
 */
export function useSellerOrderHistory(orderId: string | undefined) {
  return useQuery<OrderHistoryRow[]>({
    queryKey: ['commerce', 'seller', 'order', orderId, 'history'],
    queryFn: async () => {
      const raw = (await api.get(`/v1/commerce/seller/orders/${orderId}/history`)).data.data?.history
      const list = Array.isArray(raw) ? raw : []
      return list.map(normaliseHistoryRow).filter((r): r is OrderHistoryRow => !!r)
    },
    enabled: !!orderId,
    retry: false,
  })
}

/** The JSON body the ship action sends. Exported so the spelling is tested. */
export function shipRequestBody(values: ShipFormValues): { courier: string; tracking_number: string } {
  return { courier: values.courier.trim(), tracking_number: normaliseTracking(values.tracking_number) }
}

/** The JSON body the cancel action sends. Exported so the spelling is tested. */
export function cancelRequestBody(reason: string): { reason: string } {
  return { reason: reason.trim() }
}

/**
 * The body of every seller status write (service.SellerFulfilmentResult).
 * `applied` is false on an idempotent repeat: the order was already in
 * `status`. The page treats both answers as done, because they are.
 */
export interface SellerFulfilmentResult {
  order_id: string
  status: string
  applied: boolean
}

/**
 * After any fulfilment write, every query that shows this order's state is
 * stale: the detail card, both list spellings, the shipments and the buyer's
 * single-shipment view, and the history the timeline reads. `useSellerOrder`
 * shares its key prefix with the history query, so one invalidation reaches
 * both, but the shipments live under their own prefix.
 */
function useInvalidateOrder() {
  const qc = useQueryClient()
  return (orderId: string) => {
    qc.invalidateQueries({ queryKey: ['commerce', 'seller', 'order', orderId] })
    qc.invalidateQueries({ queryKey: ['commerce', 'seller', 'fulfillment'] })
    qc.invalidateQueries({ queryKey: ['commerce', 'seller', 'orders'] })
    qc.invalidateQueries({ queryKey: ['commerce', 'shipments', orderId] })
    qc.invalidateQueries({ queryKey: ['commerce', 'shipment', orderId] })
  }
}

/**
 * Book the shipment: POST /seller/orders/{id}/ship, the seller-prefixed
 * spelling of POST /orders/{id}/shipment (same handler, same paid-or-COD
 * gate, 201 with `{shipments: [...]}`).
 *
 * The body is read since 2026-09-12, with a rule: under the stub courier the
 * seller's courier and tracking number ARE the shipment, because nothing
 * else ever assigned one; under a carrier-backed provider the body is
 * ignored, not merged, because the AWB the carrier returned is the one its
 * webhooks will name. Either way the page shows what the refetch brings
 * back, which is the truth, and says so next to the form. A number already
 * on another shipment with the same courier is refused (409
 * TRACKING_NUMBER_IN_USE), and a status the matrix will not let a seller
 * ship from is a 409 TRANSITION_NOT_PERMITTED.
 */
export function useShipOrder() {
  const invalidate = useInvalidateOrder()
  return useMutation({
    mutationFn: async ({ orderId, values }: { orderId: string; values: ShipFormValues }) =>
      (await api.post(sellerActionPath('ship', orderId), shipRequestBody(values))).data.data,
    onSuccess: (_data, { orderId }) => invalidate(orderId),
  })
}

/**
 * Mark the order packed: POST /seller/orders/{id}/pack, confirmed → packed
 * as the seller. 409 TRANSITION_NOT_PERMITTED when the matrix refuses;
 * a repeat is 200 with applied=false.
 */
export function usePackOrder() {
  const invalidate = useInvalidateOrder()
  return useMutation({
    mutationFn: async ({ orderId }: { orderId: string }) =>
      (await api.post(sellerActionPath('pack', orderId))).data.data as SellerFulfilmentResult,
    onSuccess: (_data, { orderId }) => invalidate(orderId),
  })
}

/**
 * Cancel the order from the seller's side: POST /seller/orders/{id}/cancel
 * with `{reason}`, confirmed|packed → cancelled. The server runs the same
 * store path as a buyer's cancel (reservation release, restock, refund
 * command), so nothing about the money is decided here. 400 REASON_REQUIRED
 * for an empty reason, 409 CANCEL_NOT_PERMITTED once the parcel has moved
 * on; a repeat is 200 with applied=false.
 */
export function useCancelSellerOrder() {
  const invalidate = useInvalidateOrder()
  return useMutation({
    mutationFn: async ({ orderId, reason }: { orderId: string; reason: string }) =>
      (await api.post(sellerActionPath('cancel', orderId), cancelRequestBody(reason))).data.data as SellerFulfilmentResult,
    onSuccess: (_data, { orderId }) => invalidate(orderId),
  })
}

// ── Payout ──────────────────────────────────────────────────────────────

export interface PayoutPreview {
  gross: number
  commission: number
  platform_fee: number
  tds: number
  net_payout: number
}

/**
 * What the platform would keep from a gross rupee amount, by the server's
 * own rates (service.CalculateSellerPayout). Asked rather than computed here
 * because the percentages live in the service's config and a client copy
 * would drift. `/v1/commerce/payout` is on the P0 fence list, so this
 * answers 404 today; the page renders the fenced state and the seller sees
 * the subtotal without a payout line, not a wrong payout line.
 */
export function usePayoutPreview(grossRupees: number | undefined) {
  return useQuery<PayoutPreview>({
    queryKey: ['commerce', 'payout', 'preview', grossRupees],
    queryFn: async () =>
      (await api.get('/v1/commerce/payout/preview', { params: { gross: grossRupees } })).data.data,
    enabled: typeof grossRupees === 'number' && grossRupees > 0,
    retry: false,
  })
}

// ── Returns ─────────────────────────────────────────────────────────────

interface ReturnPage {
  returns: SellerReturnCard[]
  offset: number
}

/**
 * The returns inbox in offset pages, with the server's status filter.
 * useCommerce.ts has a single-page `useSellerReturns`; this one pages and
 * shares the `['commerce','seller','returns']` prefix so `useApproveReturn`
 * and `useRejectReturn` (imported from there by the page) invalidate it.
 */
export function useSellerReturnPages(status: string, limit = SELLER_PAGE_SIZE) {
  return useInfiniteQuery<ReturnPage>({
    queryKey: ['commerce', 'seller', 'returns', 'pages', status, limit],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const offset = pageParam as number
      const params: Record<string, string | number> = { limit, offset }
      if (status) params.status = status
      const res = await api.get('/v1/commerce/seller/returns', { params })
      return { returns: (res.data.data?.returns as SellerReturnCard[] | undefined) ?? [], offset }
    },
    getNextPageParam: (last) => nextOffset({ count: last.returns.length, offset: last.offset, limit }),
    retry: false,
  })
}

// ── Earnings ────────────────────────────────────────────────────────────

interface EarningsPage {
  earnings: SellerEarning[]
  offset: number
}

/**
 * Delivered prepaid lines with the platform's cut broken out, in offset
 * pages. The route has no period parameter (ListSellerEarnings takes
 * limit/offset only), so there is no period selector; the page summarises
 * what is loaded and says how many rows that is.
 */
export function useSellerEarningsPages(limit = 50) {
  return useInfiniteQuery<EarningsPage>({
    queryKey: ['commerce', 'seller', 'earnings', 'pages', limit],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const offset = pageParam as number
      const res = await api.get('/v1/commerce/seller/earnings', { params: { limit, offset } })
      return { earnings: (res.data.data?.earnings as SellerEarning[] | undefined) ?? [], offset }
    },
    getNextPageParam: (last) => nextOffset({ count: last.earnings.length, offset: last.offset, limit }),
    retry: false,
  })
}
