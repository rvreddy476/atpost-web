/** auth-service's step-up window, for display only; the server decides. */
export const STEP_UP_WINDOW_SECONDS = 300

/** Whole seconds left in the window, never negative; 0 when none is open. */
export function stepUpSecondsLeft(validUntil: number | null, now: number): number {
  if (validUntil === null) return 0
  return Math.max(0, Math.ceil((validUntil - now) / 1000))
}

/** 299 → "4:59". */
export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

/** A TOTP code as typed: digits only, six of them. */
export function normaliseOtp(input: string): string {
  return input.replace(/\D/g, "").slice(0, 6)
}

export const isCompleteOtp = (otp: string) => /^\d{6}$/.test(otp)

/** Reads `step_up_valid_until` from the step-up response (bare or enveloped). */
export function readStepUpValidUntil(raw: unknown): number | null {
  const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null
  const body = record(raw) && record(raw.data) ? raw.data : raw
  if (!record(body)) return null
  const value = body.step_up_valid_until
  if (typeof value === "number" && Number.isFinite(value)) return value < 1e11 ? value * 1000 : value
  if (typeof value === "string") {
    const ms = Date.parse(value)
    return Number.isNaN(ms) ? null : ms
  }
  return null
}

const STEP_UP_ERRORS: Record<string, string> = {
  INVALID_OTP: "That code is not right, or it has expired. Try the current one.",
  OTP_REPLAYED: "That code was already used. Wait for the next one.",
  MFA_NOT_ENROLLED: "Your account has no authenticator enrolled.",
  RATE_LIMITED: "Too many attempts. Wait a few minutes and try again.",
  SESSION_REVOKED: "Your session has ended. Sign in again.",
}

export function stepUpErrorMessage(code: string | null): string {
  return (code && STEP_UP_ERRORS[code]) || "The code could not be checked. Try again."
}
