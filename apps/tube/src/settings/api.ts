/**
 * The settings page's network surface: two preference calls and one
 * channel edit. The channel READ is `fetchOwnChannel` in ../tube/channelApi.ts
 * and is not restated, because the rail, the profile menu and this page
 * must agree about what "your channel" is.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CODED AGAINST THE CONTRACT, 2026-09-12, SESSION REQUIRED
 *
 *   GET   /v1/notifications/preferences/detailed  → {data: flat row}
 *   PUT   /v1/notifications/preferences/detailed  {partial} → {data: row}
 *   PATCH /v1/channels/me  {name?, handle?, about?} → {data: channel}
 *         409 HANDLE_TAKEN, 400 on a field the server refuses,
 *         404 NO_CHANNEL when there is nothing to edit
 *
 * The autoplay preference is NOT here. It is localStorage, per viewer, in
 * ../watch/autoplayPreference.ts, and the page says so beside the switch:
 * a preference that lives in this browser and nowhere else should not be
 * drawn in the same row as ones the server keeps without saying which is
 * which.
 */

import api from "@atpost/api-client"
import type { TubeChannel } from "@/tube/channels"
import { parseDetailedPrefs, type NotificationPrefs } from "./settings"

interface Envelope<T> {
  data?: T
  error?: { code?: string; message?: string }
}

const PREFS_PATH = "/v1/notifications/preferences/detailed"

export async function fetchDetailedPrefs(): Promise<NotificationPrefs> {
  const res = await api.get<Envelope<unknown>>(PREFS_PATH)
  return parseDetailedPrefs(res.data?.data)
}

/**
 * One key, from `prefsPutBody`. The server answers the whole row, and it is
 * returned parsed so the caller can reconcile against what was STORED rather
 * than against what was asked for.
 */
export async function updateDetailedPrefs(
  body: Record<string, boolean>
): Promise<NotificationPrefs | null> {
  const res = await api.put<Envelope<unknown>>(PREFS_PATH, body)
  return res.data?.data ? parseDetailedPrefs(res.data.data) : null
}

/**
 * Edit the viewer's own channel. The body is `channelPatchBody`'s, so an
 * unchanged field is never sent. Throws on every failure; the page turns it
 * into a sentence with `channelSaveMessage`.
 */
export async function updateOwnChannel(
  body: Partial<{ name: string; handle: string; about: string }>
): Promise<TubeChannel | null> {
  const res = await api.patch<Envelope<TubeChannel>>("/v1/channels/me", body)
  const row = res.data?.data
  return row && typeof row.user_id === "string" ? row : null
}
