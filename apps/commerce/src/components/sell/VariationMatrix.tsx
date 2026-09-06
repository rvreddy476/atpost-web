"use client"

import { useMemo, useState } from "react"
import { AlertTriangle, Info } from "lucide-react"
import { Button, Checkbox, Input, MultiSelect, Select, TBody, TD, TH, THead, TR, Table } from "@atpost/ui"
import {
  MAX_AXES,
  MAX_COMBINATIONS,
  applyToAll,
  candidateFor,
  combinationCount,
  countIfAdded,
  matrixRows,
  suggestSku,
  withRow,
  type AxisCandidate,
  type MatrixRow,
  type MatrixState,
  type RowProblems,
} from "@/lib/variation"

/*
 * The one screen where the web beats the phone.
 *
 * A seller with one shirt in three sizes and two colours has six things to
 * price, and on a phone that is six trips through a wizard. Here it is a
 * table: pick the axes, pick the values, and every combination is a row with
 * its own SKU, price and stock — with one action that fills a whole column,
 * because typing the same price twelve times is how a seller gives up halfway
 * and leaves six variants at whatever the form defaulted to.
 *
 * Nothing here ever offers a value the catalogue does not already know. There
 * is no free-text box on an axis, by construction rather than by validation:
 * the server refuses free text, and it is right to, because on a shared
 * catalogue "Blue", "blue" and "Navy Blue" become three permanent colours that
 * no filter can reunite.
 */

const AXIS_EXPLAINER =
  "An axis is the thing a buyer chooses between — the size, the colour. Pick up to two, and " +
  "every combination becomes its own row with its own SKU, price and stock."

export function VariationMatrix({
  candidates,
  value,
  onChange,
  stem,
  problems,
  editing,
}: {
  candidates: AxisCandidate[]
  value: MatrixState
  onChange: (next: MatrixState) => void
  /** The seller's own SKU, which the per-row suggestions are built from. */
  stem: string
  /** Row key → what is wrong with that row, local verdicts and the server's alike. */
  problems: RowProblems
  /** True once the product exists on the server: its rows carry variant ids. */
  editing: boolean
}) {
  // A pending axis change, held until the seller has been told what it costs.
  const [confirmAxis, setConfirmAxis] = useState<{ slot: number; code: string } | null>(null)
  const [fill, setFill] = useState({ mrp: "", price: "", stock: "" })
  const [announcement, setAnnouncement] = useState("")

  const rows = useMemo(() => matrixRows(value, stem), [value, stem])
  const count = combinationCount(value.axes, value.values)
  const on = value.axes.length > 0

  /** Does anything in the grid represent work the seller would lose? */
  const hasWork = rows.some(
    (row) => row.variantId || row.mrp !== "" || row.price !== "" || row.stock !== "",
  )

  function setAxis(slot: number, code: string) {
    const axes = value.axes.slice()
    if (code === "") axes.splice(slot)
    else axes[slot] = code
    // Values and rows are keyed by axis code, so a changed axis leaves both
    // meaningless: a price entered for "M / Blue" cannot honestly be carried
    // onto whatever replaces colour. The grid is rebuilt, not migrated.
    const values: Record<string, string[]> = {}
    for (const axis of axes) values[axis] = value.values[axis] ?? []
    const rowsKept = axes.length === value.axes.length && axes.every((a, i) => a === value.axes[i])
    onChange({ axes, values, rows: rowsKept ? value.rows : {} })
    setConfirmAxis(null)
  }

  function requestAxis(slot: number, code: string) {
    if (code === value.axes[slot]) return
    // Nothing typed yet means nothing to lose; the warning would be noise.
    if (!hasWork) {
      setAxis(slot, code)
      return
    }
    setConfirmAxis({ slot, code })
  }

  function setValues(axis: string, picked: string[]) {
    onChange({ ...value, values: { ...value.values, [axis]: picked } })
  }

  function updateRow(row: MatrixRow, patch: Partial<MatrixRow>) {
    // A row whose money the seller touched is marked, so an edit reprices
    // exactly the variants that changed and no others.
    const touchedMoney = patch.mrp !== undefined || patch.price !== undefined
    onChange(withRow(value, { ...row, ...patch, dirty: row.dirty || touchedMoney }))
  }

  function fillColumn(field: "mrp" | "price" | "stock", label: string) {
    const text = fill[field]
    if (text.trim() === "") return
    onChange(applyToAll(value, stem, field, text))
    const filled = rows.filter((r) => !r.stranded).length
    setAnnouncement(`Filled ${label} on ${filled} ${filled === 1 ? "row" : "rows"}.`)
  }

  const pickable = candidates.filter((c) => !c.unavailable)
  const blocked = candidates.filter((c) => c.unavailable)

  /**
   * How a row is named — in a field label, in an error, and to a screen
   * reader. The option's LABEL, not its code: "Medium / Blue" is what the
   * seller picked, even though "m" and "blue" are what travel.
   */
  function describe(row: MatrixRow): string {
    const parts = value.axes
      .map((axis) => {
        const code = row.combo[axis]
        if (!code) return ""
        return candidateFor(candidates, axis)?.options.find((o) => o.code === code)?.label ?? code
      })
      .filter(Boolean)
    if (parts.length > 0) return parts.join(" / ")
    return row.sku || "this variant"
  }

  return (
    <section className="flex flex-col gap-4" data-testid="variation-matrix">
      <div>
        <h3 className="text-sm font-semibold text-brand-text">Sizes, colours and other versions</h3>
        <p className="mt-1 text-xs text-gray-500">{AXIS_EXPLAINER}</p>
      </div>

      {pickable.length === 0 && (
        <p className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
          This category does not have an attribute a product can vary on yet, so this listing is one
          version with one price.
          {blocked.length > 0 && <span className="mt-1 block">{blocked[0].unavailable}</span>}
        </p>
      )}

      {pickable.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1].slice(0, Math.min(MAX_AXES, value.axes.length + 1)).map((slot) => (
            <Select
              key={slot}
              id={`variation-axis-${slot + 1}`}
              label={slot === 0 ? "First axis" : "Second axis"}
              description={
                slot === 0
                  ? "What a buyer picks first."
                  : "Optional. Two is the most a product may vary on."
              }
              placeholder={slot === 0 ? "This product comes in one version" : "No second axis"}
              value={value.axes[slot] ?? ""}
              options={pickable
                .filter((c) => c.code === value.axes[slot] || !value.axes.includes(c.code))
                .map((c) => ({ value: c.code, label: c.label }))
                // An axis the category advertises but has published no values
                // for is shown, and cannot be chosen. Hiding it would leave a
                // seller hunting for it; enabling it would hand them an empty
                // grid with nothing to pick.
                .concat(
                  blocked.map((c) => ({
                    value: c.code,
                    label: `${c.label} — no options yet`,
                    disabled: true,
                  })),
                )}
              onChange={(next) => requestAxis(slot, next)}
            />
          ))}
        </div>
      )}

      {confirmAxis && (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
        >
          <p className="flex items-start gap-2 font-medium">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            Changing this axis discards the grid.
          </p>
          <p>
            The rows below are keyed to {value.axes.join(" and ")}. A price entered for one
            combination cannot honestly be carried onto a different one, so the grid is rebuilt
            empty and every row has to be priced again.
            {editing && (
              <> Variants that already exist are not deleted — they stay, and need a new combination.</>
            )}
          </p>
          <div className="flex flex-wrap gap-3">
            <Button type="button" onClick={() => setAxis(confirmAxis.slot, confirmAxis.code)}>
              Discard the grid and change it
            </Button>
            <Button type="button" variant="outline" onClick={() => setConfirmAxis(null)}>
              Leave it as it is
            </Button>
          </div>
        </div>
      )}

      {value.axes.map((axis) => {
        const candidate = candidateFor(candidates, axis)
        if (!candidate) return null
        const picked = value.values[axis] ?? []
        // An option that would take the grid past the cap is offered disabled,
        // with the arithmetic said out loud — refused BEFORE the pick rather
        // than after, which is the difference between a rule and a trap.
        const options = candidate.options.map((option) => ({
          value: option.code,
          label: option.label,
          disabled:
            !picked.includes(option.code) && countIfAdded(value, axis, option.code) > MAX_COMBINATIONS,
        }))
        const nextWouldExceed = options.some((o) => o.disabled)
        return (
          <div key={axis} className="flex flex-col gap-2">
            <MultiSelect
              id={`variation-values-${axis}`}
              label={`${candidate.label} values`}
              description={
                nextWouldExceed
                  ? `One more ${candidate.label.toLowerCase()} would take this past ${MAX_COMBINATIONS} combinations, which is the cap. Sell the rest as a separate listing.`
                  : `Only the values the catalogue already knows. ${count} of ${MAX_COMBINATIONS} combinations so far.`
              }
              placeholder={`Choose the ${candidate.label.toLowerCase()}s you stock…`}
              options={options}
              value={picked}
              onChange={(next) => setValues(axis, next)}
            />
            {/* The swatch a colour-like list carries, which a chip of text
                cannot show. Only rendered when the catalogue actually has one. */}
            {picked.some((code) => candidate.options.find((o) => o.code === code)?.swatchHex) && (
              <ul className="flex flex-wrap gap-2">
                {picked.map((code) => {
                  const option = candidate.options.find((o) => o.code === code)
                  if (!option?.swatchHex) return null
                  return (
                    <li
                      key={code}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-700"
                    >
                      <span
                        aria-hidden="true"
                        data-testid={`swatch-${code}`}
                        className="h-3 w-3 rounded-full border border-black/10"
                        style={{ backgroundColor: option.swatchHex }}
                      />
                      {option.label}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )
      })}

      {on && rows.length === 0 && (
        <p className="flex items-start gap-2 rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          Pick a value on every axis and the grid appears here, one row per combination.
        </p>
      )}

      {rows.length > 0 && (
        <>
          <p className="text-xs text-gray-500" data-testid="combination-count">
            {rows.filter((r) => !r.stranded).length} combinations · {MAX_COMBINATIONS} is the most a
            listing may have
          </p>

          <Table aria-label="Variant grid">
            <THead>
              <TR>
                {value.axes.map((axis) => (
                  <TH key={axis}>{candidateFor(candidates, axis)?.label ?? axis}</TH>
                ))}
                <TH>SKU</TH>
                <TH>MRP</TH>
                <TH>Selling price</TH>
                <TH>Stock</TH>
                <TH>Sell it</TH>
              </TR>
            </THead>
            <TBody>
              {/* Apply-to-all. It is a row of the table rather than a panel
                  above it so the control sits in the column it fills. */}
              <TR data-testid="apply-to-all">
                <TD colSpan={value.axes.length} className="text-xs text-gray-500">
                  Fill every row
                </TD>
                <TD className="text-xs text-gray-400">Each row needs its own</TD>
                {(
                  [
                    ["mrp", "MRP"],
                    ["price", "selling price"],
                    ["stock", "stock"],
                  ] as const
                ).map(([field, label]) => (
                  <TD key={field}>
                    <div className="flex items-center gap-1">
                      <Input
                        aria-label={`${label} for every row`}
                        inputMode={field === "stock" ? "numeric" : "decimal"}
                        value={fill[field]}
                        onChange={(e) => setFill({ ...fill, [field]: e.target.value })}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        aria-label={`Apply ${label} to every row`}
                        onClick={() => fillColumn(field, label)}
                      >
                        Apply
                      </Button>
                    </div>
                  </TD>
                ))}
                <TD />
              </TR>

              {rows.flatMap((row) => {
                const rowProblems = problems[row.key] ?? []
                const locked = !!row.variantId
                return [
                  <TR key={row.key} data-testid={`row-${row.key}`} data-sku={row.sku}>
                    {value.axes.map((axis) => {
                      const candidate = candidateFor(candidates, axis)
                      const option = candidate?.options.find((o) => o.code === row.combo[axis])
                      return (
                        <TD key={axis} className="whitespace-nowrap">
                          {option?.swatchHex && (
                            <span
                              aria-hidden="true"
                              className="mr-1.5 inline-block h-3 w-3 rounded-full border border-black/10 align-middle"
                              style={{ backgroundColor: option.swatchHex }}
                            />
                          )}
                          {option?.label ?? row.combo[axis] ?? "—"}
                        </TD>
                      )
                    })}
                    <TD>
                      <Input
                        aria-label={`SKU for ${describe(row)}`}
                        value={row.sku}
                        disabled={locked}
                        title={
                          locked
                            ? "A variant's SKU cannot be changed once it exists — orders and stock rows reference it."
                            : undefined
                        }
                        onChange={(e) => updateRow(row, { sku: e.target.value })}
                        onBlur={() => {
                          if (row.sku.trim() === "")
                            updateRow(row, { sku: suggestSku(stem, value.axes, row.combo) })
                        }}
                      />
                    </TD>
                    <TD>
                      <Input
                        aria-label={`MRP for ${describe(row)}`}
                        inputMode="decimal"
                        value={row.mrp}
                        onChange={(e) => updateRow(row, { mrp: e.target.value })}
                      />
                    </TD>
                    <TD>
                      <Input
                        aria-label={`Selling price for ${describe(row)}`}
                        inputMode="decimal"
                        value={row.price}
                        onChange={(e) => updateRow(row, { price: e.target.value })}
                      />
                    </TD>
                    <TD>
                      <Input
                        aria-label={`Stock for ${describe(row)}`}
                        inputMode="numeric"
                        value={row.stock}
                        disabled={locked}
                        title={
                          locked
                            ? "Stock on a variant that already exists moves through the stock ledger, not this form."
                            : undefined
                        }
                        onChange={(e) => updateRow(row, { stock: e.target.value })}
                      />
                    </TD>
                    <TD>
                      <Checkbox
                        id={`include-${row.key}`}
                        label={<span className="sr-only">Sell {describe(row)}</span>}
                        checked={row.included}
                        disabled={locked}
                        onChange={(next) => updateRow(row, { included: next })}
                      />
                      {locked && (
                        <span className="mt-1 block text-[11px] text-gray-400">
                          Already listed
                        </span>
                      )}
                    </TD>
                  </TR>,
                  // The problem sits in its own row directly under the one it
                  // belongs to, rather than in a banner the seller has to map
                  // back onto twelve near-identical lines.
                  ...(rowProblems.length > 0
                    ? [
                        <TR key={`${row.key}-problems`} data-testid={`problems-${row.key}`}>
                          <TD colSpan={value.axes.length + 5} className="py-2">
                            <ul className="flex flex-col gap-1">
                              {rowProblems.map((message) => (
                                <li key={message} className="text-xs text-red-600">
                                  {describe(row)}: {message}
                                </li>
                              ))}
                            </ul>
                          </TD>
                        </TR>,
                      ]
                    : []),
                ]
              })}
            </TBody>
          </Table>

          <p aria-live="polite" className="text-xs text-gray-500">
            {announcement}
          </p>
        </>
      )}
    </section>
  )
}
