// Mopedu admin types — wire format mirrors backend (snake_case).
// Source: C:\workspace\atpost\mopedu\MOPEDU_SPEC.md §17 (admin endpoints).
// All fields are wire-shaped from /v1/rider/admin/* responses.

export type PartnerType = 'driver' | 'owner_driver' | 'fleet_owner'

export type PartnerStatus =
  | 'pending'
  | 'approved'
  | 'suspended'
  | 'blocked'
  | 'rejected'

export type KycStatus =
  | 'not_submitted'
  | 'pending'
  | 'approved'
  | 'rejected'

export type BankStatus =
  | 'not_submitted'
  | 'pending'
  | 'verified'
  | 'rejected'

export type DocumentOwnerType = 'partner' | 'vehicle'

export type DocumentStatus = 'pending' | 'verified' | 'rejected' | 'expired'

export type VehicleType =
  | 'bike'
  | 'auto'
  | 'mini'
  | 'sedan'
  | 'suv'
  | 'premium'

export type VehicleStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'suspended'
  | 'retired'

export type SubscriptionPaymentStatus =
  | 'pending'
  | 'verified'
  | 'rejected'
  | 'failed'

export type SubscriptionPaymentMethod =
  | 'upi'
  | 'wallet'
  | 'card'
  | 'netbanking'
  | 'manual'

export type RideStatus =
  | 'requested'
  | 'searching'
  | 'partner_assigned'
  | 'partner_arrived'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'no_show'

export type RidePaymentMethod = 'cash' | 'upi' | 'wallet' | 'card'

export interface MopeduDashboardCounts {
  total_customers: number
  total_partners: number
  active_partners: number
  pending_kyc: number
  pending_vehicle: number
  pending_payment: number
  rides_today: number
  completed_today: number
  cancelled_today: number
  partner_subscription_revenue_today_paise: number
  expiring_subscriptions_7d: number
  suspended_partners: number
  open_complaints: number
  sos_incidents_open: number
}

export interface RiderPartner {
  id: string
  user_id: string
  partner_type: PartnerType
  full_name: string
  phone: string
  email?: string
  profile_photo_url?: string
  city_id: string
  status: PartnerStatus
  kyc_status: KycStatus
  bank_status: BankStatus
  rating: number
  total_rides_completed: number
  total_rides_cancelled: number
  acceptance_rate: number
  cancellation_rate: number
  fraud_score: number
  is_online: boolean
  last_online_at?: string
  suspended_reason?: string
  blocked_reason?: string
  approved_at?: string
  created_at: string
}

export interface RiderVehicle {
  id: string
  partner_id: string
  vehicle_type: VehicleType
  make: string
  model: string
  year: number
  color: string
  registration_number: string
  status: VehicleStatus
  kyc_status: KycStatus
  created_at: string
}

export interface RiderDocument {
  id: string
  owner_type: DocumentOwnerType
  owner_id: string
  document_type: string
  document_number?: string
  file_url: string
  status: DocumentStatus
  rejection_reason?: string
  expires_at?: string
  created_at: string
}

export interface SubscriptionPayment {
  id: string
  subscription_id: string
  partner_id: string
  plan_id: string
  amount_paise: number
  payment_method: SubscriptionPaymentMethod
  status: SubscriptionPaymentStatus
  payment_proof_url?: string
  submitted_at: string
  verified_at?: string
}

export interface MopeduRideEndpoint {
  lat: number
  lng: number
  address?: string
  place_id?: string
}

export interface MopeduRide {
  id: string
  customer_id: string
  partner_id?: string
  vehicle_id?: string
  vehicle_type: VehicleType
  city_id: string
  status: RideStatus
  pickup: MopeduRideEndpoint
  drop: MopeduRideEndpoint
  payment_method: RidePaymentMethod
  fare_estimate_paise: number
  final_fare_paise?: number
  requested_at: string
  partner_assigned_at?: string
  started_at?: string
  completed_at?: string
}

// Convenience pagination wrapper used by list endpoints.
export interface MopeduPaginated<T> {
  items: T[]
  total: number
  limit: number
  offset: number
}

// ── Complaints ────────────────────────────────────────────────────────────

export type ComplaintStatus =
  | 'open'
  | 'under_review'
  | 'resolved'
  | 'dismissed'

export interface Complaint {
  id: string
  ride_id: string
  customer_id: string
  partner_id?: string
  category: string
  description?: string
  status: ComplaintStatus
  resolution_note?: string
  resolved_by?: string
  resolved_at?: string
  created_at: string
}

// ── Safety incidents ──────────────────────────────────────────────────────

export type SafetyIncidentStatus =
  | 'open'
  | 'acknowledged'
  | 'resolved'
  | 'dismissed'

export type SafetyIncidentSeverity = 'critical' | 'high' | 'medium' | 'low'

export interface SafetyIncident {
  id: string
  ride_id?: string
  customer_id?: string
  partner_id?: string
  kind: string
  severity: SafetyIncidentSeverity
  metadata: Record<string, unknown>
  status: SafetyIncidentStatus
  acknowledged_by?: string
  acknowledged_at?: string
  resolved_by?: string
  resolved_at?: string
  created_at: string
}

// ── Cities / Zones / Fare rules ───────────────────────────────────────────

// City-level feature flags. Backend persists these as a `feature_flags` JSONB
// column on `rider_cities`. Defaults reflect Indian regulatory baselines:
// bike taxis are blocked in Karnataka v1, scheduled rides ship in Sprint 5,
// surge is off in v1 to keep pricing predictable, and auto-rickshaws are on.
export interface CityFeatureFlags {
  bike_taxi_enabled?: boolean
  scheduled_rides_enabled?: boolean
  surge_pricing_enabled?: boolean
  auto_rickshaw_enabled?: boolean
}

export interface City {
  id: string
  name: string
  state?: string
  country: string
  currency_code: string
  is_active: boolean
  feature_flags?: CityFeatureFlags
  created_at: string
}

export interface Zone {
  id: string
  city_id: string
  name: string
  // GeoJSON polygon serialized as a string for v1 (textarea-edited).
  boundary?: string
  is_active: boolean
  created_at: string
}

export interface FareRule {
  id: string
  city_id: string
  vehicle_type: VehicleType
  base_fare_paise: number
  per_km_paise: number
  per_minute_paise: number
  minimum_fare_paise: number
  surge_multiplier: number
  cancellation_fee_paise: number
  tax_rate_pct: number
  is_active: boolean
}

// ── Audit logs ────────────────────────────────────────────────────────────

export interface AuditLog {
  id: string
  actor_user_id: string
  action: string
  target_kind: string
  target_id: string
  request_path: string
  request_method: string
  ip_address?: string
  user_agent?: string
  // Body is redacted server-side; arbitrary JSON.
  request_body?: unknown
  response_status: number
  latency_ms: number
  created_at: string
}

// ── Live rides / ride detail enrichment ───────────────────────────────────

export interface MopeduRideStatusEvent {
  status: RideStatus
  at: string
  note?: string
}

export interface MopeduLiveRide extends MopeduRide {
  customer_name?: string
  partner_name?: string
  partner_phone?: string
  vehicle_number?: string
  eta_seconds?: number
}

export interface MopeduRideDetail {
  ride: MopeduRide
  customer_name?: string
  partner_name?: string
  partner_phone?: string
  vehicle_number?: string
  status_history: MopeduRideStatusEvent[]
}

// ── Reports (Sprint 4) ────────────────────────────────────────────────────

export interface RevenueReportRow {
  group_key: string            // plan_id or city_id
  group_name: string           // plan name or city name
  subscriptions_count: number
  subscriptions_revenue_paise: number
  rides_count: number
  rides_completed: number
  rides_cancelled: number
  fare_total_paise: number
  cancellation_fees_paise: number
}

export interface RevenueReport {
  by: 'plan' | 'city'
  since: string
  until: string
  total_subscriptions_revenue_paise: number
  total_fare_paise: number
  rows: RevenueReportRow[]
}

export interface PartnerCohortRetention {
  cohort_month: string
  cohort_size: number
  m1_active: number
  m1_pct: number
  m2_active: number
  m2_pct: number
  m3_active: number
  m3_pct: number
}

export interface CustomerCohortBookingRate {
  cohort_month: string
  cohort_size: number
  m1_avg_rides: number
  m2_avg_rides: number
  m3_avg_rides: number
}

export type CronRunStatus = 'running' | 'succeeded' | 'failed'

export interface CronRunRow {
  id: string
  job: string
  started_at: string
  finished_at?: string
  status: CronRunStatus
  rows_processed: number
  error_summary?: string
}

export type {
  // Re-export for callers preferring `import type` ergonomics.
  PartnerType as MopeduPartnerType,
  PartnerStatus as MopeduPartnerStatus,
  KycStatus as MopeduKycStatus,
  BankStatus as MopeduBankStatus,
  DocumentOwnerType as MopeduDocumentOwnerType,
  DocumentStatus as MopeduDocumentStatus,
  VehicleType as MopeduVehicleType,
  VehicleStatus as MopeduVehicleStatus,
  SubscriptionPaymentStatus as MopeduSubscriptionPaymentStatus,
  SubscriptionPaymentMethod as MopeduSubscriptionPaymentMethod,
  RideStatus as MopeduRideStatus,
  RidePaymentMethod as MopeduRidePaymentMethod,
  ComplaintStatus as MopeduComplaintStatus,
  SafetyIncidentStatus as MopeduSafetyIncidentStatus,
  SafetyIncidentSeverity as MopeduSafetyIncidentSeverity,
}

// ── D2 reports (Wave D2) ──────────────────────────────────────────────────
// Mirrors Architecture/services/rider-service/internal/store/reports.go.

export interface MatchingHealthRow {
  city_id: string
  vehicle_type: string
  rides_total: number
  no_candidate_count: number
  avg_time_to_first_offer_seconds: number | null
}

export interface PartnerQualityRow {
  partner_id: string
  full_name: string
  offers_received: number
  offers_accepted: number
  offers_rejected: number
  offers_expired: number
  acceptance_pct: number | null
  no_show_count_30d: number
  avg_rating_30d: number
}

export interface SupplyDemandRow {
  city_id: string
  hour_bucket: string
  ride_requests: number
  online_partners_avg: number
}

export interface SafetyIncidentReportRow {
  kind: string
  severity: string
  count: number
}

export interface PartnerComplianceRow {
  partner_id: string
  full_name: string
  city: string
  expired_docs: number
  expired_vehicle_docs: number
  oldest_expiry?: string
}
