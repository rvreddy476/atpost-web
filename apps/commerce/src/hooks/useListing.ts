"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import api from "@atpost/api-client"
import type { AttributeSchema, AttributeScope, Category } from "@atpost/types/commerce"
import type { AttributeWireValue } from "@/lib/listing"
import type { VariantCreateWire, VariantOptionsWire, VariationAxisWire } from "@/lib/variation"
import type { CreateProductPayload } from "./useSellerDashboard"

/** The public catalogue routes. A seller browsing categories is not yet authenticated. */
const COMMERCE = "/v1/commerce"

export const listingKeys = {
  categoryTree: ["commerce", "category-tree"] as const,
  attributeSchema: (categoryId: string, scope: string) =>
    ["commerce", "attribute-schema", categoryId, scope] as const,
  taxClasses: ["commerce", "tax-classes"] as const,
}

function unwrap<T>(body: unknown): T | null {
  const envelope = body as { data?: T } | null
  return (envelope?.data ?? null) as T | null
}

// ── Categories ──────────────────────────────────────────────────

/**
 * The nested tree. `is_listable` decides whether a node can carry a listing;
 * the picker still lets a seller open a non-listable node, because "Fashion" is
 * how you get to "Shirts".
 */
export function useCategoryTree() {
  return useQuery<Category[]>({
    queryKey: listingKeys.categoryTree,
    queryFn: async () => unwrap<Category[]>((await api.get(`${COMMERCE}/categories?tree=true`)).data) ?? [],
    staleTime: 5 * 60_000,
  })
}

// ── The form itself ─────────────────────────────────────────────

// The ETag the gateway last handed us per category+scope, alongside the body it
// belonged to. React Query's own cache expires; this survives it, so coming
// back to a category the seller already opened costs a 304 rather than the
// whole schema again.
const schemaCache = new Map<string, { etag: string; schema: AttributeSchema | null }>()

/** Exported for tests and for the "reload the form" path after a `stale` verdict. */
export function forgetAttributeSchema(): void {
  schemaCache.clear()
}

/**
 * `GET /categories/:id/attribute-schema`.
 *
 * Resolves to `null` — not an error — when the category has no schema authored
 * yet (404 CATEGORY_NOT_FOUND, or a body with no groups). That null is the
 * fork: the caller renders the built-in form instead, which is what lets the
 * founder author one category at a time.
 */
export function useAttributeSchema(categoryId: string | null, scope: AttributeScope | "all" = "all") {
  return useQuery<AttributeSchema | null>({
    queryKey: listingKeys.attributeSchema(categoryId ?? "none", scope),
    enabled: !!categoryId,
    queryFn: async () => {
      const key = `${categoryId}:${scope}`
      const cached = schemaCache.get(key)
      const res = await api.get(`${COMMERCE}/categories/${categoryId}/attribute-schema?scope=${scope}`, {
        headers: cached ? { "If-None-Match": cached.etag } : undefined,
        // 304 and 404 are both answers here, not failures: one means "what you
        // hold is still correct", the other "nothing is authored for this
        // category". Letting axios throw either would turn a good outcome into
        // an error banner.
        validateStatus: (status) => status === 304 || status === 404 || (status >= 200 && status < 300),
      })

      if (res.status === 304 && cached) return cached.schema
      if (res.status === 404) return null

      const schema = unwrap<AttributeSchema>(res.data)
      const normalised = schema && Array.isArray(schema.groups) ? schema : null
      const etag = (res.headers as Record<string, unknown>)?.etag
      if (typeof etag === "string" && etag) schemaCache.set(key, { etag, schema: normalised })
      return normalised
    },
  })
}

// ── Tax classes ─────────────────────────────────────────────────

export interface TaxClass {
  id: string
  name: string
  rate_percent?: number
  hsn_code?: string | null
}

export function useTaxClasses() {
  return useQuery<TaxClass[]>({
    queryKey: listingKeys.taxClasses,
    queryFn: async () => unwrap<TaxClass[]>((await api.get(`${COMMERCE}/tax-classes`)).data) ?? [],
    staleTime: 5 * 60_000,
  })
}

// ── Create and patch ────────────────────────────────────────────

export type ListingCreatePayload = Omit<CreateProductPayload, "variants"> & {
  /**
   * One entry per variant.
   *
   * A product with no axes sends exactly one, in the rupee shape it has always
   * sent — unchanged, so nothing that lists today starts failing. A product
   * with axes sends one per combination in integer paise. The same route takes
   * both: `*_minor` wins wherever it is present, and rupee floats are the
   * fallback the pre-minor clients still use.
   */
  variants: Array<CreateProductPayload["variants"][number] | VariantCreateWire>
  status?: "draft"
  /** `[{code, value, unit_code?}]` — the shape both write routes take. */
  attributes?: AttributeWireValue[]
  /**
   * `[{code}]` in axis order, and ONLY on a product that varies.
   *
   * The server reads `variants` as a matrix only when this key is present, so
   * a listing with no axes must not send it at all — an empty array is a
   * request to CLEAR the matrix, not a way of saying "no matrix here".
   */
  variation_axes?: VariationAxisWire[]
}

export type ListingPatchPayload = Partial<Omit<ListingCreatePayload, "variants">> & {
  /**
   * The matrix half of a patch: every existing variant, by id, with its value
   * on each axis — and every one of them, because a matrix change replaces the
   * whole picture. Travels only alongside `variation_axes`; on its own the
   * server refuses it by name rather than guess which half was meant.
   */
  variants?: VariantOptionsWire[]
  /**
   * Only ever true on a SECOND attempt, after the seller has read what a
   * revalidation costs and said yes. Sending it on the first try would hide the
   * 409 the server raises precisely so a human can decide.
   */
  revalidate?: boolean
}

export interface CreatedListing {
  id: string
  status?: string
  approval_status?: string
}

/** First save: the draft row the rest of the flow patches. */
export function useCreateListing() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: ListingCreatePayload) => {
      const res = await api.post(`${COMMERCE}/products`, payload)
      return unwrap<CreatedListing>(res.data) as CreatedListing
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["seller", "products"] }),
  })
}

/** Every save after the first. The server owns the allowlist; we surface its refusals by name. */
export function usePatchListing() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: { productId: string; patch: ListingPatchPayload }) => {
      const res = await api.patch(`${COMMERCE}/products/${args.productId}`, args.patch)
      return unwrap<CreatedListing>(res.data)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["seller", "products"] }),
  })
}

/**
 * An existing listing, for the edit path.
 *
 * Without this the guided form opened `?product=<id>` with empty state and
 * PATCHed it straight back — `{"title":"", "tax_class_id":"", …}` over a real
 * seller's listing. The matrix was already seeded from the variants; the
 * built-in fields and the attribute answers were not, so the edit silently
 * erased everything the schema-driven half of the form owns.
 *
 * `GET /v1/commerce/products/:id` returns `{product, variants, attributes,
 * media}` — the product's own columns and its answers side by side, which is
 * exactly the two things that were missing.
 */
export function useExistingListing(productId: string | null | undefined) {
  return useQuery({
    queryKey: ["listing", "existing", productId],
    enabled: !!productId,
    // The seller is editing: a cached copy from before their last save would
    // seed the form with values they have already changed.
    staleTime: 0,
    queryFn: async () => {
      const res = await api.get(`/v1/commerce/products/${productId}`)
      const d = (res.data as { data?: unknown }).data as
        | {
            product?: Record<string, unknown>
            attributes?: Array<{ code?: string; data_type?: string; value?: unknown; unit_code?: string }>
          }
        | undefined
      return {
        product: d?.product ?? {},
        attributes: Array.isArray(d?.attributes) ? d.attributes : [],
      }
    },
  })
}
