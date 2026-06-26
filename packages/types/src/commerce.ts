export type SellerStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'changes_required'
  | 'approved'
  | 'rejected'
  | 'suspended'
  | 'disabled'

export type SellerType = 'individual' | 'business'
export type BusinessType =
  | 'individual'
  | 'retailer'
  | 'wholesaler'
  | 'manufacturer'
  | 'brand'
  | 'home_business'

export interface Seller {
  id: string
  user_id: string
  business_page_id?: string
  seller_type: SellerType
  business_type: BusinessType
  store_name: string
  brand_name?: string
  owner_name?: string
  slug: string
  description?: string
  tagline?: string
  email: string
  phone?: string
  gst_number?: string
  state?: string
  city?: string
  postal_code?: string
  logo_media_id?: string
  banner_media_id?: string
  support_phone?: string
  support_email?: string
  social_links_json?: Record<string, string>
  status: SellerStatus
  onboarding_step: number
  submitted_at?: string
  approved_at?: string
  rejected_at?: string
  rejection_reason?: string
  changes_requested?: string
  verification_status: string
  store_status: string
  created_at: string
  updated_at: string
}

export interface SellerDocument {
  id: string
  seller_id: string
  document_type: string
  document_number?: string
  media_id: string
  verification_status: string
  uploaded_at: string
}

export interface DashboardStats {
  total_products: number
  live_products: number
  draft_products: number
  pending_products: number
  low_stock_items: number
  orders_today: number
  revenue_total: number
  seller_status: SellerStatus
}

export type ProductStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'approved'
  | 'live'
  | 'hidden'
  | 'archived'
  | 'rejected'
  | 'changes_requested'

export interface Product {
  id: string
  seller_id: string
  title: string
  slug: string
  description?: string
  approval_status: ProductStatus
  created_at: string
  updated_at: string
}

// ── Onboarding step payloads ────────────────────────────────────

export interface OnboardingStartPayload {
  business_page_id?: string
  store_name: string
  email: string
  seller_type?: SellerType
  business_type?: BusinessType
}

export interface OnboardingBasicPayload {
  store_name: string
  owner_name: string
  business_type: BusinessType
  seller_type?: SellerType
  email: string
  phone?: string
  state?: string
  city?: string
  postal_code?: string
  description?: string
}

export interface OnboardingStorefrontPayload {
  brand_name?: string
  logo_media_id?: string
  banner_media_id?: string
  tagline?: string
  support_phone?: string
  support_email?: string
}

export interface OnboardingDocumentPayload {
  document_type: string
  document_number?: string
  media_id: string
}

export interface OnboardingFulfillmentPayload {
  delivery_modes?: string[]
  cod_enabled?: boolean
  dispatch_sla_hours?: number
  return_supported?: boolean
  return_window_days?: number
}

export interface OnboardingPayoutPayload {
  account_holder_name: string
  bank_name?: string
  account_number: string
  ifsc_code?: string
  upi_id?: string
}
