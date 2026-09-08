// The listing flow's non-React half: how a server answer becomes something the
// form can show, and where a not-yet-created draft is parked.
//
// Everything here is pure so the awkward parts — a 422 keyed by attribute code,
// a 409 that names the fields it will cost you — can be reasoned about without
// mounting a form.

import { STORAGE_KEYS } from "@momentum/brand"
import type { AttributeValueMap } from "@atpost/types/commerce"
import type { VariationProblem } from "./variation"

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
 * `422 VARIATION_INVALID` → every complaint about the matrix, in the order the
 * server made them. Null for any other failure, so the caller keeps falling
 * through its `catch` exactly as it does for the attribute 422 above.
 *
 * `details.problems` is `[{variant, code, reason}]` and carries EVERY problem,
 * for the same reason the attribute errors do: a seller with a six-cell grid
 * and three mistakes should not need three round trips to learn about all
 * three. `variant` names the row by SKU where there is one and by position
 * ("variant 3") on a create, where the variants have no ids yet;
 * `problemsOntoRows` in ./variation is what turns that into a message under
 * the row it belongs to.
 */
export function variationProblemsFrom(err: unknown): VariationProblem[] | null {
  const { status, code, details } = envelope(err)
  if (status !== 422 || code !== "VARIATION_INVALID") return null
  const raw = details.problems
  if (!Array.isArray(raw)) return []
  const out: VariationProblem[] = []
  for (const entry of raw) {
    const row = entry as { variant?: unknown; code?: unknown; reason?: unknown }
    const reason = typeof row.reason === "string" && row.reason !== "" ? row.reason : ""
    if (reason === "") continue
    out.push({
      variant: typeof row.variant === "string" ? row.variant : undefined,
      code: typeof row.code === "string" && row.code !== "" ? row.code : undefined,
      reason,
    })
  }
  return out
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

// The literal is frozen in @momentum/brand: renaming it would silently discard
// every half-written listing already sitting in a seller browser.
const SCRATCH_PREFIX = STORAGE_KEYS.listingScratchPrefix

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

// ── Seeding the form from an existing listing ───────────────────

/**
 * The product's own columns, as the built-in fields hold them.
 *
 * Only the four the form owns. Everything else on the product row is either
 * not editable here or not patchable at all, and seeding a field the form
 * cannot show would put it in the next PATCH body unchanged — which is how a
 * form quietly starts writing values nobody looked at.
 */
export function basicsFromProduct(product: Record<string, unknown>): {
  title: string
  description: string
  returnPolicy: string
  taxClassId: string
} {
  const s = (v: unknown) => (typeof v === "string" ? v : "")
  return {
    title: s(product.title),
    description: s(product.description),
    returnPolicy: s(product.return_policy_type),
    taxClassId: s(product.tax_class_id),
  }
}

/**
 * The stored answers, back into the form's tagged-union working state.
 *
 * The server sends `{code, data_type, value, unit_code}` — the same codes the
 * schema served — so each answer is re-tagged with the type the definition
 * declares rather than guessed from the value's JSON shape. An answer whose
 * type this build does not know is carried as `unknown`, exactly as the
 * renderer expects, so editing a listing never drops a field the seller
 * cannot see.
 */
export function attributeValuesFromProduct(
  rows: Array<{ code?: string; data_type?: string; value?: unknown; unit_code?: string }>,
): AttributeValueMap {
  const out: AttributeValueMap = {}
  for (const row of rows) {
    const code = typeof row.code === "string" ? row.code : ""
    if (!code || row.value === null || row.value === undefined) continue
    const type = typeof row.data_type === "string" ? row.data_type : ""
    switch (type) {
      case "measure":
        out[code] = { type: "measure", value: String(row.value), unit: row.unit_code ?? "" }
        break
      case "decimal":
        out[code] = { type: "decimal", value: String(row.value) }
        break
      case "text":
      case "long_text":
      case "integer":
      case "money_minor":
      case "boolean":
      case "enum":
      case "multi_enum":
      case "date":
      case "media":
      case "gtin":
        out[code] = { type, value: row.value } as AttributeValueMap[string]
        break
      default:
        out[code] = { type: "unknown", data_type: type, value: row.value }
    }
  }
  return out
}
