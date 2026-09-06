"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import api from "@atpost/api-client"
import type { AttributeSchema, AttributeScope, Category } from "@atpost/types/commerce"
import type { AttributeWireValue } from "@/lib/listing"
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

export type ListingCreatePayload = CreateProductPayload & {
  status?: "draft"
  /** `[{code, value, unit_code?}]` — the shape both write routes take. */
  attributes?: AttributeWireValue[]
}

export type ListingPatchPayload = Partial<Omit<ListingCreatePayload, "variants">> & {
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
