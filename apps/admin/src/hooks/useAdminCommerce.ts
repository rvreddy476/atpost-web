"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import api from "@atpost/api-client"
import { useToast } from "@atpost/ui"
import type { Seller, Product } from "@atpost/types/commerce"
import { apiErrorMessage } from "@/lib/catalogue"

// Admin commerce endpoints live under /v1/commerce/admin. They require the
// caller's JWT to carry admin scopes — locally that means the logged-in user's
// id is in the gateway's SUPERADMIN_USER_IDS (then re-login). Otherwise 403.
const ADMIN = "/v1/admin/commerce"

const list = <T>(path: string) => async (): Promise<T[]> =>
  (await api.get(`${ADMIN}${path}`)).data.data ?? []

export function useSellerQueue() {
  return useQuery<Seller[]>({ queryKey: ["admin", "sellers", "queue"], queryFn: list<Seller>("/sellers/queue") })
}

export function useProductQueue() {
  return useQuery<Product[]>({ queryKey: ["admin", "products", "queue"], queryFn: list<Product>("/products/queue") })
}

export type PendingPayout = {
  id: string
  seller_id: string
  amount_minor: number
  currency_code?: string
  status: string
}

export function usePendingPayouts() {
  return useQuery<PendingPayout[]>({ queryKey: ["admin", "payouts"], queryFn: list<PendingPayout>("/payouts/pending") })
}

// Generic POST action that re-fetches the affected queue on success.
//
// Both outcomes are reported now that the layout mounts a ToastProvider: before
// this, a rejected approval simply re-enabled its button and said nothing, so a
// 403 on the whole queue looked identical to a no-op.
function useAdminAction(
  makePath: (id: string) => string,
  invalidate: string[],
  done: string,
) {
  const qc = useQueryClient()
  const { success, error } = useToast()
  return useMutation({
    mutationFn: async (vars: { id: string; body?: Record<string, unknown> }) =>
      (await api.post(makePath(vars.id), vars.body ?? {})).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: invalidate })
      success(done)
    },
    onError: (err) =>
      error(`${done} failed`, apiErrorMessage(err, "The server did not say why.")),
  })
}

const SELLERS = ["admin", "sellers", "queue"]
const PRODUCTS = ["admin", "products", "queue"]

export const useApproveSeller = () =>
  useAdminAction((id) => `${ADMIN}/sellers/${id}/approve`, SELLERS, "Seller approved")
export const useRejectSeller = () =>
  useAdminAction((id) => `${ADMIN}/sellers/${id}/reject`, SELLERS, "Seller rejected")
export const useVerifySellerKYC = () =>
  useAdminAction((id) => `${ADMIN}/sellers/${id}/kyc/verify`, SELLERS, "KYC verified")
export const useSuspendSeller = () =>
  useAdminAction((id) => `${ADMIN}/sellers/${id}/suspend`, SELLERS, "Seller suspended")

export const useApproveProduct = () =>
  useAdminAction((id) => `${ADMIN}/products/${id}/approve`, PRODUCTS, "Product approved")
export const useRejectProduct = () =>
  useAdminAction((id) => `${ADMIN}/products/${id}/reject`, PRODUCTS, "Product rejected")
