/**
 * What makes a channel name and a handle legal, before the server is asked.
 *
 * Pure, and split out of ./ChannelGate.tsx for the reason every other rule in
 * this zone is split out of its component: it can then be asserted as a table
 * without a browser, an axios instance or a session.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE SHAPE IS CHECKED HERE BECAUSE THE SERVER'S ANSWER IS AMBIGUOUS.
 *
 * `GET /v1/channels/handle-available` answers `available: false` for an
 * ILLEGAL handle as well as for a taken one. Verified: `definitely-free-9931`
 * comes back false with `suggestion: "definitely.free.9931"` — not because
 * anybody holds it, but because a hyphen is not a legal character.
 *
 * A form that asked the server first and reported its verdict verbatim would
 * therefore tell somebody "that handle is taken" about a handle nobody has
 * ever had, and they would go and pick a different one for no reason. So:
 * shape here, availability there, and the availability call is only made for
 * a handle that is already legal.
 *
 * Two other things about that endpoint, both surprising and both verified:
 *   · it needs a SESSION — 401 UNAUTHORIZED "Invalid user ID" with no cookie;
 *   · it answers `available: true` for YOUR OWN handle. Coherent (it is
 *     available to you) but it means the endpoint cannot answer "does this
 *     channel exist".
 */

/** name 3–40 characters. */
export const CHANNEL_NAME_MIN = 3
export const CHANNEL_NAME_MAX = 40

/** handle 3–30, matching `^[a-z0-9][a-z0-9_.]*[a-z0-9]$`. */
export const CHANNEL_HANDLE_MIN = 3
export const CHANNEL_HANDLE_MAX = 30
export const CHANNEL_HANDLE_PATTERN = /^[a-z0-9][a-z0-9_.]*[a-z0-9]$/

/** about 200 max. */
export const CHANNEL_ABOUT_MAX = 200

/**
 * Why this handle cannot be used, or null.
 *
 * Each refusal names the actual rule rather than restating the regex. "Letters,
 * numbers, dots and underscores only, starting and ending with a letter or
 * number" is the pattern in words; showing the pattern itself would be
 * accurate and useless.
 *
 * The order matters: length before shape, so somebody who has typed two
 * characters is told they need three rather than being told their handle is
 * malformed while they are still typing it.
 */
export function handleShapeError(handle: string): string | null {
  if (handle.length === 0) return "Pick a handle."
  if (handle.length < CHANNEL_HANDLE_MIN) {
    return `A handle is at least ${CHANNEL_HANDLE_MIN} characters.`
  }
  if (handle.length > CHANNEL_HANDLE_MAX) {
    return `A handle is at most ${CHANNEL_HANDLE_MAX} characters.`
  }
  // Called out separately from the pattern, because "a handle is lowercase" is
  // something somebody can act on and "does not match the pattern" is not.
  // The field lowercases as it is typed anyway; this is the backstop for a
  // paste.
  if (handle !== handle.toLowerCase()) return "A handle is lowercase."
  if (!CHANNEL_HANDLE_PATTERN.test(handle)) {
    return "Letters, numbers, dots and underscores only, starting and ending with a letter or number."
  }
  return null
}

/** Why this channel name cannot be used, or null. */
export function nameShapeError(name: string): string | null {
  const trimmed = name.trim()
  if (trimmed.length === 0) return "Pick a channel name."
  if (trimmed.length < CHANNEL_NAME_MIN) {
    return `A channel name is at least ${CHANNEL_NAME_MIN} characters.`
  }
  if (trimmed.length > CHANNEL_NAME_MAX) {
    return `A channel name is at most ${CHANNEL_NAME_MAX} characters.`
  }
  return null
}

/**
 * The note under the handle field, as one function.
 *
 * It exists so that the four states — malformed, checking, taken, free — are
 * decided in one place instead of as a nested ternary in JSX. The
 * suggestion is only offered when it DIFFERS from what was typed: the server
 * echoes the input back as its own suggestion when the handle is fine, and
 * "Taken. yourhandle is free." is a sentence that reads as a bug.
 */
export type HandleNote =
  | { tone: "bad"; text: string }
  | { tone: "muted"; text: string }
  | { tone: "good"; text: string }
  | null

export function handleNote(input: {
  handle: string
  checking: boolean
  available: boolean | null
  suggestion?: string
}): HandleNote {
  if (input.handle.length === 0) return null

  const shape = handleShapeError(input.handle)
  if (shape) return { tone: "bad", text: shape }

  if (input.checking) return { tone: "muted", text: "Checking…" }
  if (input.available === null) return null
  if (input.available) return { tone: "good", text: "Available." }

  if (input.suggestion && input.suggestion !== input.handle) {
    return { tone: "bad", text: `Taken. ${input.suggestion} is free.` }
  }
  return { tone: "bad", text: "That handle is already taken. Try another." }
}
