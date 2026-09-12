/**
 * The settings page's rules, with no React and no network in them.
 *
 * Three things a settings page gets wrong quietly: it reads a preference row
 * that is missing a key and draws the switch in whichever position
 * `undefined` coerces to; it writes a whole row back when one switch moved
 * and clobbers a key another surface changed a minute ago; and it refuses a
 * handle the server would have taken because its rules and the studio's
 * drifted apart. Each is a pure function here, and ./settings.test.ts is the
 * table.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * NOTIFICATION PREFERENCES, AS AGREED 2026-09-12
 *
 *   GET /v1/notifications/preferences/detailed
 *       → a FLAT row: {push_enabled, push_new_videos, inapp_new_videos,
 *                      quiet hours, and every other kind the product has}
 *   PUT /v1/notifications/preferences/detailed  {partial}
 *       → keys absent from the body are left untouched
 *
 * This page draws three of the row's keys and sends back ONE at a time. The
 * partial PUT is the whole reason that is safe: a body of `{push_new_videos:
 * false}` moves that switch and nothing else, and a body that echoed the
 * row would carry a stale copy of every key the page does not draw.
 */

import {
  CHANNEL_ABOUT_MAX,
  handleShapeError,
  nameShapeError,
} from "@/studio/channelForm"

/* ── Notifications ────────────────────────────────────────────────────────── */

export interface NotificationPrefs {
  /** The master switch. When off, the two below are drawn disabled. */
  pushEnabled: boolean
  pushNewVideos: boolean
  inappNewVideos: boolean
}

/** The wire name for each switch. The one place the two vocabularies meet. */
export const PREF_KEYS = {
  pushEnabled: "push_enabled",
  pushNewVideos: "push_new_videos",
  inappNewVideos: "inapp_new_videos",
} as const

export type PrefKey = keyof typeof PREF_KEYS

/**
 * The three switches, off a detailed row.
 *
 * ── A missing key is ON, and that is a decision ───────────────────────────
 * The contract says the row is flat and complete, so absence is a row from
 * before a column existed or a payload that does not match. Either way the
 * page has to draw something. On this platform notifications default to on:
 * Subscribe turns them on in the same press (see ../subscriptions/
 * TubeSubscriptions.tsx), so "never turned off" is the likelier truth of an
 * absent key than "off". And a wrong ON draws an enabled switch somebody can
 * correct; a wrong OFF on `push_enabled` would grey out both switches with a
 * sentence blaming a master switch that is not really off. Only an explicit
 * `false` is off.
 */
export function parseDetailedPrefs(raw: unknown): NotificationPrefs {
  const row = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const on = (key: string) => row[key] !== false
  return {
    pushEnabled: on(PREF_KEYS.pushEnabled),
    pushNewVideos: on(PREF_KEYS.pushNewVideos),
    inappNewVideos: on(PREF_KEYS.inappNewVideos),
  }
}

/**
 * The PUT body for one moved switch: that key, and only that key.
 *
 * Typed as a one-key record rather than `Partial<row>` so a caller cannot
 * build up a body with two changes in it by accident. Two switches moved in
 * quick succession are two PUTs, each of which can be rolled back alone.
 */
export function prefsPutBody(key: PrefKey, value: boolean): Record<string, boolean> {
  return { [PREF_KEYS[key]]: value }
}

/* ── The channel form ─────────────────────────────────────────────────────── */

export interface ChannelForm {
  name: string
  handle: string
  about: string
}

export interface ChannelFormErrors {
  name?: string
  handle?: string
  about?: string
}

/**
 * Why this form cannot be saved, per field, or null when it can.
 *
 * The rules are ../studio/channelForm.ts's, imported and not restated: the
 * studio creates a channel and this page edits one, and `PATCH /v1/channels/
 * me` binds the same limits `POST /v1/channels` does. A second copy of
 * "3 to 30, lowercase, letters digits dots underscores" here is how the edit
 * form refuses a handle the create form accepted, or the other way round.
 *
 * `about` has a maximum and no minimum: empty is a channel with nothing to
 * say about itself, which is allowed.
 */
export function channelFormErrors(form: ChannelForm): ChannelFormErrors | null {
  const errors: ChannelFormErrors = {}
  const name = nameShapeError(form.name)
  if (name) errors.name = name
  const handle = handleShapeError(form.handle)
  if (handle) errors.handle = handle
  if (form.about.length > CHANNEL_ABOUT_MAX) {
    errors.about = `About is at most ${CHANNEL_ABOUT_MAX} characters.`
  }
  return Object.keys(errors).length > 0 ? errors : null
}

/**
 * The PATCH body: the fields that differ from what the server has, or null
 * when nothing does.
 *
 * Only the changed fields, for the same reason the notifications PUT sends
 * one key. The handle in particular: a PATCH that re-sent an unchanged
 * handle would ask the server to re-check a handle this account already
 * holds, and whether that answers 200 or 409 HANDLE_TAKEN is a server
 * detail this page should not have to know. Null means "do not call".
 */
export function channelPatchBody(
  current: ChannelForm,
  form: ChannelForm
): Partial<ChannelForm> | null {
  const next: ChannelForm = {
    name: form.name.trim(),
    handle: form.handle.trim().toLowerCase(),
    about: form.about.trim(),
  }
  const body: Partial<ChannelForm> = {}
  if (next.name !== current.name) body.name = next.name
  if (next.handle !== current.handle) body.handle = next.handle
  if (next.about !== current.about) body.about = next.about
  return Object.keys(body).length > 0 ? body : null
}

/**
 * Why the save failed, in a sentence.
 *
 * The two codes the contract names are the two a person can act on from
 * this form: a 409 is somebody else's handle, a 400 is a field the server
 * would not take (which the local rules should have caught first, so the
 * server's own message is shown rather than a guess at which field).
 */
export function channelSaveMessage(failure: {
  status: number | null
  code: string | null
  message: string | null
}): string {
  if (failure.code === "HANDLE_TAKEN" || failure.status === 409) {
    return "That handle is already taken. Try another."
  }
  if (failure.status === 400) {
    return failure.message || "The server would not accept one of these fields."
  }
  if (failure.status === 401) return "Your session ended. Sign in again to save."
  if (failure.status === 404) {
    return "This account has no channel to edit. Create one from the upload page."
  }
  return failure.message || "Your channel could not be saved."
}
