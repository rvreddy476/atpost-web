// Turning a refused auth request into something a person can act on.
//
// The gateway's error envelope is `{ error: { code, message, details } }`, and
// for a validation failure `details.fields` names what it disliked — the same
// shape apps/commerce/src/lib/listing.ts already reads for the listing form.
// Registration has six fields and five ways to be refused, so collapsing all
// of that into one banner sentence throws away the only part that tells
// someone which box to go and fix.

export interface AuthFailure {
  /** The line above the submit button. Never empty. */
  message: string
  /** Wire field name (`email`, `dob`, `terms_version`, …) → the server's complaint. */
  fields: Record<string, string>
}

interface ApiErrorShape {
  response?: {
    status?: number
    data?: {
      error?: {
        code?: unknown
        message?: unknown
        details?: unknown
      }
    }
  }
  message?: unknown
}

const str = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

/**
 * `details.fields` has shipped in two spellings and there is no reason to lose
 * a message over which one arrived:
 *
 *   [{ code: "dob", reason: "…" }]     the listing routes' shape
 *   { dob: "…" }                        a plain map
 *
 * Anything else yields nothing rather than guessing.
 */
function readFields(details: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (!details || typeof details !== 'object') return out

  const source = (details as Record<string, unknown>).fields ?? details

  if (Array.isArray(source)) {
    for (const entry of source) {
      if (!entry || typeof entry !== 'object') continue
      const row = entry as Record<string, unknown>
      const name = str(row.code) || str(row.field) || str(row.name)
      const reason = str(row.reason) || str(row.message)
      if (name && reason) out[name] = reason
    }
    return out
  }

  if (typeof source === 'object') {
    for (const [name, reason] of Object.entries(source as Record<string, unknown>)) {
      const text = str(reason)
      if (name && text) out[name] = text
    }
  }
  return out
}

/**
 * Read a rejected auth call.
 *
 * Two things it deliberately does not do. It does not surface an axios
 * internal ("Request failed with status code 422") as the banner — that names
 * the transport, not the problem. And when the server itemised the fields but
 * gave no summary, the banner says only that something needs fixing, because
 * the real answer is already sitting under the inputs.
 */
export function readAuthFailure(cause: unknown, fallback: string): AuthFailure {
  const err = cause as ApiErrorShape
  const response = err?.response

  // No response at all: the request never got an answer. Saying "authentication
  // failed" here would be a lie about the credentials.
  if (!response) {
    return {
      message: 'We could not reach the sign-in service. Check your connection and try again.',
      fields: {},
    }
  }

  const error = response.data?.error
  const fields = readFields(error?.details)
  const serverMessage = str(error?.message)

  if (serverMessage) return { message: serverMessage, fields }
  if (Object.keys(fields).length > 0) {
    return { message: 'Some of these details need fixing.', fields }
  }

  if (response.status === 429) {
    return { message: 'Too many attempts. Wait a moment and try again.', fields }
  }
  if (typeof response.status === 'number' && response.status >= 500) {
    return { message: 'The sign-in service is having trouble. Try again in a moment.', fields }
  }

  return { message: fallback, fields }
}

/**
 * First complaint among the wire names given, or undefined.
 *
 * Aliases exist because a field on the wire is not always a box on screen:
 * `terms_version` is refused by the server but only the checkbox is visible,
 * so the checkbox is where that message has to land.
 */
export function fieldError(
  failure: AuthFailure | null,
  ...names: string[]
): string | undefined {
  if (!failure) return undefined
  for (const name of names) {
    if (failure.fields[name]) return failure.fields[name]
  }
  return undefined
}
