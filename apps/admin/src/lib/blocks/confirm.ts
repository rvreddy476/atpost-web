/** A destructive action needs a written reason; admin-service records it. */
export const MIN_REASON_LENGTH = 10
export const MAX_REASON_LENGTH = 500

export interface ReasonCheck {
  ok: boolean
  message: string | null
}

export function checkReason(
  reason: string,
  { destructive, required, max = MAX_REASON_LENGTH }: { destructive: boolean; required?: boolean; max?: number },
): ReasonCheck {
  const text = reason.trim()
  if (text.length > max) {
    return { ok: false, message: `Keep the reason under ${max} characters.` }
  }
  if (!destructive && !required) return { ok: true, message: null }
  if (text.length === 0) return { ok: false, message: "A reason is required for this action." }
  if (text.length < MIN_REASON_LENGTH) {
    return { ok: false, message: `Write at least ${MIN_REASON_LENGTH} characters so the audit trail says why.` }
  }
  return { ok: true, message: null }
}
