import type { AxiosError } from "axios"
import type {
  AnyAttributeDataType,
  AttributeScope,
  Category,
} from "@atpost/types/commerce"
import type { TreeNode } from "@atpost/ui"

/**
 * Shapes and pure helpers for the catalogue console.
 *
 * Every record below is read through a normaliser rather than cast, because the
 * admin catalogue proxy is younger than this screen and has already shipped two
 * spellings for the same idea (`required` / `is_required`, an enum option's
 * `value` / `code`). A field this UI cannot find degrades to a sensible default;
 * a field it does not know about is carried through untouched on write, so a
 * PATCH never silently drops a column this build has not heard of.
 */

// ── Records ─────────────────────────────────────────────────────

export interface EnumValueRecord {
  id: string
  code: string
  label: string
  sort_order: number
  is_active: boolean
  /** Hex swatch for colour-like option lists. Null for everything else. */
  swatch_hex: string | null
  /** Everything the server sent that this build does not model. */
  raw: Record<string, unknown>
}

export interface DefinitionRecord {
  id: string
  /** The wire identity. Immutable once the definition has been saved. */
  code: string
  label: string
  help_text: string | null
  placeholder: string | null
  data_type: AnyAttributeDataType
  display_group: string | null
  scope: AttributeScope
  is_required: boolean
  is_variant_axis: boolean
  is_filterable: boolean
  is_searchable: boolean
  is_active: boolean
  min: number | null
  max: number | null
  min_len: number | null
  max_len: number | null
  regex: string | null
  max_values: number | null
  unit_family: string | null
  default_unit: string | null
  enum_values: EnumValueRecord[]
  raw: Record<string, unknown>
}

/** One attribute bound to one category — the row a category actually owns. */
export interface CategoryAttributeBinding {
  attribute_definition_id: string
  code: string
  label: string
  data_type: AnyAttributeDataType
  scope: AttributeScope
  is_required: boolean
  is_variant_axis: boolean
  is_filterable: boolean
  /** True when this binding exists only to hide an inherited attribute. */
  is_excluded: boolean
  sort_order: number
  raw: Record<string, unknown>
}

/** A binding as the attribute list shows it: owned here, or handed down. */
export interface EffectiveBinding extends CategoryAttributeBinding {
  /** Null when the row belongs to the selected category itself. */
  inherited_from: { id: string; name: string } | null
}

export interface SchemaState {
  draft_dirty: boolean
  published_version: number | null
  draft_version: number | null
  /** Free-text summary of what is waiting, when the server offers one. */
  pending_changes: number | null
}

// ── Envelope + coercion ─────────────────────────────────────────

type Json = Record<string, unknown>

/** `{ data: … }` is the house envelope, but not every route wears it. */
export function unwrap<T>(body: unknown): T {
  if (body && typeof body === "object" && "data" in (body as Json)) {
    return (body as { data: T }).data
  }
  return body as T
}

/**
 * The rows out of a list response.
 *
 * Every admin list route answers `{"data":{"items":[…]}}` — verified
 * against the handlers, not guessed. The fallbacks below cost nothing and
 * cover a bare array and the two other spellings a list has worn in this
 * codebase; without the `items` arm every list on this screen renders empty
 * while the request itself succeeds, which is the least debuggable failure
 * this client can have.
 */
export function rows(body: unknown): unknown[] {
  const inner = unwrap<unknown>(body)
  if (Array.isArray(inner)) return inner
  const o = inner && typeof inner === "object" ? (inner as Json) : {}
  for (const key of ["items", "attributes", "values", "definitions"]) {
    if (Array.isArray(o[key])) return o[key] as unknown[]
  }
  return []
}

function obj(value: unknown): Json {
  return value && typeof value === "object" ? (value as Json) : {}
}

function str(...candidates: unknown[]): string {
  for (const c of candidates) if (typeof c === "string" && c !== "") return c
  return ""
}

function nullableStr(...candidates: unknown[]): string | null {
  for (const c of candidates) {
    if (typeof c === "string") return c === "" ? null : c
    if (c === null) return null
  }
  return null
}

function bool(fallback: boolean, ...candidates: unknown[]): boolean {
  for (const c of candidates) if (typeof c === "boolean") return c
  return fallback
}

function num(...candidates: unknown[]): number | null {
  for (const c of candidates) {
    if (typeof c === "number" && Number.isFinite(c)) return c
    if (typeof c === "string" && c.trim() !== "" && Number.isFinite(Number(c))) return Number(c)
  }
  return null
}

// ── Normalisers ─────────────────────────────────────────────────

export function normaliseEnumValue(input: unknown, index: number): EnumValueRecord {
  const r = obj(input)
  return {
    id: str(r.id, r.value_id, r.code, r.value) || `enum-${index}`,
    code: str(r.code, r.value, r.id),
    label: str(r.label, r.name, r.code, r.value),
    sort_order: num(r.sort_order, r.display_order, r.position) ?? index,
    is_active: bool(true, r.is_active, r.active),
    swatch_hex: nullableStr(r.swatch_hex, r.swatch, r.hex, r.colour_hex, r.color_hex),
    raw: r,
  }
}

export function normaliseDefinition(input: unknown): DefinitionRecord {
  const r = obj(input)
  const rawValues = Array.isArray(r.enum_values)
    ? r.enum_values
    : Array.isArray(r.values)
      ? r.values
      : []
  return {
    id: str(r.id, r.definition_id, r.code),
    code: str(r.code, r.attribute_code),
    label: str(r.label, r.name, r.code),
    help_text: nullableStr(r.help_text, r.description),
    placeholder: nullableStr(r.placeholder, r.hint),
    data_type: (str(r.data_type, r.type) || "text") as AnyAttributeDataType,
    display_group: nullableStr(r.display_group, r.group, r.group_name),
    scope: (str(r.scope, r.applies_to) || "item") as AttributeScope,
    is_required: bool(false, r.is_required, r.required),
    is_variant_axis: bool(false, r.is_variant_axis, r.variant_axis, r.is_variation_axis),
    is_filterable: bool(false, r.is_filterable, r.filterable),
    is_searchable: bool(false, r.is_searchable, r.searchable),
    is_active: bool(true, r.is_active, r.active),
    min: num(r.min, r.min_value),
    max: num(r.max, r.max_value),
    min_len: num(r.min_len, r.min_length),
    max_len: num(r.max_len, r.max_length),
    regex: nullableStr(r.regex, r.pattern),
    max_values: num(r.max_values, r.max_selections),
    unit_family: nullableStr(r.unit_family, r.unit_group),
    default_unit: nullableStr(r.default_unit, r.unit),
    enum_values: rawValues.map(normaliseEnumValue).sort((a, b) => a.sort_order - b.sort_order),
    raw: r,
  }
}

export function normaliseBinding(input: unknown, index: number): CategoryAttributeBinding {
  const r = obj(input)
  const nested = obj(r.definition ?? r.attribute_definition ?? r.attribute)
  return {
    attribute_definition_id: str(
      r.attribute_definition_id,
      r.definition_id,
      nested.id,
      r.id,
      r.code,
    ),
    code: str(r.code, r.attribute_code, nested.code),
    label: str(r.label, nested.label, r.code, nested.code),
    data_type: (str(r.data_type, nested.data_type) || "text") as AnyAttributeDataType,
    scope: (str(r.scope, nested.scope) || "item") as AttributeScope,
    is_required: bool(false, r.is_required, r.required, nested.is_required),
    is_variant_axis: bool(false, r.is_variant_axis, r.variant_axis, nested.is_variant_axis),
    is_filterable: bool(false, r.is_filterable, r.filterable, nested.is_filterable),
    is_excluded: bool(false, r.is_excluded, r.excluded),
    sort_order: num(r.sort_order, r.display_order, r.position) ?? index,
    raw: r,
  }
}

export function normaliseSchemaState(input: unknown): SchemaState {
  const r = obj(input)
  const draft = obj(r.draft)
  return {
    draft_dirty: bool(false, r.draft_dirty, r.is_dirty, draft.dirty),
    published_version: num(r.published_version, r.version, draft.published_version),
    draft_version: num(r.draft_version, draft.version),
    pending_changes: num(r.pending_changes, r.changes, r.dirty_count),
  }
}

/** The body a PUT of a category's own bindings expects. Unknown keys survive. */
export function bindingToWire(binding: CategoryAttributeBinding): Json {
  return {
    ...binding.raw,
    attribute_definition_id: binding.attribute_definition_id,
    code: binding.code,
    is_required: binding.is_required,
    is_variant_axis: binding.is_variant_axis,
    is_filterable: binding.is_filterable,
    is_excluded: binding.is_excluded,
    sort_order: binding.sort_order,
  }
}

// ── The 409 ─────────────────────────────────────────────────────

export interface ImpactCounts {
  live_products: number
  missing: number
  out_of_range: number
  affected: number
}

export interface ImpactDetailRow extends ImpactCounts {
  code: string | null
  label: string | null
  definition_id: string | null
}

export interface ImpactConflict {
  /** The exact number that must be echoed back as `?ack_impact=`. */
  affected: number
  message: string | null
  /** The server's own words for what narrowed, e.g. "pages becomes required". */
  what: string | null
  details: ImpactDetailRow[]
}

function counts(source: Json): ImpactCounts {
  return {
    live_products: num(source.live_products, source.live) ?? 0,
    missing: num(source.missing) ?? 0,
    out_of_range: num(source.out_of_range, source.outOfRange) ?? 0,
    affected: num(source.affected) ?? 0,
  }
}

export function normaliseImpact(input: unknown): ImpactCounts {
  return counts(obj(unwrap(input)))
}

/**
 * Read a narrowing refusal out of an axios failure.
 *
 * Returns null unless the server both refused with 409 IMPACT_ACK_REQUIRED and
 * said how many rows are affected. Without that number there is nothing
 * truthful to show and nothing safe to acknowledge, so the caller falls back to
 * an ordinary error toast rather than inventing a count.
 */
export function parseImpactConflict(error: unknown): ImpactConflict | null {
  const response = (error as AxiosError | undefined)?.response
  if (!response || response.status !== 409) return null

  const body = obj(response.data)
  const inner = obj(body.error ?? body.data ?? body)
  const code = str(inner.code, body.code)
  if (code !== "" && code !== "IMPACT_ACK_REQUIRED") return null

  // The real envelope, read off the handler rather than guessed:
  //   error.details = { what, ack_impact, impacts: [ … ], how_to_ack, provided? }
  // `details` is an OBJECT carrying the array, not the array itself. Treating
  // it as an array yields no rows, no count, and therefore no dialog — the
  // founder would get a bare error toast on every narrowing edit and no way to
  // approve one. The looser reads after it are kept as fallbacks only.
  const detailBag = obj(inner.details ?? body.details)

  const rawRows = Array.isArray(detailBag.impacts)
    ? detailBag.impacts
    : Array.isArray(inner.details)
      ? inner.details
      : Array.isArray(inner.definitions)
        ? inner.definitions
        : Array.isArray(body.details)
          ? body.details
          : []

  const details: ImpactDetailRow[] = rawRows.map((entry) => {
    const d = obj(entry)
    return {
      ...counts(d),
      code: nullableStr(d.code, d.attribute_code),
      label: nullableStr(d.label, d.name),
      definition_id: nullableStr(d.definition_id, d.id),
    }
  })

  const affected =
    num(detailBag.ack_impact, inner.affected, body.affected, obj(inner.impact).affected) ??
    (details.length > 0 ? details.reduce((sum, d) => sum + d.affected, 0) : null)
  if (affected === null) return null

  return {
    affected,
    message: nullableStr(inner.message, body.message),
    what: nullableStr(detailBag.what),
    details,
  }
}

/** The best sentence available for an error toast. */
export function apiErrorMessage(error: unknown, fallback: string): string {
  const response = (error as AxiosError | undefined)?.response
  if (response) {
    const body = obj(response.data)
    const inner = obj(body.error)
    const message = nullableStr(inner.message, body.message, body.detail, body.error)
    if (message) return `${response.status} — ${message}`
    return `${response.status} ${response.statusText || fallback}`
  }
  const message = (error as Error | undefined)?.message
  return message || fallback
}

// `isUnauthenticated` / `isForbidden` used to live here. Their only caller was
// AdminGate's probe, which inferred admin access from the status code of an
// unrelated catalogue read; it now asks /v1/auth/me/capabilities instead, and
// nothing else in the console needed to tell 401 from 403.

// ── Impact, in words ────────────────────────────────────────────

export function describeImpact(conflict: ImpactConflict): string[] {
  const lines: string[] = []
  const total = conflict.details.reduce(
    (acc, d) => ({
      live_products: acc.live_products + d.live_products,
      missing: acc.missing + d.missing,
      out_of_range: acc.out_of_range + d.out_of_range,
      affected: acc.affected + d.affected,
    }),
    { live_products: 0, missing: 0, out_of_range: 0, affected: 0 },
  )

  lines.push(
    `${plural(conflict.affected, "live listing", "live listings")} would stop matching this attribute the moment you save.`,
  )
  if (total.live_products > 0) {
    lines.push(`${plural(total.live_products, "product uses", "products use")} it today.`)
  }
  if (total.missing > 0) {
    lines.push(
      `${plural(total.missing, "listing has", "listings have")} no value at all, so their sellers must supply one before they can edit again.`,
    )
  }
  if (total.out_of_range > 0) {
    lines.push(
      `${plural(total.out_of_range, "listing holds", "listings hold")} a value outside the new limits.`,
    )
  }
  // conflict.message is deliberately not folded in here — it is the server's
  // own wording ("resend with ?ack_impact=7"), which belongs beside the button
  // rather than in a list the founder is reading to make a decision.
  return lines
}

function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`
}

// ── Category tree ───────────────────────────────────────────────

export function categoryChildren(category: Category): Category[] {
  return (category.children ?? []).slice().sort((a, b) => a.display_order - b.display_order)
}

/** Root-first ancestry including the category itself; empty when not found. */
export function categoryPath(roots: Category[], id: string): Category[] {
  for (const root of roots) {
    if (root.id === id) return [root]
    const below = categoryPath(categoryChildren(root), id)
    if (below.length > 0) return [root, ...below]
  }
  return []
}

export function findCategory(roots: Category[], id: string): Category | null {
  const path = categoryPath(roots, id)
  return path.length > 0 ? path[path.length - 1] : null
}

export function flattenCategories(roots: Category[]): Category[] {
  return roots.flatMap((c) => [c, ...flattenCategories(categoryChildren(c))])
}

/** Every id on the way to `id`, so selecting a deep node opens its ancestors. */
export function expandedIdsFor(roots: Category[], id: string | null): string[] {
  if (!id) return roots.map((r) => r.id)
  return categoryPath(roots, id).map((c) => c.id)
}

export function toTreeNodes(categories: Category[]): TreeNode[] {
  return categories.map((category) => {
    const children = categoryChildren(category)
    const flags = [
      category.is_active ? null : "hidden",
      category.is_listable ? null : "grouping only",
    ].filter(Boolean)
    return {
      id: category.id,
      label: category.name,
      meta: [
        category.slug,
        `${category.product_count} products`,
        ...flags,
      ].join(" · "),
      children: children.length > 0 ? toTreeNodes(children) : undefined,
    }
  })
}
