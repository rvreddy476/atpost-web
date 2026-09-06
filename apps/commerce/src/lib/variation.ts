// One shirt, several sizes and colours: the axes, the values, and the grid the
// two of them produce.
//
// Everything here is pure. The cross product, the cap, the SKU suggestion and
// both request shapes can be reasoned about — and tested — without mounting a
// table.
//
// ─── THE WIRE, READ OFF THE HANDLERS ────────────────────────────────────
//
// POST /v1/commerce/products
//   { "variation_axes": [{"code":"size"},{"code":"colour"}],
//     "variants": [{"sku":"TEE-BLU-M","mrp_minor":99900,
//                   "selling_price_minor":74900,"stock_qty":12,
//                   "options":[{"code":"size","value":"m"},
//                              {"code":"colour","value":"blue"}]}] }
//
// PATCH /v1/commerce/products/:productId
//   { "variation_axes": [{"code":"size"}],
//     "variants": [{"variant_id":"<uuid>","options":[{"code":"size","value":"m"}]}] }
//
// Four facts that the shape above does not say out loud:
//
//   `position` is NOT sent. It is optional, and the server numbers the axes by
//   their order in the array when it is missing. Sending both invites the two
//   to disagree, and the array is the order the seller actually sees.
//
//   `variation_axes` and `variants` travel together. The server reads
//   `variants` ONLY when `variation_axes` is present, because a matrix change
//   replaces the whole picture; `variants` on its own is half a pair and is
//   refused by name.
//
//   `options[].value` is an enum option CODE. Not the label, not what the
//   seller typed. The server refuses free text on an axis on purpose: on a
//   shared catalogue it mints "Blue", "blue" and "Navy Blue" as three
//   permanent colours no filter can reunite. So nothing in this file ever
//   produces a value that did not come out of the definition's own list.
//
//   Money goes out as integer paise (`mrp_minor` / `selling_price_minor`).
//   The rupee floats are still accepted and are what the no-axis path has
//   always sent, but they are the fallback: a price typed as 1299.99 that
//   travels as a float arrives as 1299.9899999999998 and the stored paise
//   depend on which way a rounding call happens to fall.

import type {
  AttributeDefinition,
  AttributeEnumValue,
  AttributeSchema,
} from "@atpost/types/commerce"

/** Two, and it is the database's limit, not a layout preference. */
export const MAX_AXES = 2

/**
 * Twenty combinations, matching the server's cap.
 *
 * The cap is on combinations rather than on axes because the axes are not the
 * work — the cells are. Past twenty, a seller stops pricing each one and
 * starts leaving whatever the form defaulted to, which is how a large ends up
 * on sale at the small's price.
 */
export const MAX_COMBINATIONS = 20

// ── The axes on offer ───────────────────────────────────────────

export interface AxisOption {
  /** What travels as `options[].value`. */
  code: string
  label: string
  /** Hex from the catalogue, for a colour-like list. Null everywhere else. */
  swatchHex: string | null
}

export interface AxisCandidate {
  code: string
  label: string
  options: AxisOption[]
  /** Null when the axis can be picked; the reason it cannot, when it cannot. */
  unavailable: string | null
}

/**
 * The enum option's identity, tolerant of both spellings the catalogue uses.
 *
 * `GET …/attribute-schema` serves an option as `{code, label, swatch_hex}`;
 * this build's own type calls that field `value`, and the admin console's
 * records call it `code`. Reading both is not indecision — it is the
 * difference between an axis whose values are the schema's codes and one that
 * sends `undefined` to a server that refuses anything not in the list.
 */
function optionCode(value: AttributeEnumValue): string {
  return (value.value || value.code || "").trim()
}

function optionsOf(def: AttributeDefinition): AxisOption[] {
  return (def.values ?? [])
    .filter((v) => v.is_active !== false && optionCode(v) !== "")
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((v) => ({
      code: optionCode(v),
      label: v.label || optionCode(v),
      swatchHex: v.swatch_hex ?? null,
    }))
}

/**
 * Every attribute this category says a product may vary on.
 *
 * Two signals, and either one is enough: the schema's own `variation_axes`
 * list, and each definition's `is_variant_axis` — which is the EFFECTIVE flag,
 * so a category that promotes size to an axis is honoured without every other
 * category that binds the same attribute having to agree.
 *
 * A candidate with no inline option list is returned anyway, marked
 * unavailable with the reason. Hiding it would leave a seller looking for the
 * axis the category advertises and finding nothing; offering it would mean a
 * free-text box, which is the one thing this whole feature exists to stop.
 */
export function axisCandidates(schema: AttributeSchema | null): AxisCandidate[] {
  if (!schema) return []
  const declared = new Set(schema.variation_axes ?? [])
  const out: AxisCandidate[] = []
  for (const group of schema.groups ?? []) {
    for (const def of group.attributes ?? []) {
      if (!def.is_variant_axis && !declared.has(def.code)) continue
      const options = optionsOf(def)
      out.push({
        code: def.code,
        label: def.label || def.code,
        options,
        unavailable:
          options.length > 0
            ? null
            : `${def.label || def.code} has no published options yet, so it cannot be an axis ` +
              `here — an axis may only offer values the catalogue already knows.`,
      })
    }
  }
  return out
}

export function candidateFor(candidates: AxisCandidate[], code: string): AxisCandidate | null {
  return candidates.find((c) => c.code === code) ?? null
}

// ── The grid ────────────────────────────────────────────────────

/** One cell of the cross product: axis code → option code. */
export type Combination = Record<string, string>

export interface MatrixRow {
  /** `size=m|colour=blue`, in axis order — the same key the database derives. */
  key: string
  combo: Combination
  sku: string
  /** Rupees as typed. Converted to paise once, on the way out. */
  mrp: string
  price: string
  stock: string
  /** A combination the seller does not stock. Excluded rows are not sent. */
  included: boolean
  /** Set for a row that is already a variant on the server. */
  variantId?: string
  /**
   * The seller has changed this row's money since it was loaded. Only a dirty
   * row is repriced on an edit — re-posting twenty unchanged prices to prove
   * they are unchanged is twenty chances for one of them to fail.
   */
  dirty?: boolean
  /**
   * True when this row came back from the server and its combination is no
   * longer in the cross product — the seller unpicked a value a live variant
   * still uses. It cannot simply be dropped: a matrix PATCH must name every
   * variant the product has, so this is surfaced as something to fix rather
   * than silently omitted into a 422.
   */
  stranded?: boolean
}

export interface MatrixState {
  /** Axis codes in order. The order IS the position the server assigns. */
  axes: string[]
  /** Axis code → chosen option codes, in the order they were picked. */
  values: Record<string, string[]>
  /** Row data by combination key, so unpicking and repicking a value keeps the prices. */
  rows: Record<string, MatrixRow>
}

export const emptyMatrix: MatrixState = { axes: [], values: {}, rows: {} }

export function combinationKey(axes: string[], combo: Combination): string {
  return axes.map((axis) => `${axis}=${combo[axis] ?? ""}`).join("|")
}

/**
 * The cross product, last axis varying fastest — so a size/colour grid reads
 * S blue, S red, M blue, M red, which is the order the seller picked them in.
 */
export function combinationsFor(axes: string[], values: Record<string, string[]>): Combination[] {
  if (axes.length === 0) return []
  let out: Combination[] = [{}]
  for (const axis of axes) {
    const picked = values[axis] ?? []
    if (picked.length === 0) return []
    const next: Combination[] = []
    for (const partial of out) {
      for (const value of picked) next.push({ ...partial, [axis]: value })
    }
    out = next
  }
  return out
}

/** How many rows the grid WOULD have. Used to refuse a pick before it is made. */
export function combinationCount(axes: string[], values: Record<string, string[]>): number {
  if (axes.length === 0) return 0
  return axes.reduce((total, axis) => total * (values[axis] ?? []).length, 1)
}

/**
 * What picking one more value on `axis` would cost, in rows.
 *
 * Asked BEFORE the pick, so the option that would cross the cap is disabled
 * with the count on it rather than accepted and then rejected.
 */
export function countIfAdded(state: MatrixState, axis: string, value: string): number {
  const picked = state.values[axis] ?? []
  if (picked.includes(value)) return combinationCount(state.axes, state.values)
  return combinationCount(state.axes, { ...state.values, [axis]: [...picked, value] })
}

function skuPart(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/**
 * A suggestion, never an imposition: stem plus each option code, upper-cased.
 *
 * Editable on every row, because a seller with a warehouse already has a SKU
 * scheme and ours is not it.
 */
export function suggestSku(stem: string, axes: string[], combo: Combination): string {
  const parts = [skuPart(stem), ...axes.map((axis) => skuPart(combo[axis] ?? ""))]
  return parts.filter((p) => p !== "").join("-")
}

/**
 * The rows the current axes and values imply, with anything already typed kept.
 *
 * Stranded server rows are appended after the cross product rather than
 * interleaved: they are not part of the grid the seller is building, they are
 * the debt the previous shape left behind.
 */
export function matrixRows(state: MatrixState, stem = ""): MatrixRow[] {
  const rows: MatrixRow[] = []
  const seen = new Set<string>()
  for (const combo of combinationsFor(state.axes, state.values)) {
    const key = combinationKey(state.axes, combo)
    seen.add(key)
    const held = state.rows[key]
    rows.push(
      held
        ? { ...held, key, combo, stranded: false }
        : {
            key,
            combo,
            sku: suggestSku(stem, state.axes, combo),
            mrp: "",
            price: "",
            stock: "",
            included: true,
          },
    )
  }
  for (const [key, row] of Object.entries(state.rows)) {
    if (seen.has(key) || !row.variantId) continue
    rows.push({ ...row, stranded: true, included: true })
  }
  return rows
}

/** Replace one row, keyed by its combination. */
export function withRow(state: MatrixState, row: MatrixRow): MatrixState {
  return { ...state, rows: { ...state.rows, [row.key]: row } }
}

/** Fill one column of the grid in one action — the apply-to-all row. */
export function applyToAll(
  state: MatrixState,
  stem: string,
  field: "mrp" | "price" | "stock",
  value: string,
): MatrixState {
  const rows = { ...state.rows }
  for (const row of matrixRows(state, stem)) {
    if (row.stranded) continue
    rows[row.key] = {
      ...row,
      [field]: value,
      dirty: row.dirty || field !== "stock",
    }
  }
  return { ...state, rows }
}

// ── What is wrong with it, before the server is asked ───────────

/** Row key → the problems on that row. */
export type RowProblems = Record<string, string[]>

function addProblem(into: RowProblems, key: string, message: string): void {
  const list = into[key] ?? []
  if (!list.includes(message)) list.push(message)
  into[key] = list
}

/**
 * Everything this build can tell the seller without a round trip.
 *
 * The server enforces SKU uniqueness and completeness too, and its answer
 * still lands on the row. This exists so the seller does not spend a round
 * trip learning that two of their twelve rows say TEE-M.
 */
export function localProblems(rows: MatrixRow[]): RowProblems {
  const problems: RowProblems = {}
  const bySku = new Map<string, number>()
  for (const row of rows) {
    if (!row.included) continue
    const sku = row.sku.trim()
    if (sku !== "") bySku.set(sku, (bySku.get(sku) ?? 0) + 1)
  }
  for (const row of rows) {
    if (row.stranded) {
      addProblem(
        problems,
        row.key,
        "This variant already exists but its combination is no longer in the grid. " +
          "Put its values back, or give it a combination the grid contains.",
      )
      continue
    }
    if (!row.included) continue
    const sku = row.sku.trim()
    if (sku === "") addProblem(problems, row.key, "Needs a SKU.")
    else if ((bySku.get(sku) ?? 0) > 1)
      addProblem(problems, row.key, `Two rows use the SKU ${sku}. Each one has to be its own.`)
    if (rupeesToMinor(row.mrp) === null) addProblem(problems, row.key, "Needs an MRP.")
    if (rupeesToMinor(row.price) === null) addProblem(problems, row.key, "Needs a selling price.")
  }
  return problems
}

// ── Money ───────────────────────────────────────────────────────

/**
 * Rupees as typed → integer paise, or null when it is not a plain amount.
 *
 * Parsed off the text rather than through `Number(x) * 100`: 1299.99 as a
 * float is 1299.9899999999998, and the paise the seller is paid then depend on
 * a rounding call rather than on what they typed.
 */
export function rupeesToMinor(text: string): number | null {
  const trimmed = text.trim()
  if (trimmed === "") return null
  const match = /^(\d+)(?:\.(\d{0,2}))?$/.exec(trimmed)
  if (!match) return null
  const paise = (match[2] ?? "").padEnd(2, "0")
  return Number(match[1]) * 100 + Number(paise)
}

/** Integer paise → the rupee text a form field holds. */
export function minorToRupees(minor: number): string {
  const whole = Math.trunc(minor / 100)
  const paise = Math.abs(minor % 100)
  return paise === 0 ? String(whole) : `${whole}.${String(paise).padStart(2, "0")}`
}

// ── The request ─────────────────────────────────────────────────

export interface VariationAxisWire {
  code: string
}

export interface VariantOptionWire {
  code: string
  value: string
}

/** One row of a CREATE. */
export interface VariantCreateWire {
  sku: string
  mrp_minor: number
  selling_price_minor: number
  stock_qty: number
  options: VariantOptionWire[]
}

/** One row of a matrix PATCH: which variant, and where it sits on the axes. */
export interface VariantOptionsWire {
  variant_id: string
  options: VariantOptionWire[]
}

/** Array order only — see the header. */
export function axesPayload(axes: string[]): VariationAxisWire[] {
  return axes.map((code) => ({ code }))
}

function optionsPayload(axes: string[], combo: Combination): VariantOptionWire[] {
  return axes.map((axis) => ({ code: axis, value: combo[axis] ?? "" }))
}

/** The rows a create sends, in the order the grid shows them. */
export function createVariantsPayload(axes: string[], rows: MatrixRow[]): VariantCreateWire[] {
  return rows
    .filter((row) => row.included && !row.stranded)
    .map((row) => ({
      sku: row.sku.trim(),
      mrp_minor: rupeesToMinor(row.mrp) ?? 0,
      selling_price_minor: rupeesToMinor(row.price) ?? 0,
      stock_qty: Number(row.stock.trim() === "" ? 0 : row.stock),
      options: optionsPayload(axes, row.combo),
    }))
}

/**
 * The rows a matrix PATCH sends.
 *
 * Every variant the product has, without exception — the server replaces the
 * whole picture, so one it is not told about would have its options cascaded
 * away and never rewritten, leaving a listing with a declared matrix and a
 * variant outside it.
 */
export function patchVariantsPayload(axes: string[], rows: MatrixRow[]): VariantOptionsWire[] {
  return rows
    .filter((row) => !!row.variantId)
    .map((row) => ({
      variant_id: row.variantId as string,
      options: optionsPayload(axes, row.combo),
    }))
}

// ── The server's refusal, back onto the rows ────────────────────

export interface VariationProblem {
  /** The SKU, or "variant 3" on a create, or a variant id on a patch. */
  variant?: string
  /** The axis the complaint is about, when it is about one. */
  code?: string
  reason: string
}

/**
 * 422 VARIATION_INVALID → one message per row.
 *
 * The server names a variant by SKU where there is one and by POSITION where
 * there is not, because a create's variants have no ids yet. Both are matched
 * here, plus the variant id a patch reports, so a problem lands on the row the
 * seller is looking at rather than in a banner they have to decode.
 */
export function problemsOntoRows(
  problems: VariationProblem[],
  sent: MatrixRow[],
): { rows: RowProblems; unattached: string[] } {
  const rows: RowProblems = {}
  const unattached: string[] = []
  const bySku = new Map<string, MatrixRow>()
  const byId = new Map<string, MatrixRow>()
  sent.forEach((row) => {
    const sku = row.sku.trim()
    if (sku !== "" && !bySku.has(sku)) bySku.set(sku, row)
    if (row.variantId) byId.set(row.variantId, row)
  })

  for (const problem of problems) {
    const named = (problem.variant ?? "").trim()
    const message = problem.code ? `${problem.code}: ${problem.reason}` : problem.reason
    let row = named === "" ? undefined : (bySku.get(named) ?? byId.get(named))
    if (!row && named !== "") {
      // "variant 3" — the position in the array we sent, 1-based.
      const position = /^variant (\d+)$/.exec(named)
      if (position) row = sent[Number(position[1]) - 1]
    }
    if (row) addProblem(rows, row.key, message)
    else unattached.push(named === "" ? message : `${named}: ${message}`)
  }
  return { rows, unattached }
}

// ── Reading an existing product back into the grid ──────────────

/** What `GET /v1/commerce/products/:id/variants` gives us, narrowed to what a grid needs. */
export interface ExistingVariant {
  id: string
  sku: string
  status?: string
  option_1_name?: string | null
  option_1_value?: string | null
  option_2_name?: string | null
  option_2_value?: string | null
  mrp?: number
  selling_price?: number
  mrp_minor?: number | null
  selling_price_minor?: number | null
  available_qty?: number | null
}

function looseMatch(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

/**
 * An existing product's variants → the grid that produced them.
 *
 * ─── WHY THIS IS A RECONSTRUCTION AND NOT A READ ────────────────
 *
 * No read endpoint returns a product's axes or a variant's option CODES today.
 * What comes back is the derived legacy pair the database maintains for the
 * phone and the analytics readers: `option_1_name` is the definition's LABEL
 * and `option_1_value` is the enum option's label (or, for a text or integer
 * axis, the value itself). So the labels are matched back to the schema, case
 * insensitively, against each definition's code and label and each option's
 * code and label — the same rule the database's own backfill uses.
 *
 * A variant whose labels do not resolve is kept, with an empty combination and
 * marked stranded, so the seller is shown a row to fix. Dropping it would send
 * a matrix PATCH that omits a real variant, which the server refuses — and
 * rightly, because that patch would cascade the variant's options away.
 */
export function matrixFromVariants(
  candidates: AxisCandidate[],
  variants: ExistingVariant[],
): MatrixState | null {
  const withOptions = variants.filter((v) => (v.option_1_name ?? "").trim() !== "")
  if (withOptions.length === 0) return null

  const axes: string[] = []
  for (const slot of ["option_1_name", "option_2_name"] as const) {
    const label = withOptions.map((v) => (v[slot] ?? "").trim()).find((l) => l !== "")
    if (!label) continue
    const hit = candidates.find((c) => looseMatch(c.code, label) || looseMatch(c.label, label))
    // An axis whose definition is no longer in this category's schema is kept
    // by code so the rows can still name it: the product declares it, and a
    // patch that quietly dropped it would clear the matrix.
    axes.push(hit ? hit.code : label)
  }
  if (axes.length === 0) return null

  const values: Record<string, string[]> = {}
  const rows: Record<string, MatrixRow> = {}

  for (const variant of withOptions) {
    const combo: Combination = {}
    let resolved = true
    axes.forEach((axis, index) => {
      const raw = ((index === 0 ? variant.option_1_value : variant.option_2_value) ?? "").trim()
      if (raw === "") {
        resolved = false
        return
      }
      const candidate = candidateFor(candidates, axis)
      const option = candidate?.options.find(
        (o) => looseMatch(o.code, raw) || looseMatch(o.label, raw),
      )
      if (!option) {
        resolved = false
        return
      }
      combo[axis] = option.code
    })

    const mrpMinor = variant.mrp_minor ?? Math.round((variant.mrp ?? 0) * 100)
    const priceMinor = variant.selling_price_minor ?? Math.round((variant.selling_price ?? 0) * 100)
    const row: MatrixRow = {
      key: resolved ? combinationKey(axes, combo) : `unresolved:${variant.id}`,
      combo,
      sku: variant.sku,
      mrp: minorToRupees(mrpMinor),
      price: minorToRupees(priceMinor),
      stock: variant.available_qty === null || variant.available_qty === undefined
        ? ""
        : String(variant.available_qty),
      included: true,
      variantId: variant.id,
      stranded: !resolved,
    }
    rows[row.key] = row
    if (!resolved) continue
    for (const axis of axes) {
      const picked = values[axis] ?? []
      if (!picked.includes(combo[axis])) picked.push(combo[axis])
      values[axis] = picked
    }
  }

  return { axes, values, rows }
}

/** The rows a create must add before the matrix can name them. See ListingForm. */
export function rowsNeedingCreation(rows: MatrixRow[]): MatrixRow[] {
  return rows.filter((row) => row.included && !row.stranded && !row.variantId)
}
