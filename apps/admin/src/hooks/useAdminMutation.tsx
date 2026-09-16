"use client"

import Link from "next/link"
import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query"
import api from "@atpost/api-client"
import { useToast } from "@atpost/ui"
import { useStepUp } from "@/components/shell/StepUpProvider"
import { adminErrorMessage, runAdminMutation, type MutationOutcome } from "@/lib/admin/mutation"

export type AdminRequest = {
  method: "post" | "put" | "patch" | "delete"
  url: string
  body?: unknown
}

/**
 * Every console write goes through here:
 *
 *   · 403 STEP_UP_REQUIRED opens the OTP dialog and retries the request once;
 *   · 202 {approval} says "Sent for approval" with a link to the inbox, and
 *     does NOT report the action as done;
 *   · anything else is a success or an error toast.
 */
export function useAdminMutation<Vars>({
  request,
  invalidate = [],
  successMessage,
  errorTitle,
}: {
  request: (vars: Vars) => AdminRequest
  invalidate?: QueryKey[]
  successMessage: string
  errorTitle: string
}) {
  const stepUp = useStepUp()
  const qc = useQueryClient()
  const toast = useToast()

  return useMutation<MutationOutcome, unknown, Vars>({
    mutationFn: (vars) => {
      const { method, url, body } = request(vars)
      const send = async () => {
        const response =
          method === "delete" ? await api.delete(url, { data: body }) : await api[method](url, body ?? {})
        return { status: response.status, data: response.data }
      }
      return runAdminMutation(send, stepUp)
    },
    onSuccess: (outcome) => {
      if (outcome.kind === "cancelled") {
        toast.toast({ title: "Not done", description: "The action needs a fresh 2FA code.", variant: "info" })
        return
      }
      for (const key of invalidate) qc.invalidateQueries({ queryKey: key })
      if (outcome.kind === "approval") {
        qc.invalidateQueries({ queryKey: ["admin", "approvals"] })
        toast.toast({
          title: "Sent for approval",
          variant: "info",
          duration: 0,
          description: (
            <>
              A second admin must approve this before it happens.{" "}
              <Link href="/approvals" className="font-semibold text-mo-cyan underline">
                Open the approvals inbox
              </Link>
            </>
          ),
        })
        return
      }
      toast.success(successMessage)
    },
    onError: (err) => {
      toast.error(errorTitle, adminErrorMessage(err))
    },
  })
}
