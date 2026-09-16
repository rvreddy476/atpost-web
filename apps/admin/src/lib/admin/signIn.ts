import { readApiError } from "./mutation"

/**
 * The console's sign-in, as a pure state machine the page drives.
 *
 *   credentials ──submit──▶ credentials(busy) ──accepted──▶ otp
 *        ▲                        │ refused (wrong password, not an admin,
 *        │                        ▼          2FA not enrolled, rate limited…)
 *        │                  credentials + error
 *        │
 *   otp ──submit──▶ otp(busy) ──accepted──▶ done
 *                        │ refused: wrong / reused code, rate limited → otp + error
 *                        │ refused: sign-in expired, access gone      → credentials + error
 *
 * The server (auth-service /v1/auth/admin-session/*) decides everything; this
 * only turns its answers into the next screen and a sentence.
 */

export type SignInErrorKind =
  | "credentials"
  | "not-admin"
  | "not-enrolled"
  | "inactive"
  | "rate-limited"
  | "otp"
  | "expired"
  | "unavailable"

export interface SignInError {
  kind: SignInErrorKind
  code: string | null
  message: string
}

export type SignInState =
  | { step: "credentials"; busy: boolean; error: SignInError | null }
  | { step: "otp"; busy: boolean; pendingToken: string; error: SignInError | null }
  | { step: "done" }

export type SignInEvent =
  | { type: "submit-credentials" }
  | { type: "credentials-accepted"; pendingToken: string }
  | { type: "credentials-refused"; error: SignInError }
  | { type: "submit-otp" }
  | { type: "otp-accepted" }
  | { type: "otp-refused"; error: SignInError }
  | { type: "start-over" }

export const initialSignInState: SignInState = { step: "credentials", busy: false, error: null }

/** Refusals on the code step that send the admin back to the password. */
const RESTART_KINDS = new Set<SignInErrorKind>(["expired", "not-admin", "not-enrolled", "inactive"])

export function signInReducer(state: SignInState, event: SignInEvent): SignInState {
  switch (event.type) {
    case "submit-credentials":
      return state.step === "credentials" && !state.busy ? { step: "credentials", busy: true, error: null } : state
    case "credentials-accepted":
      return state.step === "credentials" && state.busy && event.pendingToken
        ? { step: "otp", busy: false, pendingToken: event.pendingToken, error: null }
        : state
    case "credentials-refused":
      return state.step === "credentials" ? { step: "credentials", busy: false, error: event.error } : state
    case "submit-otp":
      return state.step === "otp" && !state.busy ? { ...state, busy: true, error: null } : state
    case "otp-accepted":
      return state.step === "otp" && state.busy ? { step: "done" } : state
    case "otp-refused":
      if (state.step !== "otp") return state
      return RESTART_KINDS.has(event.error.kind)
        ? { step: "credentials", busy: false, error: event.error }
        : { ...state, busy: false, error: event.error }
    case "start-over":
      return initialSignInState
  }
}

const MESSAGES: Record<string, { kind: SignInErrorKind; message: string }> = {
  AUTH_FAILED: { kind: "credentials", message: "That email, phone or password is not right." },
  INVALID_REQUEST: { kind: "credentials", message: "Enter your email or phone and your password." },
  NOT_ADMIN: {
    kind: "not-admin",
    message: "This account does not have admin access. A platform admin has to grant you a role first.",
  },
  MFA_NOT_ENROLLED: {
    kind: "not-enrolled",
    message:
      "Admin accounts must use an authenticator app, and this account has none enrolled. Enrol one in your account security settings, then sign in here.",
  },
  ACCOUNT_NOT_ACTIVE: { kind: "inactive", message: "This account is not active, so it cannot sign in to the console." },
  RATE_LIMITED: { kind: "rate-limited", message: "Too many attempts. Wait a few minutes, then try again." },
  INVALID_OTP: { kind: "otp", message: "That code is not right, or it has expired. Enter the current one." },
  OTP_REPLAYED: { kind: "otp", message: "That code was already used. Wait for the next one." },
  ADMIN_SIGN_IN_EXPIRED: { kind: "expired", message: "This sign-in took too long. Enter your password again." },
  ADMIN_ACCESS_ENDED: { kind: "not-admin", message: "Admin access has ended for this account." },
  PERMISSIONS_UNAVAILABLE: {
    kind: "unavailable",
    message: "Your admin access could not be checked just now. Try again shortly.",
  },
}

/** Turns a failed sign-in request (axios error or bare body) into a SignInError. */
export function describeSignInError(err: unknown): SignInError {
  const { status, code } = readApiError(err)
  if (code && MESSAGES[code]) return { code, ...MESSAGES[code] }
  if (status === 429) return { code: "RATE_LIMITED", ...MESSAGES.RATE_LIMITED }
  if (status === 401) return { code, ...MESSAGES.AUTH_FAILED }
  if (status === null) {
    return { kind: "unavailable", code: null, message: "The sign-in service could not be reached. Check your connection and try again." }
  }
  return { kind: "unavailable", code, message: "Sign-in failed. Try again." }
}

/** `pending_token` from the login answer (enveloped or bare); null when absent. */
export function readPendingToken(body: unknown): string | null {
  const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null
  const inner = record(body) && record(body.data) ? body.data : body
  if (!record(inner) || inner.requires_2fa !== true) return null
  return typeof inner.pending_token === "string" && inner.pending_token !== "" ? inner.pending_token : null
}
