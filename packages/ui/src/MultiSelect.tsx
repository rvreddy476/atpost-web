"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Check, ChevronDown, X } from "lucide-react"
import { cn } from "./cn"
import { FieldShell, controlBorder, controlSurface, useFieldIds } from "./Field"
import type { SelectOption } from "./Select"

/** Past this many options a list is faster to search than to scan. */
const SEARCH_THRESHOLD = 10

export interface MultiSelectProps {
  label?: string
  value: string[]
  onChange: (value: string[]) => void
  options: SelectOption[]
  placeholder?: string
  description?: React.ReactNode
  error?: string | null
  invalid?: boolean
  /** Hard cap. Once reached, unselected options are disabled rather than hidden. */
  maxSelections?: number
  searchPlaceholder?: string
  emptyMessage?: string
  id?: string
  name?: string
  required?: boolean
  disabled?: boolean
  className?: string
}

/**
 * Chips plus a pop-over menu over a supplied option list. No combobox library:
 * the menu is a plain listbox of buttons, which keeps the bundle honest and the
 * keyboard behaviour something we can actually read. Every chip's remove
 * control and the menu trigger are real buttons — nothing interactive is
 * nested inside anything else interactive.
 */
export function MultiSelect({
  label,
  value,
  onChange,
  options,
  placeholder = "Select…",
  description,
  error,
  invalid,
  maxSelections,
  searchPlaceholder = "Search options",
  emptyMessage = "No matching options",
  id,
  name,
  required,
  disabled,
  className,
}: MultiSelectProps) {
  const ids = useFieldIds(id, { error, description })
  const isInvalid = invalid ?? !!error
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const rootRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const listboxId = `${ids.fieldId}-listbox`
  const showSearch = options.length > SEARCH_THRESHOLD
  const atCap = maxSelections !== undefined && value.length >= maxSelections

  const byValue = useMemo(() => new Map(options.map((o) => [o.value, o])), [options])
  const visible = useMemo(() => {
    if (!showSearch || query.trim() === "") return options
    const needle = query.trim().toLowerCase()
    return options.filter((o) => o.label.toLowerCase().includes(needle))
  }, [options, query, showSearch])

  // Close on an outside click or Escape, and put the caret in the search box on
  // open. Listeners are bound only while open so a page full of these does not
  // keep one each.
  useEffect(() => {
    if (!open) return
    searchRef.current?.focus()
    function onPointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("mousedown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [open])

  function toggle(optionValue: string) {
    if (value.includes(optionValue)) {
      onChange(value.filter((v) => v !== optionValue))
      return
    }
    if (atCap) return
    onChange([...value, optionValue])
  }

  return (
    <FieldShell
      ids={ids}
      label={label}
      description={description}
      error={error}
      required={required}
      disabled={disabled}
      labelAsGroup
      className={className}
    >
      <div ref={rootRef} className="relative">
        <div
          className={cn(
            controlSurface,
            controlBorder(isInvalid),
            "flex min-h-10 items-center gap-2 px-2 py-1.5",
            disabled && "cursor-not-allowed opacity-50",
          )}
        >
          <div className="flex flex-1 flex-wrap items-center gap-1">
            {value.length === 0 ? (
              <span className="px-1 py-1 text-sm text-brand-text/40">{placeholder}</span>
            ) : (
              value.map((v) => {
                const optionLabel = byValue.get(v)?.label ?? v
                return (
                  <span
                    key={v}
                    className="inline-flex items-center gap-1 rounded-lg bg-brand-text/10 py-0.5 pl-2 pr-1 text-xs text-brand-text"
                  >
                    {optionLabel}
                    <button
                      type="button"
                      disabled={disabled}
                      aria-label={`Remove ${optionLabel}`}
                      onClick={() => onChange(value.filter((x) => x !== v))}
                      className="rounded-full p-0.5 hover:bg-brand-text/20 disabled:pointer-events-none"
                    >
                      <X aria-hidden="true" className="h-3 w-3" />
                    </button>
                  </span>
                )
              })
            )}
          </div>
          <button
            type="button"
            id={ids.fieldId}
            disabled={disabled}
            // combobox rather than the implicit button role: it is the role that
            // actually supports aria-expanded, aria-controls and aria-invalid.
            role="combobox"
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-controls={listboxId}
            aria-invalid={isInvalid || undefined}
            aria-describedby={ids.describedBy}
            aria-labelledby={label ? `${ids.fieldId}-label` : undefined}
            onClick={() => setOpen((o) => !o)}
            className="shrink-0 rounded-lg p-1 text-brand-text/40 hover:bg-brand-text/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-text/50 disabled:pointer-events-none"
          >
            <ChevronDown aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>

        {maxSelections !== undefined && (
          <p className="mt-1 text-right text-[11px] text-brand-text/50">
            {value.length} / {maxSelections} selected
          </p>
        )}

        {open && (
          <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl border border-brand-text/20 bg-brand-card shadow-lg">
            {showSearch && (
              <div className="border-b border-brand-text/10 p-2">
                <input
                  ref={searchRef}
                  type="search"
                  value={query}
                  aria-label={searchPlaceholder}
                  placeholder={searchPlaceholder}
                  onChange={(e) => setQuery(e.target.value)}
                  className="h-8 w-full rounded-lg border border-brand-text/20 bg-brand-bg px-2 text-sm text-brand-text placeholder:text-brand-text/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-text/50"
                />
              </div>
            )}
            <ul id={listboxId} role="listbox" aria-multiselectable="true" className="max-h-56 overflow-y-auto py-1">
              {visible.length === 0 && (
                <li className="px-3 py-2 text-sm text-brand-text/50">{emptyMessage}</li>
              )}
              {visible.map((option) => {
                const selected = value.includes(option.value)
                const blocked = option.disabled || (!selected && atCap)
                return (
                  <li key={option.value} role="option" aria-selected={selected}>
                    <button
                      type="button"
                      disabled={blocked}
                      onClick={() => toggle(option.value)}
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-brand-text hover:bg-brand-text/5",
                        blocked && "cursor-not-allowed opacity-40 hover:bg-transparent",
                      )}
                    >
                      <span
                        className={cn(
                          "grid h-4 w-4 shrink-0 place-items-center rounded border",
                          selected
                            ? "border-brand-text bg-brand-text text-brand-card"
                            : "border-brand-text/30",
                        )}
                      >
                        {selected && <Check aria-hidden="true" className="h-3 w-3" />}
                      </span>
                      {option.label}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {name && <input type="hidden" name={name} value={value.join(",")} />}
      </div>
    </FieldShell>
  )
}
