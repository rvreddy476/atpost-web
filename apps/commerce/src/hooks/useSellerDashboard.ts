'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@atpost/api-client'
import type { DashboardStats, Product } from '@atpost/types/commerce'

export function useSellerDashboard() {
  return useQuery({
    queryKey: ['seller', 'dashboard'],
    queryFn: async () => {
      const res = await api.get<{ data: DashboardStats }>('/v1/commerce/dashboard')
      return res.data.data
    },
  })
}

export function useMyProducts(params: { limit?: number; offset?: number } = {}) {
  const { limit = 20, offset = 0 } = params
  return useQuery({
    queryKey: ['seller', 'products', limit, offset],
    queryFn: async () => {
      // sellers/me gives the seller; then list seller products
      const sellerRes = await api.get<{ data: { id: string } }>('/v1/commerce/sellers/me')
      const sellerId = sellerRes.data.data.id
      const res = await api.get<{ data: Product[] }>(
        `/v1/commerce/sellers/${sellerId}/products?limit=${limit}&offset=${offset}`
      )
      return res.data.data ?? []
    },
  })
}

export function useSubmitProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (productId: string) => {
      await api.post(`/v1/commerce/products/${productId}/submit`)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['seller', 'products'] }),
  })
}

// CreateProductPayload mirrors commerce-service `createProductReq` after the
// Phase 3.1 expansion — every column the seller wizard exposes. Optional
// fields are omitted from the JSON when empty so the backend treats them as
// unset rather than zero-valued.
export type CreateProductPayload = {
  title: string
  short_title?: string
  description?: string
  short_description?: string
  category_id?: string
  brand_id?: string
  tax_class_id?: string
  brand_name?: string
  manufacturer_name?: string
  product_type?: string
  condition?: string
  return_policy_type?: string
  return_policy_days?: number
  hsn_code?: string
  primary_image_media_id?: string
  video_media_id?: string
  weight_grams?: number
  length_cm?: number
  width_cm?: number
  height_cm?: number
  country_of_origin?: string
  warranty_info?: string
  search_keywords?: string[]
  meta_title?: string
  meta_description?: string
  variants: Array<{
    sku: string
    mrp: number
    selling_price: number
    stock_qty?: number
    cost_price?: number
    option_1_name?: string
    option_1_value?: string
    option_2_name?: string
    option_2_value?: string
    option_3_name?: string
    option_3_value?: string
  }>
}

export function useCreateProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CreateProductPayload) => {
      const res = await api.post<{ data: Product }>('/v1/commerce/products', payload)
      return res.data.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['seller', 'products'] }),
  })
}

// useAddProductMedia attaches an already-uploaded media asset to the
// product's gallery. Used by the Phase 3.3 multi-step wizard after each
// image/video upload completes — the server stores the gallery row, then
// the wizard moves on to the next file.
export function useAddProductMedia() {
  return useMutation({
    mutationFn: async (args: {
      productId: string
      mediaId: string
      mediaType?: 'image' | 'video'
      sortOrder?: number
    }) => {
      const { productId, mediaId, mediaType = 'image', sortOrder = 0 } = args
      await api.post(`/v1/commerce/products/${productId}/media`, {
        media_id: mediaId,
        media_type: mediaType,
        sort_order: sortOrder,
      })
    },
  })
}

// useSetProductAttributes replaces the product's attribute set atomically.
// Used at the end of the wizard with the key/value pairs the seller filled.
export function useSetProductAttributes() {
  return useMutation({
    mutationFn: async (args: {
      productId: string
      attributes: Array<{ name: string; value: string; unit?: string }>
    }) => {
      await api.put(`/v1/commerce/products/${args.productId}/attributes`, {
        attributes: args.attributes,
      })
    },
  })
}

/* ------------------------------------------------------------------ */
/*  Variant CRUD hooks (commerce TODO H#5)                            */
/* ------------------------------------------------------------------ */

export interface ProductVariantSummary {
  id: string
  product_id: string
  sku: string
  barcode?: string | null
  option_1_name?: string | null
  option_1_value?: string | null
  option_2_name?: string | null
  option_2_value?: string | null
  option_3_name?: string | null
  option_3_value?: string | null
  mrp: number
  selling_price: number
  cost_price?: number | null
  currency_code?: string
  status: string
  weight_grams?: number | null
  created_at?: string
  updated_at?: string
}

export function useProductVariants(productId: string | undefined) {
  return useQuery({
    queryKey: ['seller', 'product', productId, 'variants'],
    queryFn: async () => {
      const res = await api.get<{ data: { items: ProductVariantSummary[] } }>(
        `/v1/commerce/products/${productId}/variants`,
      )
      return res.data.data?.items ?? []
    },
    enabled: !!productId,
  })
}

export type CreateVariantPayload = {
  sku: string
  barcode?: string
  option_1_name?: string
  option_1_value?: string
  option_2_name?: string
  option_2_value?: string
  option_3_name?: string
  option_3_value?: string
  mrp: number
  selling_price: number
  cost_price?: number
  currency_code?: string
  weight_grams?: number
}

export function useAddProductVariant(productId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CreateVariantPayload) => {
      const res = await api.post<{ data: ProductVariantSummary }>(
        `/v1/commerce/products/${productId}/variants`,
        payload,
      )
      return res.data.data
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['seller', 'product', productId, 'variants'] }),
  })
}

export function useUpdateProductVariant(productId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: { variantId: string; patch: Partial<CreateVariantPayload> & { status?: string } }) => {
      const res = await api.patch<{ data: ProductVariantSummary }>(
        `/v1/commerce/variants/${args.variantId}`,
        args.patch,
      )
      return res.data.data
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['seller', 'product', productId, 'variants'] }),
  })
}

export function useArchiveProductVariant(productId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (variantId: string) => {
      await api.delete(`/v1/commerce/variants/${variantId}`)
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['seller', 'product', productId, 'variants'] }),
  })
}
