// FiGo admin types — mirror the response shapes from
// Architecture/services/food-service/internal/store/postgres/reports.go,
// moderation.go, support.go, fraud.go, item_reviews.go, kitchen.go.
//
// Backend envelope is { data, error, meta }; the hooks unwrap to `data`.

// ── Reports (D1) ──────────────────────────────────────────────────────────

export interface RestaurantSLAReport {
  restaurant_id: string
  restaurant_name: string
  orders_total: number
  orders_breached: number
  breached_pct: number | null
  avg_accept_seconds: number | null
}

export interface DeliverySLAReport {
  partner_id: string
  partner_name: string
  deliveries_total: number
  late_count: number
  late_pct: number | null
  avg_delivery_minutes: number | null
}

export interface PaymentReconRow {
  payment_method: string
  payment_status: string
  count: number
  gross_amount: number
}

export interface RefundCancelRow {
  category: string
  count: number
  amount: number
}

export interface CouponAbuseRow {
  customer_id: string
  coupon_code: string
  use_count: number
}

export interface ComplianceReportRow {
  restaurant_id: string
  restaurant_name: string
  has_approved_fssai: boolean
  expired_docs: number
  oldest_doc_expiry: string | null
}

// ── Moderation (B3) ───────────────────────────────────────────────────────

export interface PendingModerationItem {
  id: string
  restaurant_id: string
  restaurant_name: string
  name: string
  moderation_status: 'approved' | 'flagged' | 'rejected' | 'pending_review'
  moderation_reason: string | null
  open_reports: number
  latest_report_at: string | null
  created_at: string
}

export type ModerationStatus =
  | 'approved'
  | 'rejected'
  | 'pending_review'
  | 'flagged'

// ── Support tickets + refunds (B6) ────────────────────────────────────────

export type TicketStatus =
  | 'open'
  | 'in_progress'
  | 'resolved'
  | 'closed'
  | 'cancelled'

export interface SupportTicket {
  id: string
  customer_id: string
  order_id: string | null
  category: string
  subject: string
  detail: string | null
  status: TicketStatus
  assigned_to: string | null
  resolved_at: string | null
  created_at: string
}

export interface TicketMessage {
  id: string
  ticket_id: string
  author_id: string
  is_admin: boolean
  body: string
  created_at: string
}

export type RefundStatus =
  | 'requested'
  | 'approved'
  | 'rejected'
  | 'processed'

export interface RefundRequest {
  id: string
  ticket_id: string | null
  order_id: string
  customer_id: string
  amount: number
  reason: string | null
  status: RefundStatus
  decided_by: string | null
  decided_at: string | null
  refund_txn_id: string | null
  created_at: string
}

// ── Fraud (E) ─────────────────────────────────────────────────────────────

export interface TopFraudUserRow {
  user_id: string
  total_score: number
  signals: number
}

// ── Item reviews (B7) ─────────────────────────────────────────────────────

export interface ItemReview {
  id: string
  order_id: string
  menu_item_id: string
  customer_id: string
  rating: number
  review: string | null
  photo_urls: string[]
  created_at: string
}

// ── Kitchen queue (B1) ────────────────────────────────────────────────────

export interface KitchenOrder {
  id: string
  order_number: string
  status: string
  final_amount: number
  item_count: number
  customer_instruction: string | null
  placed_at: string
  accept_deadline_at: string | null
  seconds_to_breach: number | null
}

// ── Capabilities (A3) ─────────────────────────────────────────────────────

export interface FoodCapabilities {
  user_id: string
  is_customer: boolean
  is_restaurant_owner: boolean
  is_delivery_partner: boolean
  is_admin: boolean
  is_moderator: boolean
}
