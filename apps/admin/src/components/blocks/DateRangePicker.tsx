"use client"

import { useEffect, useId, useState } from "react"
import { CalendarRange } from "lucide-react"
import { DATE_PRESETS, matchPreset, normaliseRange, presetRange, type DateRange } from "@/lib/blocks/dateRange"
import { inputClass } from "./buttons"

/**
 * Preset chips plus two native date inputs. Native inputs keep the keyboard
 * and screen-reader behaviour the platform already gets right; the logic
 * (inclusive days, swapped ends, a maximum span) is in lib/blocks/dateRange.ts.
 */
export function DateRangePicker({
  value,
  onChange,
  maxDays,
  label = "Date range",
  today = new Date(),
}: {
  value: DateRange
  onChange: (range: DateRange) => void
  maxDays?: number
  label?: string
  today?: Date
}) {
  const [draft, setDraft] = useState(value)
  const fromId = useId()
  const toId = useId()
  const active = matchPreset(value, today)

  useEffect(() => setDraft(value), [value])

  const commit = (next: DateRange) => {
    setDraft(next)
    const range = normaliseRange(next, maxDays)
    if (range && (range.from !== value.from || range.to !== value.to)) onChange(range)
  }

  return (
    <fieldset className="flex flex-wrap items-center gap-2">
      <legend className="sr-only">{label}</legend>
      <CalendarRange className="h-4 w-4 text-mo-body" aria-hidden="true" />
      <div className="flex flex-wrap gap-1" role="group" aria-label="Presets">
        {DATE_PRESETS.filter((p) => !maxDays || p.days <= maxDays).map((preset) => (
          <button
            key={preset.id}
            type="button"
            aria-pressed={active === preset.id}
            onClick={() => commit(presetRange(preset.id, today))}
            className={[
              "rounded-mo-pill border px-2.5 py-1 text-xs",
              active === preset.id ? "border-mo-focus bg-mo-raised text-mo-ink" : "border-mo text-mo-body hover:text-mo-ink",
            ].join(" ")}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <label htmlFor={fromId} className="sr-only">
        From
      </label>
      <input
        id={fromId}
        type="date"
        value={draft.from}
        max={draft.to}
        onChange={(e) => commit({ ...draft, from: e.target.value })}
        className={`${inputClass} w-auto py-1`}
      />
      <span className="text-mo-body" aria-hidden="true">
        –
      </span>
      <label htmlFor={toId} className="sr-only">
        To
      </label>
      <input
        id={toId}
        type="date"
        value={draft.to}
        min={draft.from}
        onChange={(e) => commit({ ...draft, to: e.target.value })}
        className={`${inputClass} w-auto py-1`}
      />
    </fieldset>
  )
}
