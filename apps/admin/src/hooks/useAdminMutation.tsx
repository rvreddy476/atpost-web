"use client"

import Link from "next/link"
import { useCallback } from "react"
import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query"
import api from "@/lib/admin/api"
import { useToast } from "@atpost/ui"
import { useStepUp } from "@/components/shell/StepUpProvider"
import {
  adminErrorMessage,
  prepareSend,
  runAdminMutation,
  type AdminWrite,
  type MutationOutcome,
  type Transport,
} from "@/lib/admin/mutation"

export type AdminRequest = Omit<AdminWrite, "method"> & { method: "post" | "put" | "patch" | "delete" }

/** axios, as the console's transport: headers per request, bodies on DELETE too. */
const transport: Transport = async ({ method, url, body, headers }) => {
  const response =
    method === "get"
      ? await api.get(url, { headers })
      : method === "delete"
        ? await api.delete(url, { data: body, headers })
        : await api[method](url, body ?? {}, { headers })
  return { status: response.status, data: response.data }
}

/**
 * Every console write goes through here:
 *
 *   · 403 STEP_UP_REQUIRED opens the OTP dialog and retries the request once,
 *     with the same Idempotency-Key when the route needs one;
 *   · 202 {approval} says "Sent for approval" with a link to the inbox, and
 *     does NOT report the action as done;
 *   · anything else is a success or an error toast.
 */
export function useAdminMutation<Vars>({
  request,
  invalidate = [],
  successMessage,
  errorTitle,
  onDone,
}: {
  request: (vars: Vars) => AdminRequest
  invalidate?: QueryKey[]
  successMessage: string | ((data: unknown) => string)
  errorTitle: string
  /** Runs once the server accepted the action: carried out ("done") or queued for a second approver ("approval"). Not after a dismissed step-up. */
  onDone?: (data: unknown, vars: Vars, kind: "done" | "approval") => void
}) {
  const stepUp = useStepUp()
  const qc = useQueryClient()
  const toast = useToast()

  return useMutation<MutationOutcome, unknown, Vars>({
    mutationFn: (vars) => {
      const { send } = prepareSend(request(vars), transport)
      return runAdminMutation(send, stepUp)
    },
    onSuccess: (outcome, vars) => {
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
        onDone?.(outcome.approval, vars, "approval")
        return
      }
      toast.success(typeof successMessage === "function" ? successMessage(outcome.data) : successMessage)
      onDone?.(outcome.data, vars, "done")
    },
    onError: (err) => {
      toast.error(errorTitle, adminErrorMessage(err))
    },
  })
}

/**
 * A READ that may need a step-up (a panic location, rider KYC, pending
 * payouts, a settlement file link). Resolves the body, or null when the admin
 * dismissed the 2FA prompt. Two-person never applies to reads.
 */
export function useStepUpRead() {
  const stepUp = useStepUp()
  return useCallback(
    async (url: string): Promise<unknown | null> => {
      const { send } = prepareSend({ method: "get", url }, transport)
      const outcome = await runAdminMutation(send, stepUp)
      return outcome.kind === "done" ? outcome.data : null
    },
    [stepUp],
  )
}
