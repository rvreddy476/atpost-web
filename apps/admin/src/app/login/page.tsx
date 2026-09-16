"use client"

import { Suspense, useReducer, useState } from "react"
import { useSearchParams } from "next/navigation"
import { KeyRound, ShieldCheck } from "lucide-react"
import { ProductMark } from "@/components/shell/TopBar"
import { buttonPrimary, buttonSecondary, inputClass } from "@/components/blocks/buttons"
import adminApi, { ADMIN_SESSION_ROUTES, withBasePath } from "@/lib/admin/api"
import { safeNextPath } from "@/lib/admin/cookies"
import { isCompleteOtp, normaliseOtp } from "@/lib/admin/stepUp"
import { describeSignInError, initialSignInState, readPendingToken, signInReducer } from "@/lib/admin/signIn"

/**
 * Sign-in on the console's own host: password, then a code from the admin's
 * authenticator app. Both steps go to auth-service's admin-session routes,
 * which set the host-only admin_* cookies only after the code is accepted.
 * AdminShell renders this page without the console chrome.
 */
function SignInForm() {
  const params = useSearchParams()
  const next = safeNextPath(params.get("next"))
  const [state, dispatch] = useReducer(signInReducer, initialSignInState)
  const [identifier, setIdentifier] = useState("")
  const [password, setPassword] = useState("")
  const [otp, setOtp] = useState("")

  const submitCredentials = async (event: React.FormEvent) => {
    event.preventDefault()
    if (state.step !== "credentials" || state.busy || !identifier.trim() || !password) return
    dispatch({ type: "submit-credentials" })
    try {
      const response = await adminApi.post(ADMIN_SESSION_ROUTES.login, { identifier: identifier.trim(), password })
      const pendingToken = readPendingToken(response.data)
      if (!pendingToken) {
        dispatch({ type: "credentials-refused", error: describeSignInError({ status: 500, data: null }) })
        return
      }
      setPassword("")
      setOtp("")
      dispatch({ type: "credentials-accepted", pendingToken })
    } catch (err) {
      dispatch({ type: "credentials-refused", error: describeSignInError(err) })
    }
  }

  const submitOtp = async (event: React.FormEvent) => {
    event.preventDefault()
    if (state.step !== "otp" || state.busy || !isCompleteOtp(otp)) return
    dispatch({ type: "submit-otp" })
    try {
      await adminApi.post(ADMIN_SESSION_ROUTES.verify2fa, { pending_token: state.pendingToken, code: otp })
      dispatch({ type: "otp-accepted" })
      // A full navigation: the console starts from a clean query cache with the
      // new session, rather than a cached "signed out" answer.
      window.location.assign(withBasePath(next))
    } catch (err) {
      setOtp("")
      dispatch({ type: "otp-refused", error: describeSignInError(err) })
    }
  }

  const error = state.step === "done" ? null : state.error

  return (
    <main className="mx-auto w-full max-w-md px-4 py-16">
      <h1 className="font-mo-display text-2xl font-semibold text-mo-ink">Sign in to the admin console</h1>

      {state.step === "credentials" ? (
        <form onSubmit={submitCredentials} className="mt-6 space-y-4" aria-label="Admin sign-in">
          <p className="text-sm text-mo-body">
            Use your admin account. You will then be asked for a code from your authenticator app.
          </p>
          <div>
            <label className="block text-sm font-semibold text-mo-ink" htmlFor="admin-identifier">
              Email or phone
            </label>
            <input
              id="admin-identifier"
              name="identifier"
              className={inputClass}
              autoComplete="username"
              autoFocus
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "sign-in-error" : undefined}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-mo-ink" htmlFor="admin-password">
              Password
            </label>
            <input
              id="admin-password"
              name="password"
              type="password"
              className={inputClass}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "sign-in-error" : undefined}
            />
          </div>
          {error ? (
            <p id="sign-in-error" role="alert" data-error-kind={error.kind} className="text-sm text-mo-bad">
              {error.message}
            </p>
          ) : null}
          <button type="submit" className={`${buttonPrimary} w-full justify-center`} disabled={state.busy || !identifier.trim() || !password}>
            <KeyRound className="h-4 w-4" aria-hidden="true" />
            {state.busy ? "Checking…" : "Continue"}
          </button>
        </form>
      ) : state.step === "otp" ? (
        <form onSubmit={submitOtp} className="mt-6 space-y-4" aria-label="Two-factor code">
          <p className="text-sm text-mo-body">Enter the 6-digit code from your authenticator app.</p>
          <div>
            <label className="block text-sm font-semibold text-mo-ink" htmlFor="admin-otp">
              6-digit code
            </label>
            <input
              id="admin-otp"
              name="otp"
              className={`${inputClass} font-mo-mono tracking-[0.4em]`}
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(normaliseOtp(e.target.value))}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "sign-in-error" : undefined}
            />
          </div>
          {error ? (
            <p id="sign-in-error" role="alert" data-error-kind={error.kind} className="text-sm text-mo-bad">
              {error.message}
            </p>
          ) : null}
          <div className="flex gap-2">
            <button
              type="button"
              className={buttonSecondary}
              onClick={() => {
                setOtp("")
                dispatch({ type: "start-over" })
              }}
              disabled={state.busy}
            >
              Back
            </button>
            <button type="submit" className={`${buttonPrimary} flex-1 justify-center`} disabled={state.busy || !isCompleteOtp(otp)}>
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              {state.busy ? "Verifying…" : "Verify and sign in"}
            </button>
          </div>
        </form>
      ) : (
        <p role="status" className="mt-6 text-sm text-mo-body">
          Signed in. Opening the console…
        </p>
      )}
    </main>
  )
}

export default function AdminLogin() {
  return (
    <div className="min-h-screen">
      <div className="border-b border-mo px-4 py-3">
        <ProductMark />
      </div>
      <Suspense fallback={null}>
        <SignInForm />
      </Suspense>
    </div>
  )
}
