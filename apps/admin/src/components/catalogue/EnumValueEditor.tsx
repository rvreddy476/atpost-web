"use client"

import { useState } from "react"
import { ArrowDown, ArrowUp, ClipboardPaste, Plus } from "lucide-react"
import { Button, Input, Table, TBody, TD, TH, THead, TR, Textarea } from "@atpost/ui"
import type { DefinitionRecord } from "@/lib/catalogue"
import { commands, useEnumValues, type CatalogueRunner } from "@/hooks/useCatalogue"

/** Colour-like fields get a swatch; nothing else needs one. */
function looksLikeColour(definition: DefinitionRecord): boolean {
  return /colou?r|shade|finish/i.test(`${definition.code} ${definition.label}`)
}

function slugifyCode(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
}

/**
 * Parse the bulk-paste box: one option per line, `code,label` accepted.
 * A line with no comma is the label, and its code is derived — which is what
 * someone pasting a column out of a spreadsheet actually has.
 */
export function parseBulkOptions(text: string): { code: string; label: string }[] {
  const seen = new Set<string>()
  const rows: { code: string; label: string }[] = []
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (trimmed === "") continue
    const comma = trimmed.indexOf(",")
    const code = comma === -1 ? slugifyCode(trimmed) : slugifyCode(trimmed.slice(0, comma))
    const label = comma === -1 ? trimmed : trimmed.slice(comma + 1).trim() || trimmed
    if (code === "" || seen.has(code)) continue
    seen.add(code)
    rows.push({ code, label })
  }
  return rows
}

export function EnumValueEditor({
  definition,
  runner,
}: {
  definition: DefinitionRecord
  runner: CatalogueRunner
}) {
  const values = useEnumValues(definition.id)
  const rows = values.data ?? []
  const swatches = looksLikeColour(definition)

  const [newLabel, setNewLabel] = useState("")
  const [newCode, setNewCode] = useState("")
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulk, setBulk] = useState("")

  const bulkRows = parseBulkOptions(bulk)
  const nextOrder = rows.reduce((max, r) => Math.max(max, r.sort_order), -1) + 1

  function addOption() {
    const label = newLabel.trim()
    const code = slugifyCode(newCode || label)
    if (label === "" || code === "") return
    runner.run(
      commands.createEnumValue(
        definition.id,
        { code, value: code, label, sort_order: nextOrder, is_active: true },
        label,
      ),
    )
    setNewLabel("")
    setNewCode("")
  }

  function onEnter(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return
    event.preventDefault()
    addOption()
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= rows.length) return
    const order = rows.map((r) => r.id)
    ;[order[index], order[target]] = [order[target], order[index]]
    runner.run(commands.reorderEnumValues(definition.id, order))
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-gray-900">
          Options{rows.length > 0 && <span className="ml-1 text-gray-400">({rows.length})</span>}
        </h4>
        {/* type="button" on every control in here: this editor renders inside
            the definition form, where an untyped button submits it. */}
        <Button type="button" size="sm" variant="ghost" onClick={() => setBulkOpen((o) => !o)}>
          <ClipboardPaste className="h-3.5 w-3.5" aria-hidden="true" />
          {bulkOpen ? "Hide bulk paste" : "Bulk paste"}
        </Button>
      </div>

      {bulkOpen && (
        <div className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-gray-50 p-3">
          <Textarea
            label="One option per line"
            description="“Navy Blue” on its own is enough; “navy_blue,Navy Blue” sets the stored code too."
            value={bulk}
            minRows={4}
            onChange={setBulk}
            placeholder={"navy_blue,Navy Blue\nOlive\nCharcoal"}
          />
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-gray-500">
              {bulkRows.length === 0
                ? "Nothing to add yet."
                : `${bulkRows.length} option${bulkRows.length === 1 ? "" : "s"} ready — ${bulkRows
                    .slice(0, 3)
                    .map((r) => r.code)
                    .join(", ")}${bulkRows.length > 3 ? "…" : ""}`}
            </p>
            <Button
              type="button"
              size="sm"
              disabled={bulkRows.length === 0 || runner.isPending}
              onClick={() => {
                runner.run(commands.bulkCreateEnumValues(definition.id, bulkRows, nextOrder))
                setBulk("")
              }}
            >
              Add {bulkRows.length || ""} options
            </Button>
          </div>
        </div>
      )}

      <Table
        loading={values.isLoading}
        empty={rows.length === 0}
        emptyMessage="No options yet. Add one below, or paste a list."
        error={values.error ? "Could not load this attribute's options." : null}
      >
        <THead>
          <TR>
            <TH>Label</TH>
            <TH>Code</TH>
            {swatches && <TH>Swatch</TH>}
            <TH className="text-center">Offered</TH>
            <TH className="text-right">Order</TH>
          </TR>
        </THead>
        <TBody>
          {rows.map((row, index) => (
            <TR key={row.id} className={row.is_active ? undefined : "opacity-60"}>
              <TD>
                <Input
                  aria-label={`Label for ${row.code}`}
                  defaultValue={row.label}
                  disabled={runner.isPending}
                  className="h-8"
                  onBlur={(e) => {
                    const next = e.target.value.trim()
                    if (next === "" || next === row.label) return
                    runner.run(
                      commands.patchEnumValue(
                        definition.id,
                        row.id,
                        { label: next },
                        `Rename the option “${row.label}” to “${next}”.`,
                        `Option renamed to “${next}”`,
                      ),
                    )
                  }}
                />
              </TD>
              <TD>
                {/* The stored value. Renaming a label is free; changing a code
                    would orphan every listing that already chose it. */}
                <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
                  {row.code}
                </code>
              </TD>
              {swatches && (
                <TD>
                  <input
                    type="color"
                    aria-label={`Swatch colour for ${row.label}`}
                    defaultValue={row.swatch_hex ?? "#cccccc"}
                    disabled={runner.isPending}
                    className="h-7 w-10 cursor-pointer rounded border border-gray-300 bg-white"
                    onBlur={(e) => {
                      const next = e.target.value
                      if (next === row.swatch_hex) return
                      runner.run(
                        commands.patchEnumValue(
                          definition.id,
                          row.id,
                          { swatch_hex: next },
                          `Set the swatch for “${row.label}”.`,
                          `Swatch set for “${row.label}”`,
                        ),
                      )
                    }}
                  />
                </TD>
              )}
              <TD className="text-center">
                <input
                  type="checkbox"
                  aria-label={`Offer ${row.label} to sellers`}
                  checked={row.is_active}
                  disabled={runner.isPending}
                  onChange={(e) =>
                    runner.run(
                      commands.patchEnumValue(
                        definition.id,
                        row.id,
                        { is_active: e.target.checked },
                        e.target.checked
                          ? `Offer “${row.label}” again.`
                          : `Retire the option “${row.label}” — sellers can no longer choose it.`,
                        e.target.checked
                          ? `“${row.label}” is offered again`
                          : `“${row.label}” retired`,
                      ),
                    )
                  }
                  className="h-4 w-4 rounded border-gray-300 accent-gray-900 disabled:opacity-40"
                />
              </TD>
              <TD>
                <div className="flex justify-end gap-1">
                  <button
                    type="button"
                    aria-label={`Move ${row.label} up`}
                    disabled={index === 0 || runner.isPending}
                    onClick={() => move(index, -1)}
                    className="rounded p-1 text-gray-400 hover:bg-gray-100 disabled:opacity-30"
                  >
                    <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${row.label} down`}
                    disabled={index === rows.length - 1 || runner.isPending}
                    onClick={() => move(index, 1)}
                    className="rounded p-1 text-gray-400 hover:bg-gray-100 disabled:opacity-30"
                  >
                    <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>

      {/* A div, not a <form>: this editor is rendered inside the definition
          form, and a nested form is invalid HTML that React refuses to
          hydrate. Enter is wired by hand instead. */}
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-gray-700">
          New option
          <Input
            value={newLabel}
            aria-label="New option label"
            placeholder="Navy Blue"
            className="h-9"
            onKeyDown={onEnter}
            onChange={(e) => setNewLabel(e.target.value)}
          />
        </label>
        <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-gray-700">
          Code
          <Input
            value={newCode}
            aria-label="New option code"
            placeholder={slugifyCode(newLabel) || "navy_blue"}
            className="h-9"
            onKeyDown={onEnter}
            onChange={(e) => setNewCode(e.target.value)}
          />
        </label>
        <Button
          type="button"
          size="sm"
          onClick={addOption}
          disabled={newLabel.trim() === "" || runner.isPending}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add
        </Button>
      </div>
    </div>
  )
}
