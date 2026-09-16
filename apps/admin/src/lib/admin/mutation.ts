/**
 * How every console write is sent: the step-up retry and the two-person
 * approval answer, as plain functions so the rules can be tested without a
 * browser.
 *
 *   403 STEP_UP_REQUIRED  ask for a fresh 2FA code, then send the SAME request
 *                         once more. Never a second retry: if the server still
 *                         wants a step-up after a successful one, looping would
 *                         only burn codes against the rate limit.
 *   403 anything else     not a step-up problem; surfaced as the error it is.
 *   202 {approval}        the action did not happen yet. It is waiting for a
 *                         second approver, and the caller must say so rather
 *                         than report success.
 */

export const STEP_UP_REQUIRED = "STEP_UP_REQUIRED"
export const MFA_REQUIRED = "MFA_REQUIRED"

export interface ApiErrorInfo {
  status: number | null
  code: string | null
  message: string | null
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/**
 * Reads an axios-shaped error (`err.response.{status,data}`) or a bare
 * `{status, data}` without importing axios. The body is `{error: {code,
 * message}}` from the Go services, with `{code, message}` accepted as well.
 */
export function readApiError(err: unknown): ApiErrorInfo {
  const response = isRecord(err) && isRecord(err.response) ? err.response : isRecord(err) ? err : null
  const status = response && typeof response.status === "number" ? response.status : null
  const data = response && isRecord(response.data) ? response.data : null
  const body = data && isRecord(data.error) ? data.error : data
  const code = body && typeof body.code === "string" ? body.code : null
  const message = body && typeof body.message === "string" ? body.message : null
  return { status, code, message }
}

const ADMIN_ERROR_MESSAGES: Record<string, string> = {
  MFA_REQUIRED: "This session has not been verified with two-factor authentication.",
  STEP_UP_REQUIRED: "This action needs a fresh 2FA code.",
  PERMISSIONS_UNAVAILABLE: "Your permissions could not be checked just now, so nothing was done. Try again shortly.",
  ACTOR_REQUIRED: "Your session could not be identified. Sign in again.",
  RETIRED_USE_APP_ROUTES: "This console screen uses a retired route. Reload the page to pick up the current version.",
  SELF_APPROVAL_FORBIDDEN: "You raised this request, so a different admin has to decide it.",
  PAYLOAD_HASH_MISMATCH: "The request changed after it was raised, so it cannot be approved as it stands.",
  REASON_REQUIRED: "A reason is required.",
}

/** A sentence for an admin error: known codes first, then the server's message. */
export function adminErrorMessage(err: unknown, fallback = "The server did not say why."): string {
  const { status, code, message } = readApiError(err)
  if (code && ADMIN_ERROR_MESSAGES[code]) return ADMIN_ERROR_MESSAGES[code]
  if (status === 410) return "This request has expired."
  return message ?? fallback
}

export function isStepUpRequired(err: unknown): boolean {
  const { status, code } = readApiError(err)
  return status === 403 && code === STEP_UP_REQUIRED
}

export function isMfaRequired(err: unknown): boolean {
  const { status, code } = readApiError(err)
  return status === 403 && code === MFA_REQUIRED
}

export interface PendingApproval {
  id: string
  status: string
  [key: string]: unknown
}

/** A 202 whose body names an approval; anything else is not one. */
export function readApproval(status: number, data: unknown): PendingApproval | null {
  if (status !== 202) return null
  const body = isRecord(data) && isRecord(data.data) ? data.data : data
  if (!isRecord(body) || !isRecord(body.approval)) return null
  const approval = body.approval
  if (typeof approval.id !== "string" || !approval.id) return null
  return { ...approval, id: approval.id, status: typeof approval.status === "string" ? approval.status : "pending" }
}

export interface SentResponse {
  status: number
  data: unknown
}

export type MutationOutcome =
  | { kind: "done"; status: number; data: unknown }
  | { kind: "approval"; approval: PendingApproval }
  | { kind: "cancelled" }

/**
 * @param send     performs the request; rejects with an axios-shaped error
 * @param stepUp   asks the admin for a code and verifies it; resolves true
 *                 once the session holds a fresh step-up, false if dismissed
 */
export async function runAdminMutation(
  send: () => Promise<SentResponse>,
  stepUp: () => Promise<boolean>,
): Promise<MutationOutcome> {
  let response: SentResponse
  try {
    response = await send()
  } catch (err) {
    if (!isStepUpRequired(err)) throw err
    const verified = await stepUp()
    if (!verified) return { kind: "cancelled" }
    // Exactly one retry. A second STEP_UP_REQUIRED rejects from here.
    response = await send()
  }
  const approval = readApproval(response.status, response.data)
  if (approval) return { kind: "approval", approval }
  return { kind: "done", status: response.status, data: response.data }
}
