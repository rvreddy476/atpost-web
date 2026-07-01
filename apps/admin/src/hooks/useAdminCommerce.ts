import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import api from "@atpost/api-client"
import type { Seller, Product } from "@atpost/types/commerce"

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
function useAdminAction(makePath: (id: string) => string, invalidate: string[]) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars: { id: string; body?: Record<string, unknown> }) =>
      (await api.post(makePath(vars.id), vars.body ?? {})).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: invalidate }),
  })
}

const SELLERS = ["admin", "sellers", "queue"]
const PRODUCTS = ["admin", "products", "queue"]

export const useApproveSeller = () => useAdminAction((id) => `${ADMIN}/sellers/${id}/approve`, SELLERS)
export const useRejectSeller = () => useAdminAction((id) => `${ADMIN}/sellers/${id}/reject`, SELLERS)
export const useVerifySellerKYC = () => useAdminAction((id) => `${ADMIN}/sellers/${id}/kyc/verify`, SELLERS)
export const useSuspendSeller = () => useAdminAction((id) => `${ADMIN}/sellers/${id}/suspend`, SELLERS)

export const useApproveProduct = () => useAdminAction((id) => `${ADMIN}/products/${id}/approve`, PRODUCTS)
export const useRejectProduct = () => useAdminAction((id) => `${ADMIN}/products/${id}/reject`, PRODUCTS)
