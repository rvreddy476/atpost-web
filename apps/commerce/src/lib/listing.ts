// The listing flow's non-React half: how a server answer becomes something the
// form can show, and where a not-yet-created draft is parked.
//
// Everything here is pure so the awkward parts — a 422 keyed by attribute code,
// a 409 that names the fields it will cost you — can be reasoned about without
// mounting a form.

import type { AttributeValueMap } from "@atpost/types/commerce"

// ── The gateway's error envelope ────────────────────────────────

interface ApiErrorBody {
  error?: {
    code?: string
    message?: string
    details?: Record<string, unknown>
  }
}

interface ApiErrorShape {
  response?: {
    status?: number
    data?: ApiErrorBody
  }
}

function envelope(err: unknown): { status: number; code: string; message: string; details: Record<string, unknown> } {
  const e = err as ApiErrorShape
  const error = e?.response?.data?.error
  return {
    status: e?.response?.status ?? 0,
    code: typeof error?.code === "string" ? error.code : "",
    message: typeof error?.message === "string" ? error.message : "",
    details: (error?.details as Record<string, unknown>) ?? {},
  }
}

/** The one-line message to show when nothing more specific applies. */
export function apiMessage(err: unknown, fallback: string): string {
  return envelope(err).message || fallback
}

/**
 * `422 ATTRIBUTE_VALUES_INVALID` → a map keyed by attribute code, ready for
 * `mergeServerErrors`. Returns null for any other failure so the caller can
 * keep falling through its `catch`.
 *
 * The server's `details.fields` is `[{code, reason}]`; the shape here is the
 * one `@atpost/form` merges, so a rejected attribute's message lands under its
 * own control rather than in a banner the seller has to decode.
 */
export function attributeErrorsFrom(
  err: unknown,
): Record<string, { message: string; code?: string }> | null {
  const { status, code, details } = envelope(err)
  if (status !== 422 || code !== "ATTRIBUTE_VALUES_INVALID") return null
  const fields = details.fields
  if (!Array.isArray(fields)) return {}
  const map: Record<string, { message: string; code?: string }> = {}
  for (const entry of fields) {
    const row = entry as { code?: unknown; reason?: unknown }
    if (typeof row.code !== "string" || row.code === "") continue
    map[row.code] = {
      message: typeof row.reason === "string" && row.reason ? row.reason : "The catalogue refused this value.",
      code: "ATTRIBUTE_VALUES_INVALID",
    }
  }
  return map
}

/**
 * `409 REVALIDATION_REQUIRED` → the field names the edit would send back for
 * review. An empty array still means "yes, revalidation" — the server may
 * decline to enumerate, and treating that as "no" would silently drop the
 * warning we owe the seller.
 */
export function revalidationFrom(err: unknown): { fields: string[] } | null {
  const { status, code, details } = envelope(err)
  if (status !== 409 || code !== "REVALIDATION_REQUIRED") return null
  const raw = details.fields
  const fields = Array.isArray(raw) ? raw.filter((f): f is string => typeof f === "string") : []
  return { fields }
}

/**
 * `400 FIELD_NOT_PATCHABLE` → the refused field and the whole allowlist, so the
 * seller is told which of their edits cannot be saved this way instead of
 * watching a save fail for no stated reason.
 */
export function notPatchableFrom(err: unknown): { message: string; patchable: string[] } | null {
  const { status, code, message, details } = envelope(err)
  if (status !== 400 || code !== "FIELD_NOT_PATCHABLE") return null
  const raw = details.patchable
  return {
    message: message || "That field cannot be changed after the listing is created.",
    patchable: Array.isArray(raw) ? raw.filter((f): f is string => typeof f === "string") : [],
  }
}

// ── Attribute values on the wire ────────────────────────────────

/** One answer as `POST /products` and `PATCH /products/:id` accept it. */
export interface AttributeWireValue {
  code: string
  value: unknown
  unit_code?: string
}

/**
 * The single place a form's working state turns into request JSON.
 *
 * The server takes an ARRAY of `{code, value}` under the key `attributes` —
 * checked against the handlers, not inferred. Two things follow that are easy
 * to get wrong in the other direction:
 *
 * The value is raw. The tagged union this form carries internally exists so
 * the renderer knows which control to draw; the server already knows the type
 * from the definition and validates against it, so a `{type, value}` wrapper
 * would arrive as an object where a number was expected.
 *
 * Only these keys may travel. PATCH refuses any body key that is neither a
 * patchable column nor one of `attributes`, `revalidate`, `variation_axes`,
 * `variants` — by name, with 400. So the schema version is NOT sent: the
 * server stamps `products.schema_version` itself from the published version,
 * which is the only value that could honestly claim the answers were checked
 * against it.
 *
 * A measure sends its unit alongside; the server falls back to the
 * definition's default unit when it is missing, because 250 with no unit is
 * not a weight. A value whose type this build did not understand goes back
 * exactly as it arrived rather than being flattened into a string it would
 * never survive.
 */
export function toAttributePayload(values: AttributeValueMap): AttributeWireValue[] {
  const out: AttributeWireValue[] = []
  for (const [code, value] of Object.entries(values)) {
    if (!code || value === null || value === undefined) continue
    const entry: AttributeWireValue = { code, value: (value as { value: unknown }).value }
    if (entry.value === null || entry.value === undefined) continue
    if (value.type === "measure" && value.unit) entry.unit_code = value.unit
    out.push(entry)
  }
  return out
}

// ── Pre-create scratch ──────────────────────────────────────────
//
// Local storage holds a listing ONLY until the server has a draft row for it.
// The moment `POST /products` returns an id the scratch is dropped, so there is
// never a moment where the browser and `products.status = 'draft'` both believe
// they are the record of truth and disagree about what the seller typed.

const SCRATCH_PREFIX = "atpost.sell.scratch."

export interface ListingScratch {
  categoryId: string
  savedAt: number
  values: Record<string, unknown>
}

function scratchKey(categoryId: string): string {
  return `${SCRATCH_PREFIX}${categoryId}`
}

export function readScratch(categoryId: string): ListingScratch | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(scratchKey(categoryId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as ListingScratch
    return parsed && typeof parsed === "object" && parsed.values ? parsed : null
  } catch {
    return null
  }
}

export function writeScratch(categoryId: string, values: Record<string, unknown>): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(
      scratchKey(categoryId),
      JSON.stringify({ categoryId, savedAt: Date.now(), values } satisfies ListingScratch),
    )
  } catch {
    // A full or disabled storage must never block a listing — the server draft
    // is the one that matters, and this is only the road to it.
  }
}

export function clearScratch(categoryId: string): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.removeItem(scratchKey(categoryId))
  } catch {
    /* see writeScratch */
  }
}
