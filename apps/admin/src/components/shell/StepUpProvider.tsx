"use client"

import { createContext, useCallback, useContext, useRef, useState } from "react"
import { ShieldCheck } from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"
import api from "@atpost/api-client"
import { Dialog } from "@/components/blocks/Dialog"
import { buttonPrimary, buttonSecondary, inputClass } from "@/components/blocks/buttons"
import { ADMIN_ME_KEY } from "@/hooks/useAdminMe"
import { readApiError } from "@/lib/admin/mutation"
import { STEP_UP_WINDOW_SECONDS, isCompleteOtp, normaliseOtp, stepUpErrorMessage } from "@/lib/admin/stepUp"

type RequestStepUp = () => Promise<boolean>

const StepUpContext = createContext<RequestStepUp | null>(null)

/**
 * One OTP prompt for the whole console.
 *
 * `requestStepUp()` opens the dialog and resolves `true` once
 * `POST /v1/auth/step-up` accepted a code (auth-service has then re-issued the
 * access cookie with a fresh step-up claim), or `false` if the admin closed
 * it. Concurrent callers share the same prompt and the same answer.
 */
export function StepUpProvider({
  children,
  windowSeconds = STEP_UP_WINDOW_SECONDS,
}: {
  children: React.ReactNode
  /** `step_up_window_seconds` from /me. */
  windowSeconds?: number
}) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [otp, setOtp] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pending = useRef<{ promise: Promise<boolean>; resolve: (ok: boolean) => void } | null>(null)

  const finish = useCallback((ok: boolean) => {
    pending.current?.resolve(ok)
    pending.current = null
    setOpen(false)
    setOtp("")
    setError(null)
    setBusy(false)
  }, [])

  const requestStepUp = useCallback<RequestStepUp>(() => {
    if (pending.current) return pending.current.promise
    let resolve: (ok: boolean) => void = () => undefined
    const promise = new Promise<boolean>((r) => {
      resolve = r
    })
    pending.current = { promise, resolve }
    setOpen(true)
    return promise
  }, [])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!isCompleteOtp(otp) || busy) return
    setBusy(true)
    setError(null)
    try {
      await api.post("/v1/auth/step-up", { otp })
      // The countdown in the top bar reads step_up_valid_until from /me.
      await queryClient.invalidateQueries({ queryKey: ADMIN_ME_KEY })
      finish(true)
    } catch (err) {
      setError(stepUpErrorMessage(readApiError(err).code))
      setOtp("")
      setBusy(false)
    }
  }

  return (
    <StepUpContext.Provider value={requestStepUp}>
      {children}
      <Dialog
        open={open}
        title="Confirm it's you"
        description={`This action needs a fresh code from your authenticator app. It stays confirmed for ${Math.round(windowSeconds / 60)} minutes.`}
        onClose={() => finish(false)}
        dismissible={!busy}
      >
        <form onSubmit={submit} className="space-y-3">
          <label className="block text-sm font-semibold text-mo-ink" htmlFor="step-up-otp">
            6-digit code
          </label>
          <input
            id="step-up-otp"
            name="otp"
            className={`${inputClass} font-mo-mono tracking-[0.4em]`}
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            maxLength={6}
            value={otp}
            onChange={(e) => setOtp(normaliseOtp(e.target.value))}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "step-up-error" : undefined}
          />
          {error ? (
            <p id="step-up-error" role="alert" className="text-sm text-mo-bad">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className={buttonSecondary} onClick={() => finish(false)} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className={buttonPrimary} disabled={!isCompleteOtp(otp) || busy}>
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              {busy ? "Checking…" : "Verify"}
            </button>
          </div>
        </form>
      </Dialog>
    </StepUpContext.Provider>
  )
}

export function useStepUp(): RequestStepUp {
  const ctx = useContext(StepUpContext)
  if (!ctx) throw new Error("useStepUp must be used inside <StepUpProvider>")
  return ctx
}
