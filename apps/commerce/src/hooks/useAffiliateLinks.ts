"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import api from "@atpost/api-client"

// Mirrors monetization-service postgres.AffiliateLink.
export type AffiliateLink = {
    id: string
    creator_id: string
    listing_id: string
    commission_pct: number
    commission_flat: number | null
    link_code: string
    click_count: number
    conversion_count: number
    total_earned: number
    is_active: boolean
    created_at: string
}

// Compact product projection from /v1/commerce/products/:productId/preview.
// Composer uses this to render the picker chip + auto-fill the tag
// label + cached image URL.
export type ProductPreview = {
    id: string
    title: string
    slug: string
    primary_image_media_id?: string
    price?: number
    currency?: string
    status: string
    visibility: string
}

/**
 * List the caller's active affiliate links. Composer uses this as the
 * "your products" pane in the tag picker.
 */
export function useMyAffiliateLinks(opts: { limit?: number; offset?: number } = {}) {
    const { limit = 50, offset = 0 } = opts
    return useQuery({
        queryKey: ["affiliate-links", "mine", limit, offset],
        queryFn: async () => {
            const res = await api.get<{ data: AffiliateLink[] }>(
                "/v1/monetization/affiliate/links",
                { params: { limit, offset } },
            )
            return res.data?.data ?? []
        },
        staleTime: 60 * 1000,
    })
}

/**
 * Create a new affiliate link for a product the creator wants to tag.
 * The composer calls this on-the-fly when the creator picks a product
 * they haven't linked before — the linkId then feeds straight into
 * createProductTag.
 */
export function useCreateAffiliateLink() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: async (input: {
            listing_id: string
            commission_pct?: number
            commission_flat?: number
        }) => {
            const res = await api.post<{ data: AffiliateLink }>(
                "/v1/monetization/affiliate/links",
                input,
            )
            return res.data?.data
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["affiliate-links", "mine"] })
        },
    })
}

/**
 * Compact product info for the composer. Returns null on 404 instead
 * of throwing so the caller can surface "product unavailable" inline.
 */
export function useProductPreview(productId: string | null | undefined) {
    return useQuery({
        queryKey: ["product-preview", productId],
        queryFn: async () => {
            try {
                const res = await api.get<{ data: ProductPreview }>(
                    `/v1/commerce/products/${productId}/preview`,
                )
                return res.data?.data ?? null
            } catch {
                return null
            }
        },
        enabled: !!productId,
        staleTime: 5 * 60 * 1000,
    })
}
