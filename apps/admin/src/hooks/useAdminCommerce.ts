"use client"

import { useQuery } from "@tanstack/react-query"
import api from "@/lib/admin/api"
import { readList } from "@/lib/admin/data"
import type { Seller, Product } from "@atpost/types/commerce"
import { useAdminMutation } from "@/hooks/useAdminMutation"

/**
 * MStore through admin-service (`/v1/admin/commerce`). Every route is
 * permission-checked and audited there:
 *
 *   sellers queue, approve, reject    commerce:seller.approve
 *   suspend, unsuspend                commerce:seller.suspend
 *   products queue and decisions      commerce:products.moderate
 *   KYC verify                        commerce:kyc.verify, step-up
 *   pending payouts (a READ)          commerce:payouts.read, step-up
 *   COD remittance settle             commerce:cod.settle, step-up, two-person
 *
 * Writes go through useAdminMutation, so a STEP_UP_REQUIRED opens the OTP
 * dialog and a 202 says "Sent for approval".
 */
const ADMIN = "/v1/admin/commerce"

/** Queues answer as a bare array, {items} or {sellers}; readList takes any of them. */
const list = <T>(path: string) => async (): Promise<T[]> => readList((await api.get(`${ADMIN}${path}`)).data) as unknown as T[]

export const SELLERS_KEY = ["admin", "sellers", "queue"] as const
export const PRODUCTS_KEY = ["admin", "products", "queue"] as const
export const PAYOUTS_KEY = ["admin", "payouts"] as const

export function useSellerQueue({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery<Seller[]>({ queryKey: SELLERS_KEY, queryFn: list<Seller>("/sellers/queue"), enabled })
}

export function useProductQueue({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery<Product[]>({ queryKey: PRODUCTS_KEY, queryFn: list<Product>("/products/queue"), enabled })
}

/**
 * One seller's pending payout, as commerce answers GET /payouts/pending
 * ({sellers: [...]}). Amounts arrive as rupees; the page converts to paise.
 */
export type PendingPayout = {
  seller_id: string
  store_name?: string
  remittance_count?: number
  total_gross?: number
  total_commission?: number
  total_platform_fee?: number
  total_tds?: number
  total_net?: number
  oldest_delivered?: string
}

/** Needs step-up: the page offers the 2FA prompt when this fails with STEP_UP_REQUIRED. */
export function usePendingPayouts({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery<PendingPayout[]>({ queryKey: PAYOUTS_KEY, queryFn: list<PendingPayout>("/payouts/pending"), enabled, retry: false })
}

type ActionVars = { id: string; reason?: string; notes?: string }

function useCommerceAction(path: (id: string) => string, invalidate: readonly string[], done: string) {
  return useAdminMutation<ActionVars>({
    request: ({ id, reason, notes }) => ({
      method: "post",
      url: `${ADMIN}${path(encodeURIComponent(id))}`,
      body: { ...(reason ? { reason } : {}), ...(notes ? { notes } : {}) },
    }),
    invalidate: [invalidate],
    successMessage: done,
    errorTitle: `${done} failed`,
  })
}

export const useApproveSeller = () => useCommerceAction((id) => `/sellers/${id}/approve`, SELLERS_KEY, "Seller approved")
export const useRejectSeller = () => useCommerceAction((id) => `/sellers/${id}/reject`, SELLERS_KEY, "Seller rejected")
export const useSuspendSeller = () => useCommerceAction((id) => `/sellers/${id}/suspend`, SELLERS_KEY, "Seller suspended")
export const useVerifySellerKYC = () => useCommerceAction((id) => `/sellers/${id}/kyc/verify`, SELLERS_KEY, "KYC verified")

export const useApproveProduct = () => useCommerceAction((id) => `/products/${id}/approve`, PRODUCTS_KEY, "Product approved")
export const useRejectProduct = () => useCommerceAction((id) => `/products/${id}/reject`, PRODUCTS_KEY, "Product rejected")
