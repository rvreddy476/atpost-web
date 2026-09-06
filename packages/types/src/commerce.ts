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

// ── Catalogue: categories ───────────────────────────────────────

// The category tree the shop browses and a listing is filed under. `children`
// is present only on tree responses; list responses leave it undefined rather
// than empty, so `children === undefined` means "not loaded", not "a leaf".
export interface Category {
  id: string
  name: string
  slug: string
  parent_id: string | null
  display_order: number
  is_active: boolean
  is_featured: boolean
  /** False for pure grouping nodes — a seller cannot list directly against them. */
  is_listable: boolean
  image_url: string | null
  product_count: number
  children?: Category[]
}

// ── Catalogue: attribute schema ─────────────────────────────────

// The data types this build knows how to render and validate.
export type AttributeDataType =
  | 'text'
  | 'long_text'
  | 'integer'
  | 'decimal'
  | 'money_minor'
  | 'boolean'
  | 'enum'
  | 'multi_enum'
  | 'date'
  | 'measure'
  | 'media'
  | 'gtin'

export const ATTRIBUTE_DATA_TYPES = [
  'text',
  'long_text',
  'integer',
  'decimal',
  'money_minor',
  'boolean',
  'enum',
  'multi_enum',
  'date',
  'measure',
  'media',
  'gtin',
] as const satisfies readonly AttributeDataType[]

// The server owns the attribute vocabulary and will add data types faster than
// this client ships. `AnyAttributeDataType` keeps the twelve known members
// autocompleting while still accepting a string this build has never seen, so
// an unknown definition survives to the "unsupported field" branch instead of
// failing to parse. A field that silently vanishes from a seller's form is a
// field they get rejected on.
export type AnyAttributeDataType = AttributeDataType | (string & {})

export function isKnownAttributeDataType(value: string): value is AttributeDataType {
  return (ATTRIBUTE_DATA_TYPES as readonly string[]).includes(value)
}

/** `item` attributes describe the product; `offer` attributes describe one seller's listing of it. */
export type AttributeScope = 'item' | 'offer'

export interface AttributeEnumValue {
  value: string
  /**
   * The same identity under the name the schema endpoint actually serves it
   * by. `GET …/attribute-schema` sends an option as `{code, label,
   * swatch_hex}`; this type has always called that field `value`. Both are
   * declared so a reader can take `value || code` — which matters most on a
   * variation axis, where what travels must be the option's own code and a
   * server sent anything else refuses it by design.
   */
  code?: string
  label: string
  sort_order?: number
  is_active?: boolean
  /** Hex swatch for a colour-like option list; absent or null everywhere else. */
  swatch_hex?: string | null
}

export interface AttributeUnit {
  /** Machine code stored with the value, e.g. "g", "kg", "cm". */
  code: string
  label: string
  /** Multiplier to the family's base unit. A decimal string — never a float. */
  to_base?: string
  is_default?: boolean
}

export interface AttributeDefinition {
  code: string
  label: string
  help_text?: string | null
  data_type: AnyAttributeDataType
  required: boolean
  scope: AttributeScope
  is_variant_axis: boolean
  is_filterable: boolean
  /** Numeric bound for numbers/measures; element-count bound for multi_enum and media. */
  min?: number | null
  max?: number | null
  /** Length bound for the text-ish types. */
  max_len?: number | null
  /** Server-supplied pattern for text-ish types (JS-compatible source, no delimiters). */
  regex?: string | null
  values?: AttributeEnumValue[]
  unit_family?: string | null
  default_unit?: string | null
  units?: AttributeUnit[]
  /** Non-null when the option list is too large to inline and must be searched remotely. */
  lookup_endpoint: string | null
}

export interface AttributeGroup {
  name: string
  sort_order: number
  attributes: AttributeDefinition[]
}

export interface AttributeSchema {
  category_id: string
  /** Root-first ancestry of the category, for the breadcrumb above the form. */
  category_path: string[]
  /** Bumped whenever the server changes the schema; a submit against a stale version is rejected. */
  schema_version: number
  /** Attribute codes that split a product into variants, in axis order. */
  variation_axes: string[]
  groups: AttributeGroup[]
}

// A single attribute's value, discriminated on `type` so the renderer never has
// to guess. Money is always integer minor units and decimals are always strings
// — a rupee amount that round-trips through a JS `number` is a rupee amount
// that eventually loses a paisa.
export type AttributeValue =
  | { type: 'text'; value: string }
  | { type: 'long_text'; value: string }
  | { type: 'integer'; value: number }
  /** Decimal as an exact string, e.g. "12.345". Never a float. */
  | { type: 'decimal'; value: string }
  /** Integer minor units, e.g. 129900 for ₹1,299.00. */
  | { type: 'money_minor'; value: number; currency_code?: string }
  | { type: 'boolean'; value: boolean }
  | { type: 'enum'; value: string }
  | { type: 'multi_enum'; value: string[] }
  /** ISO calendar date, "yyyy-mm-dd". */
  | { type: 'date'; value: string }
  /** Decimal string plus the unit code it is expressed in. */
  | { type: 'measure'; value: string; unit: string }
  /** Media ids, in display order. */
  | { type: 'media'; value: string[] }
  | { type: 'gtin'; value: string }
  /**
   * A value whose `data_type` this build does not know. It is carried verbatim
   * so an edit round-trips it back to the server untouched rather than wiping
   * a field the seller never even saw.
   */
  | { type: 'unknown'; data_type: string; value: unknown }

/** The form's working state: one value per attribute code. */
export type AttributeValueMap = Record<string, AttributeValue | null | undefined>
