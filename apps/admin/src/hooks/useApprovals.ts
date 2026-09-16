"use client"

import { useQuery } from "@tanstack/react-query"
import api from "@atpost/api-client"
import { useAdmin } from "@/components/shell/AdminShell"
import { useAdminMutation } from "@/hooks/useAdminMutation"
import { parseApprovals } from "@/lib/admin/approvals"

export const APPROVALS_KEY = ["admin", "approvals"] as const

/** `GET /v1/admin/approvals` — pending requests this admin may decide. */
export function useApprovals() {
  const { me } = useAdmin()
  const query = useQuery({
    queryKey: APPROVALS_KEY,
    queryFn: async () => (await api.get("/v1/admin/approvals")).data,
    refetchInterval: 30_000,
  })
  return {
    items: query.data === undefined ? [] : parseApprovals(query.data, me.userId),
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  }
}

/**
 * Approve needs step-up and a reason (the step-up dialog opens on
 * STEP_UP_REQUIRED and the request is sent once more); reject needs a reason.
 */
export function useDecideApproval(decision: "approve" | "reject") {
  return useAdminMutation<{ id: string; reason: string }>({
    request: ({ id, reason }) => ({
      method: "post",
      url: `/v1/admin/approvals/${encodeURIComponent(id)}/${decision}`,
      body: { reason },
    }),
    invalidate: [APPROVALS_KEY],
    successMessage: decision === "approve" ? "Approved and carried out" : "Request rejected",
    errorTitle: decision === "approve" ? "Approval failed" : "Rejection failed",
  })
}
