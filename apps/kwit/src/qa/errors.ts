/**
 * The Know It failures a screen renders distinctly — the web twin of Android's
 * QaCall.kt `QaError.from`. Branch on `kind` and `code`, never on a message.
 */

export type AskErrorKind =
  | "notAvailable"
  | "signInRequired"
  | "forbidden"
  | "cannotVoteOwn"
  | "notFound"
  | "network"
  | "other"

export interface AskError {
  kind: AskErrorKind
  status: number | null
  code: string | null
  message: string | null
}

export const CODE_CANNOT_VOTE_OWN = "CANNOT_VOTE_OWN"
export const CODE_NOT_SELF = "NOT_SELF"
export const CODE_NOT_MODERATOR = "NOT_MODERATOR"
export const CODE_MODERATION_DISABLED = "MODERATION_DISABLED"
export const CODE_INVALID_REQUEST = "INVALID_REQUEST"

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

/**
 * Maps an HTTP status and the parsed error body onto an AskError. Pure.
 *
 * The gateway's dormant-product gate answers every `/v1/qa` path with a 404
 * that qa-service did not write: `{"error":{"code":"NOT_FOUND",...}}` with no
 * `meta`. Every qa-service response carries `meta`. So a 404 with no error
 * body, or with no `meta`, is "Know It isn't available" — a calm state, not an
 * error — and a 404 WITH `meta` is an ordinary missing row.
 */
export function classifyResponse(status: number, body: unknown): AskError {
  const envelope = isObject(body) ? body : null
  const errorBody = envelope && isObject(envelope.error) ? envelope.error : null
  const code = errorBody && typeof errorBody.code === "string" && errorBody.code !== "" ? errorBody.code : null
  const message = errorBody && typeof errorBody.message === "string" ? errorBody.message : null
  const hasMeta = envelope !== null && envelope.meta !== undefined && envelope.meta !== null

  const make = (kind: AskErrorKind): AskError => ({ kind, status, code, message })

  if (status === 401) return make("signInRequired")
  if (status === 404 && (code === null || !hasMeta)) return make("notAvailable")
  if (status === 404) return make("notFound")
  if (status === 403) return make("forbidden")
  if (code === CODE_CANNOT_VOTE_OWN) return make("cannotVoteOwn")
  return make("other")
}

/**
 * Classifies whatever a call threw: an axios error with a response, one
 * without (the request never got an answer), or anything else.
 */
export function classifyError(error: unknown): AskError {
  if (isObject(error)) {
    const response = error.response
    if (isObject(response) && typeof response.status === "number") {
      return classifyResponse(response.status, response.data)
    }
    if (error.isAxiosError === true || "request" in error) {
      return { kind: "network", status: null, code: null, message: null }
    }
  }
  return { kind: "other", status: null, code: null, message: null }
}

/** True when the whole product is dark for this reader. */
export function isNotAvailable(error: unknown): boolean {
  return error != null && classifyError(error).kind === "notAvailable"
}

/** The sentence for a failure. Mirrors QaCopy.forError; never surfaces a server code. */
export function errorMessage(error: unknown): string {
  const e = classifyError(error)
  switch (e.kind) {
    case "notAvailable":
      return "Know It isn't available yet."
    case "signInRequired":
      return "Sign in to do that."
    case "notFound":
      return "That is not here any more."
    case "network":
      return "You look offline. Check your connection and try again."
    case "cannotVoteOwn":
      return "You cannot vote on your own post."
    case "forbidden":
      if (e.code === CODE_NOT_SELF) return "That is only visible to its owner."
      if (e.code === CODE_NOT_MODERATOR || e.code === CODE_MODERATION_DISABLED) {
        return "You do not have permission for that."
      }
      return e.message?.trim() ? capitalise(e.message) : "You do not have permission for that."
    case "other":
      if (e.status !== null && e.status >= 500) return "Something went wrong. Try again."
      if (e.code === null) return "Something went wrong. Try again."
      return e.message?.trim() ? capitalise(e.message) : "That did not go through."
  }
}

function capitalise(message: string): string {
  const trimmed = message.trim()
  const sentence = trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`
}
