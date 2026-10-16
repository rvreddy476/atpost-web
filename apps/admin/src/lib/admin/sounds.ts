import { isRecord, num, str, unwrap, type Row } from "./data"
import { DAY_ONLY, changedFields, dayEnd, istDay, istToday } from "./discounts"
import { hasPermission, type AdminMe } from "./me"
import { adminErrorMessage, readApiError } from "./mutation"

/**
 * Sound library: the curated sounds creators can add to their posts, managed
 * through admin-service (never media-service directly). The pinned contract:
 *
 *   GET   /v1/admin/sounds/library?status=&q=&genre=&limit=&cursor=   media:sounds.read
 *   GET   /v1/admin/sounds/library/:id                                media:sounds.read
 *   GET   /v1/admin/sounds/library/:id/preview  (307 to a signed URL) media:sounds.read
 *   POST  /v1/admin/sounds/library/uploads      {filename, content_type, size_bytes}
 *                                                → {upload_url, method, headers, storage_key, expires_at}
 *   POST  /v1/admin/sounds/library              {storage_key, title, …}   → 201, a draft
 *   PATCH /v1/admin/sounds/library/:id          any editable field, is_active
 *   POST  /v1/admin/sounds/library/:id/withdraw {scope: new_uses|everywhere, reason}
 *
 * Every write needs media:sounds.manage and lands in admin.audit_log. A new
 * sound starts as a draft (is_active=false) until an admin enables it.
 */

export const SOUNDS = "/v1/admin/sounds/library"
export const SOUNDS_APP = "media" as const
export const SOUNDS_PAGE_SIZE = 50

/** Actions without the `media:` prefix; hasPermission adds it. */
export const SOUND_PERMISSIONS = { read: "sounds.read", manage: "sounds.manage" } as const

export interface SoundAbilities {
  /** The page, the list, the detail and the preview. */
  page: boolean
  /** Add, edit, enable/disable and withdraw. */
  manage: boolean
}

/** A write is offered only to a holder of media:sounds.manage who can also see the page. */
export function soundAbilities(me: AdminMe): SoundAbilities {
  const page = hasPermission(me, SOUNDS_APP, SOUND_PERMISSIONS.read)
  return { page, manage: page && hasPermission(me, SOUNDS_APP, SOUND_PERMISSIONS.manage) }
}

// ---------------------------------------------------------------------------
// The list
// ---------------------------------------------------------------------------

export type SoundStatusFilter = "all" | "active" | "inactive" | "withdrawn"

export const STATUS_FILTERS: readonly { value: SoundStatusFilter; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive and drafts" },
  { value: "withdrawn", label: "Withdrawn" },
]

export interface SoundListQuery {
  status: SoundStatusFilter
  q: string
  genre: string
  cursor?: string | null
  limit?: number
}

export function soundListUrl({ status, q, genre, cursor, limit = SOUNDS_PAGE_SIZE }: SoundListQuery): string {
  const params = new URLSearchParams()
  params.set("status", status)
  if (q.trim()) params.set("q", q.trim())
  if (genre.trim()) params.set("genre", genre.trim())
  params.set("limit", String(limit))
  if (cursor) params.set("cursor", cursor)
  return `${SOUNDS}?${params.toString()}`
}

export const soundUrl = (id: string) => `${SOUNDS}/${encodeURIComponent(id)}`
export const soundPreviewUrl = (id: string) => `${soundUrl(id)}/preview`

/** `{data: [...], meta: {next_cursor}}`: the rows and the cursor for the next page (null on the last). */
export function readSoundPage(raw: unknown): { rows: Row[]; nextCursor: string | null } {
  const body = unwrap(raw)
  const list = Array.isArray(body) ? body : isRecord(body) && Array.isArray(body.items) ? body.items : []
  const meta = isRecord(raw) && isRecord(raw.meta) ? raw.meta : null
  return { rows: list.filter(isRecord), nextCursor: meta ? str(meta.next_cursor) : null }
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export type SoundStatus = "draft" | "active" | "inactive" | "withdrawn"

export const SOUND_STATUS_CHIPS: Record<SoundStatus, { label: string; tone: "normal" | "good" | "warn" | "bad" }> = {
  draft: { label: "Draft", tone: "normal" },
  active: { label: "Active", tone: "good" },
  inactive: { label: "Inactive", tone: "warn" },
  withdrawn: { label: "Withdrawn", tone: "bad" },
}

const STATUSES = Object.keys(SOUND_STATUS_CHIPS) as SoundStatus[]

/** The server's status; without one, is_active decides (active, or inactive — never a guess at draft). */
export function soundStatus(row: Row): SoundStatus {
  const status = str(row.status)?.toLowerCase()
  if (status && (STATUSES as string[]).includes(status)) return status as SoundStatus
  return row.is_active === true ? "active" : "inactive"
}

export const soundStatusChip = (row: Row) => SOUND_STATUS_CHIPS[soundStatus(row)]

/** Enable for a draft or an inactive sound, Disable for an active one, nothing for a withdrawn one. */
export function toggleFor(row: Row): { label: "Enable" | "Disable"; isActive: boolean } | null {
  switch (soundStatus(row)) {
    case "active":
      return { label: "Disable", isActive: false }
    case "draft":
    case "inactive":
      return { label: "Enable", isActive: true }
    case "withdrawn":
      return null
  }
}

export const canWithdraw = (row: Row) => soundStatus(row) !== "withdrawn"

// ---------------------------------------------------------------------------
// Licence
// ---------------------------------------------------------------------------

export type LicenseType = "licensed" | "royalty_free" | "original" | "public_domain"

export const LICENSE_TYPES: readonly { value: LicenseType; label: string }[] = [
  { value: "licensed", label: "Licensed" },
  { value: "royalty_free", label: "Royalty free" },
  { value: "original", label: "Original" },
  { value: "public_domain", label: "Public domain" },
]

export function licenseTypeLabel(value: unknown): string {
  return LICENSE_TYPES.find((t) => t.value === value)?.label ?? (str(value) ?? "—")
}

/** A licence is flagged this many days before it ends. */
export const LICENSE_WARNING_DAYS = 30
const DAY_MS = 86_400_000

export type LicenseExpiryState = "none" | "ok" | "soon" | "expired"

/**
 * Where a licence stands: no expiry, fine, ending within 30 days, or already
 * ended. `days` is whole days left (0 on the last day), null without an expiry.
 */
export function licenseExpiry(value: unknown, now: number = Date.now()): { state: LicenseExpiryState; days: number | null } {
  const s = str(value)
  if (!s) return { state: "none", days: null }
  const ms = Date.parse(s)
  if (Number.isNaN(ms)) return { state: "none", days: null }
  if (ms <= now) return { state: "expired", days: 0 }
  const days = Math.floor((ms - now) / DAY_MS)
  return { state: ms - now <= LICENSE_WARNING_DAYS * DAY_MS ? "soon" : "ok", days }
}

export function licenseExpiryNote(value: unknown, now: number = Date.now()): string | null {
  const { state, days } = licenseExpiry(value, now)
  if (state === "expired") return "Licence expired"
  if (state === "soon") return days === 0 ? "Licence ends today" : `Licence ends in ${days} day${days === 1 ? "" : "s"}`
  return null
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

/** 95_000 → "1:35"; an unknown duration is an em dash. */
export function formatDuration(ms: unknown): string {
  const value = num(ms)
  if (value === null || value < 0) return "—"
  const seconds = Math.round(value / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
}

export const usageCount = (row: Row) => num(row.usage_count) ?? 0

// ---------------------------------------------------------------------------
// The details form (create and edit)
// ---------------------------------------------------------------------------

export interface SoundFormInput {
  title: string
  artist: string
  genre: string
  mood: string
  license_type: LicenseType | ""
  rights_holder: string
  license_reference: string
  /** YYYY-MM-DD (a date input), blank for no expiry. */
  license_expires_day: string
  attribution: string
}

export const EMPTY_SOUND_FORM: SoundFormInput = {
  title: "",
  artist: "",
  genre: "",
  mood: "",
  license_type: "",
  rights_holder: "",
  license_reference: "",
  license_expires_day: "",
  attribution: "",
}

export const SOUND_TEXT_LIMITS = { title: 200, artist: 200, genre: 60, mood: 60, rights_holder: 200, license_reference: 200, attribution: 500 } as const

/** A stored sound as the edit form's starting values. */
export function soundFormInput(row: Row): SoundFormInput {
  const type = str(row.license_type)
  return {
    title: str(row.title) ?? "",
    artist: str(row.artist) ?? "",
    genre: str(row.genre) ?? "",
    mood: str(row.mood) ?? "",
    license_type: LICENSE_TYPES.some((t) => t.value === type) ? (type as LicenseType) : "",
    rights_holder: str(row.rights_holder) ?? "",
    license_reference: str(row.license_reference) ?? "",
    license_expires_day: istDay(row.license_expires_at),
    attribution: str(row.attribution) ?? "",
  }
}

const LABELS: Record<keyof typeof SOUND_TEXT_LIMITS, string> = {
  title: "Title",
  artist: "Artist",
  genre: "Genre",
  mood: "Mood",
  rights_holder: "Rights holder",
  license_reference: "Licence reference",
  attribution: "Attribution",
}

export interface SoundFormCheck {
  problems: string[]
  /** The fields as the server takes them; optional blanks are null. */
  fields: {
    title: string
    artist: string
    genre: string
    mood: string | null
    license_type: LicenseType | null
    rights_holder: string
    license_reference: string | null
    license_expires_at: string | null
    attribution: string | null
  }
}

/**
 * Checks the details form. Title, artist, genre, licence type and rights
 * holder are required; the rest are optional. An expiry must be a real date
 * and, when it is being set (`expiryChanged`), not already past — a licence
 * that has ended cannot cover a new sound.
 */
export function checkSoundForm(
  input: SoundFormInput,
  { today = istToday(), expiryChanged = true }: { today?: string; expiryChanged?: boolean } = {},
): SoundFormCheck {
  const problems: string[] = []
  const t = (v: string) => v.trim()
  for (const key of ["title", "artist", "genre", "rights_holder"] as const) {
    if (!t(input[key])) problems.push(`${LABELS[key]} is required.`)
  }
  if (!input.license_type) problems.push("Choose the licence type.")
  for (const [key, max] of Object.entries(SOUND_TEXT_LIMITS) as [keyof typeof SOUND_TEXT_LIMITS, number][]) {
    if (t(input[key]).length > max) problems.push(`${LABELS[key]} must be ${max} characters or fewer.`)
  }
  const day = t(input.license_expires_day)
  let expiresAt: string | null = null
  if (day) {
    if (!DAY_ONLY.test(day) || Number.isNaN(Date.parse(day))) problems.push("The licence expiry is not a valid date.")
    else {
      if (expiryChanged && day < today) problems.push("The licence expiry has already passed.")
      expiresAt = dayEnd(day)
    }
  }
  const optional = (v: string) => (t(v) ? t(v) : null)
  return {
    problems,
    fields: {
      title: t(input.title),
      artist: t(input.artist),
      genre: t(input.genre),
      mood: optional(input.mood),
      license_type: input.license_type || null,
      rights_holder: t(input.rights_holder),
      license_reference: optional(input.license_reference),
      license_expires_at: expiresAt,
      attribution: optional(input.attribution),
    },
  }
}

/** The create body: the uploaded object's key, the checked fields, and no is_active (a new sound is a draft). */
export function createSoundBody(storageKey: string, fields: SoundFormCheck["fields"]): Record<string, unknown> {
  const body: Record<string, unknown> = { storage_key: storageKey }
  for (const [key, value] of Object.entries(fields)) if (value !== null) body[key] = value
  return body
}

/**
 * The PATCH body for an edit: only what changed. The licence type cannot be
 * changed after creation (it is not in the PATCH contract), and an untouched
 * expiry is left out even when the server stored it at another time of day.
 */
export function editSoundPatch(stored: Row, input: SoundFormInput, { today = istToday() }: { today?: string } = {}): { problems: string[]; patch: Record<string, unknown> } {
  const storedDay = istDay(stored.license_expires_at)
  const expiryChanged = input.license_expires_day.trim() !== storedDay
  const { problems, fields } = checkSoundForm({ ...input, license_type: soundFormInput(stored).license_type || input.license_type }, { today, expiryChanged })
  const next: Record<string, unknown> = {
    title: fields.title,
    artist: fields.artist,
    genre: fields.genre,
    mood: fields.mood,
    rights_holder: fields.rights_holder,
    license_reference: fields.license_reference,
    attribution: fields.attribution,
  }
  const current: Record<string, unknown> = {
    title: str(stored.title),
    artist: str(stored.artist),
    genre: str(stored.genre),
    mood: str(stored.mood),
    rights_holder: str(stored.rights_holder),
    license_reference: str(stored.license_reference),
    attribution: str(stored.attribution),
  }
  const patch = changedFields(next, current)
  if (expiryChanged) patch.license_expires_at = fields.license_expires_at
  return { problems, patch }
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export type WithdrawScope = "new_uses" | "everywhere"

export const WITHDRAW_SCOPES: readonly { value: WithdrawScope; label: string; description: string }[] = [
  {
    value: "new_uses",
    label: "Stop new uses",
    description: "Creators can no longer add it. Posts already using it keep playing it.",
  },
  {
    value: "everywhere",
    label: "Remove from all posts",
    description: "Also silences it on every post that already uses it. This cannot be undone from the console.",
  },
]

export type SoundWrite =
  | { kind: "create"; storageKey: string; fields: SoundFormCheck["fields"] }
  | { kind: "edit"; id: string; patch: Record<string, unknown> }
  | { kind: "toggle"; id: string; isActive: boolean }
  | { kind: "withdraw"; id: string; scope: WithdrawScope; reason: string }

export function soundRequest(write: SoundWrite): { method: "post" | "patch"; url: string; body: Record<string, unknown> } {
  switch (write.kind) {
    case "create":
      return { method: "post", url: SOUNDS, body: createSoundBody(write.storageKey, write.fields) }
    case "edit":
      return { method: "patch", url: soundUrl(write.id), body: write.patch }
    case "toggle":
      return { method: "patch", url: soundUrl(write.id), body: { is_active: write.isActive } }
    case "withdraw":
      return { method: "post", url: `${soundUrl(write.id)}/withdraw`, body: { scope: write.scope, reason: write.reason } }
  }
}

/** The withdraw route takes 3–500 characters; the console's own dialog asks for at least ten. */
export const WITHDRAW_REASON_MAX = 500

const SOUND_ERRORS: Record<string, string> = {
  UPLOAD_MISSING: "The uploaded file was not found in storage. The upload may have expired or failed — upload the file again.",
  NOT_AUDIO: "That file is not audio the platform can play. Choose an MP3, M4A/AAC, WAV or OGG file.",
  TOO_LONG: "The sound is longer than 5 minutes. Trim it to 5 minutes or less and upload it again.",
}

/** A sentence for a sound-library error: the three create refusals first, then the console's usual wording. */
export function soundErrorMessage(err: unknown, fallback?: string): string {
  const { code } = readApiError(err)
  if (code && SOUND_ERRORS[code]) return SOUND_ERRORS[code]
  return adminErrorMessage(err, fallback)
}
