"use client"

import { useMemo, useState } from "react"
import { ArrowDown, ArrowUp, CornerDownRight, EyeOff, Plus, Settings2, Undo2 } from "lucide-react"
import type { Category } from "@atpost/types/commerce"
import { Button, Select, Table, TBody, TD, TH, THead, TR } from "@atpost/ui"
import {
  bindingToWire,
  categoryPath,
  type CategoryAttributeBinding,
  type DefinitionRecord,
  type EffectiveBinding,
} from "@/lib/catalogue"
import {
  commands,
  useAncestorAttributes,
  useCategoryAttributes,
  type CatalogueRunner,
} from "@/hooks/useCatalogue"

/**
 * The attributes one category asks for: the bindings it owns, plus the ones it
 * inherits from its ancestors.
 *
 * Inheritance is resolved here from each ancestor's own bindings rather than
 * from the flattened effective schema, because only this walk knows which
 * ancestor a row came from. Without that, `brand` gets retyped into twelve
 * sibling categories and the twelve copies drift apart within a month.
 */
export function CategoryAttributes({
  category,
  categories,
  definitions,
  runner,
  onEditDefinition,
  onCreateDefinition,
}: {
  category: Category
  categories: Category[]
  definitions: DefinitionRecord[]
  runner: CatalogueRunner
  onEditDefinition: (definition: DefinitionRecord) => void
  onCreateDefinition: () => void
}) {
  const path = categoryPath(categories, category.id)
  const ancestors = path.slice(0, -1)
  const own = useCategoryAttributes(category.id)
  const ancestorRows = useAncestorAttributes(ancestors.map((a) => a.id))
  const [adding, setAdding] = useState("")

  const ownRows = useMemo(() => own.data ?? [], [own.data])

  /** Nearest ancestor wins; an ancestor's own exclusion hides its parents' row. */
  const inherited = useMemo(() => {
    const map = new Map<string, { binding: CategoryAttributeBinding; from: Category }>()
    ancestors.forEach((ancestor, index) => {
      for (const binding of ancestorRows[index]?.data ?? []) {
        map.set(binding.attribute_definition_id, { binding, from: ancestor })
      }
    })
    return map
    // ancestorRows is a fresh array each render; its data identities are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ancestors.map((a) => a.id).join(","), ancestorRows.map((r) => r.dataUpdatedAt).join(",")])

  const rows: EffectiveBinding[] = useMemo(() => {
    const ownIds = new Set(ownRows.map((b) => b.attribute_definition_id))
    // An own row marked is_excluded exists only to hide an inherited one. It is
    // not a field this category asks for, so it belongs in the "Excluded here"
    // strip below the table rather than as a live row in it.
    const mine: EffectiveBinding[] = ownRows
      .filter((b) => !b.is_excluded)
      .map((b) => ({ ...b, inherited_from: null }))
    const handed: EffectiveBinding[] = []
    for (const [defId, entry] of inherited) {
      if (ownIds.has(defId) || entry.binding.is_excluded) continue
      handed.push({
        ...entry.binding,
        inherited_from: { id: entry.from.id, name: entry.from.name },
      })
    }
    return [...mine, ...handed].sort((a, b) => a.sort_order - b.sort_order)
  }, [ownRows, inherited])

  // Bound means "already accounted for here", excluded rows included — offering
  // to re-add one from the dropdown would silently contradict the exclusion.
  const boundIds = new Set([
    ...ownRows.map((b) => b.attribute_definition_id),
    ...inherited.keys(),
  ])
  const available = definitions.filter((d) => !boundIds.has(d.id) && d.is_active)

  /** Every edit on this screen is a PUT of the category's whole own list. */
  function putOwn(next: CategoryAttributeBinding[], what: string, success: string) {
    runner.run(
      commands.setCategoryAttributes(
        category.id,
        next.map((row, index) => bindingToWire({ ...row, sort_order: index })),
        what,
        success,
      ),
    )
  }

  function toggleFlag(
    row: EffectiveBinding,
    key: "is_required" | "is_variant_axis" | "is_filterable",
    value: boolean,
  ) {
    const words: Record<typeof key, string> = {
      is_required: value ? "required" : "optional",
      is_variant_axis: value ? "a variant axis" : "not a variant axis",
      is_filterable: value ? "filterable" : "not filterable",
    }
    const next = ownRows.map((b) =>
      b.attribute_definition_id === row.attribute_definition_id ? { ...b, [key]: value } : b,
    )
    putOwn(
      next,
      `Make “${row.label}” ${words[key]} in ${category.name}.`,
      `“${row.label}” is now ${words[key]}`,
    )
  }

  function override(row: EffectiveBinding) {
    putOwn(
      [...ownRows, { ...row, is_excluded: false, sort_order: ownRows.length }],
      `Copy “${row.label}” down from ${row.inherited_from?.name} as an explicit binding on ${category.name}.`,
      `“${row.label}” is now set here`,
    )
  }

  function exclude(row: EffectiveBinding) {
    putOwn(
      [...ownRows, { ...row, is_excluded: true, sort_order: ownRows.length }],
      `Stop asking for “${row.label}” in ${category.name}, even though ${row.inherited_from?.name} does.`,
      `“${row.label}” excluded here`,
    )
  }

  function unbind(row: EffectiveBinding) {
    const next = ownRows.filter((b) => b.attribute_definition_id !== row.attribute_definition_id)
    putOwn(
      next,
      row.is_excluded
        ? `Let “${row.label}” be inherited again in ${category.name}.`
        : `Stop asking for “${row.label}” in ${category.name}.`,
      row.is_excluded ? `“${row.label}” inherited again` : `“${row.label}” removed here`,
    )
  }

  function move(row: EffectiveBinding, direction: -1 | 1) {
    const index = ownRows.findIndex(
      (b) => b.attribute_definition_id === row.attribute_definition_id,
    )
    const target = index + direction
    if (index < 0 || target < 0 || target >= ownRows.length) return
    const next = ownRows.slice()
    ;[next[index], next[target]] = [next[target], next[index]]
    putOwn(next, `Reorder “${row.label}” in ${category.name}.`, "Field order saved")
  }

  function add(definitionId: string) {
    const definition = definitions.find((d) => d.id === definitionId)
    if (!definition) return
    putOwn(
      [
        ...ownRows,
        {
          attribute_definition_id: definition.id,
          code: definition.code,
          label: definition.label,
          data_type: definition.data_type,
          scope: definition.scope,
          is_required: definition.is_required,
          is_variant_axis: definition.is_variant_axis,
          is_filterable: definition.is_filterable,
          is_excluded: false,
          sort_order: ownRows.length,
          raw: {},
        },
      ],
      `Ask for “${definition.label}” in ${category.name}.`,
      `“${definition.label}” added to ${category.name}`,
    )
    setAdding("")
  }

  const excludedRows = ownRows.filter((b) => b.is_excluded)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <Select
          label="Add an existing attribute"
          className="min-w-64"
          value={adding}
          placeholder={available.length === 0 ? "Every attribute is already here" : "Choose an attribute…"}
          options={available.map((d) => ({ value: d.id, label: `${d.label} (${d.code})` }))}
          onChange={(value) => {
            setAdding(value)
            if (value) add(value)
          }}
          disabled={available.length === 0 || runner.isPending}
        />
        <Button variant="outline" onClick={onCreateDefinition}>
          <Plus className="h-4 w-4" aria-hidden="true" /> New attribute
        </Button>
      </div>

      <Table
        // The flag columns plus two actions are wider than a narrow pane; let
        // the table scroll rather than clip the Exclude button off the edge.
        wrapperClassName="overflow-x-auto"
        loading={own.isLoading}
        empty={rows.length === 0 && excludedRows.length === 0}
        emptyMessage={`${category.name} asks for nothing yet. Add an attribute above.`}
        error={own.error ? "Could not load this category's attributes." : null}
      >
        <THead>
          <TR>
            <TH>Attribute</TH>
            <TH>Source</TH>
            <TH className="text-center">Required</TH>
            <TH className="whitespace-nowrap text-center">Variant axis</TH>
            <TH className="text-center">Filterable</TH>
            <TH className="text-right">Order</TH>
            <TH className="text-right">Actions</TH>
          </TR>
        </THead>
        <TBody>
          {rows.map((row) => {
            const isInherited = row.inherited_from !== null
            const definition = definitions.find((d) => d.id === row.attribute_definition_id)
            return (
              <TR
                key={row.attribute_definition_id}
                className={isInherited ? "text-gray-500" : undefined}
              >
                <TD>
                  <div className="flex items-center gap-2">
                    {isInherited && (
                      <CornerDownRight
                        className="h-3.5 w-3.5 shrink-0 text-gray-400"
                        aria-hidden="true"
                      />
                    )}
                    <span className={isInherited ? "" : "font-medium text-gray-900"}>
                      {row.label}
                    </span>
                    <code className="rounded bg-gray-100 px-1 text-[11px] text-gray-500">
                      {row.code}
                    </code>
                    <span className="text-[11px] uppercase text-gray-400">{row.data_type}</span>
                  </div>
                </TD>
                <TD>
                  {isInherited ? (
                    <span className="whitespace-nowrap rounded-full bg-gray-100 px-2 py-0.5 text-[11px]">
                      inherited from {row.inherited_from?.name}
                    </span>
                  ) : (
                    <span className="text-[11px] uppercase tracking-wide text-gray-400">
                      set here
                    </span>
                  )}
                </TD>
                <TD className="text-center">
                  <FlagCell
                    checked={row.is_required}
                    disabled={isInherited || runner.isPending}
                    label={`${row.label} required`}
                    onChange={(v) => toggleFlag(row, "is_required", v)}
                  />
                </TD>
                <TD className="text-center">
                  <FlagCell
                    checked={row.is_variant_axis}
                    disabled={isInherited || runner.isPending}
                    label={`${row.label} variant axis`}
                    onChange={(v) => toggleFlag(row, "is_variant_axis", v)}
                  />
                </TD>
                <TD className="text-center">
                  <FlagCell
                    checked={row.is_filterable}
                    disabled={isInherited || runner.isPending}
                    label={`${row.label} filterable`}
                    onChange={(v) => toggleFlag(row, "is_filterable", v)}
                  />
                </TD>
                <TD>
                  <div className="flex items-center justify-end gap-1">
                    <span className="tabular-nums text-xs text-gray-400">{row.sort_order}</span>
                    <button
                      type="button"
                      aria-label={`Move ${row.label} up`}
                      disabled={isInherited || runner.isPending}
                      onClick={() => move(row, -1)}
                      className="rounded p-1 text-gray-400 hover:bg-gray-100 disabled:opacity-30"
                    >
                      <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Move ${row.label} down`}
                      disabled={isInherited || runner.isPending}
                      onClick={() => move(row, 1)}
                      className="rounded p-1 text-gray-400 hover:bg-gray-100 disabled:opacity-30"
                    >
                      <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </TD>
                <TD>
                  <div className="flex justify-end gap-1">
                    {definition && (
                      <button
                        type="button"
                        aria-label={`Edit the ${row.label} definition`}
                        title="Edit definition"
                        onClick={() => onEditDefinition(definition)}
                        className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                      >
                        <Settings2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    )}
                    {isInherited ? (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={runner.isPending}
                          onClick={() => override(row)}
                        >
                          Override
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={runner.isPending}
                          onClick={() => exclude(row)}
                        >
                          <EyeOff className="h-3.5 w-3.5" aria-hidden="true" /> Exclude
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={runner.isPending}
                        onClick={() => unbind(row)}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                </TD>
              </TR>
            )
          })}
        </TBody>
      </Table>

      {excludedRows.length > 0 && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
            Excluded here
          </p>
          <ul className="flex flex-col gap-1">
            {excludedRows.map((row) => (
              <li
                key={row.attribute_definition_id}
                className="flex items-center justify-between gap-2 text-sm text-gray-600"
              >
                <span>
                  {row.label} <code className="text-xs text-gray-400">{row.code}</code> — inherited,
                  but not asked for in {category.name}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={runner.isPending}
                  onClick={() => unbind({ ...row, inherited_from: null })}
                >
                  <Undo2 className="h-3.5 w-3.5" aria-hidden="true" /> Inherit again
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/**
 * A bare checkbox in a table cell. @atpost/ui's Checkbox is a full labelled row
 * — right for a form, far too tall for a dense grid — so this is the same
 * native control with an accessible name and none of the chrome.
 */
function FlagCell({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean
  disabled: boolean
  label: string
  onChange: (value: boolean) => void
}) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      checked={checked}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
      className="h-4 w-4 rounded border-gray-300 accent-gray-900 disabled:opacity-40"
    />
  )
}
