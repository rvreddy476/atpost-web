"use client"

import { useEffect, useState } from "react"
import type { AttributeDefinition, AttributeValue } from "@atpost/types/commerce"
import { isKnownAttributeDataType } from "@atpost/types/commerce"
import { formatMinor, parseMinor } from "@atpost/form"
import {
  DatePicker,
  FieldShell,
  Input,
  MultiSelect,
  NumberInput,
  Select,
  Switch,
  Textarea,
  useFieldIds,
} from "@atpost/ui"

/*
 * ── Why this is not shared with apps/admin's SellerFormPreview ─────────────
 *
 * The admin console renders the same AttributeSchema in
 * `apps/admin/src/components/catalogue/SellerFormPreview.tsx`, and the obvious
 * move is to lift one renderer into a package both import. It was considered
 * and declined, because the two are not the same component wearing different
 * labels — three of the thirteen arms have to behave differently, and each
 * difference is load-bearing:
 *
 *   money_minor — the preview takes minor units, because the founder is
 *     checking that a bound authored in paise is the bound they meant. A seller
 *     types rupees and must be refused a third decimal (`parseMinor` below),
 *     because rounding somebody's price is not ours to do.
 *   unknown     — the preview lets the founder type into an unrecognised field;
 *     here it is read-only and carried verbatim, so a seller is never rejected
 *     on a value their form invited them to invent.
 *   media       — the preview says "sellers see a picker here" and stops. This
 *     one edits the real media list that gets submitted.
 *
 * A single component with a `variant` prop would be those two implementations
 * sharing a roof, and the shared roof is the part that would rot. What actually
 * must not drift — the rules a listing is judged by — already lives in one
 * place: `@atpost/form` (validate, zodForSchema, parseMinor) and
 * `@atpost/types/commerce`. Both renderers import it, so a bound the console
 * previews is literally the bound the seller is held to.
 *
 * Known consequence worth naming rather than hiding: the console's money
 * preview shows paise where the seller sees rupees. Moving the console's arm to
 * rupees is the right follow-up; it belongs to whoever owns apps/admin.
 */

export interface AttributeFieldProps {
  def: AttributeDefinition
  value: AttributeValue | null
  onChange: (next: AttributeValue | null) => void
  error: string | null
}

/**
 * The option list, reading an option's identity under both the names the
 * catalogue uses for it.
 *
 * `GET …/attribute-schema` serves an option as `{code, label, swatch_hex}`;
 * this build's type has always called that field `value`. Reading only `value`
 * against the real endpoint builds a <select> whose every option carries
 * `undefined` — the control looks right, the seller picks "Blue", and nothing
 * is sent. Same rule as lib/variation.ts's optionCode, and for the same
 * reason: what travels has to be the option's own code.
 */
function optionsFor(def: AttributeDefinition) {
  return (def.values ?? [])
    .filter((v) => v.is_active !== false)
    .map((v) => ({ value: v.value || v.code || "", label: v.label }))
    .filter((o) => o.value !== "")
}

/** One attribute definition → one control. */
export function AttributeField({ def, value, onChange, error }: AttributeFieldProps) {
  // The unknown arm comes first and on its own test, not as a `default:` after
  // the known cases: a data type this build has never heard of must reach it
  // whatever the server calls the type.
  if (!isKnownAttributeDataType(def.data_type)) {
    return <UnknownField def={def} value={value} error={error} />
  }

  switch (def.data_type) {
    case "long_text":
      return (
        <Textarea
          id={`attr-${def.code}`}
          label={def.label}
          description={def.help_text}
          required={def.required}
          error={error}
          maxLength={def.max_len ?? undefined}
          showCounter={!!def.max_len}
          value={value?.type === "long_text" ? value.value : ""}
          onChange={(next) => onChange(next === "" ? null : { type: "long_text", value: next })}
        />
      )

    case "boolean":
      return (
        <Switch
          id={`attr-${def.code}`}
          label={def.label}
          description={def.help_text}
          error={error}
          checked={value?.type === "boolean" ? value.value : false}
          onChange={(next) => onChange({ type: "boolean", value: next })}
        />
      )

    case "enum": {
      const options = optionsFor(def)
      // No inline list means the options live behind `lookup_endpoint` and are
      // too many to enumerate. A select with nothing in it would be a dead end,
      // so the seller types the code and the server rules on it.
      if (options.length === 0) {
        return (
          <PlainTextField
            def={def}
            error={error}
            text={value?.type === "enum" ? value.value : ""}
            onText={(next) => onChange(next === "" ? null : { type: "enum", value: next })}
          />
        )
      }
      return (
        <Select
          id={`attr-${def.code}`}
          label={def.label}
          description={def.help_text}
          required={def.required}
          error={error}
          placeholder="Choose one…"
          options={options}
          value={value?.type === "enum" ? value.value : ""}
          onChange={(next) => onChange(next === "" ? null : { type: "enum", value: next })}
        />
      )
    }

    case "multi_enum":
      return (
        <MultiSelect
          id={`attr-${def.code}`}
          label={def.label}
          description={def.help_text}
          required={def.required}
          error={error}
          options={optionsFor(def)}
          maxSelections={def.max ?? undefined}
          value={value?.type === "multi_enum" ? value.value : []}
          onChange={(next) => onChange(next.length === 0 ? null : { type: "multi_enum", value: next })}
        />
      )

    case "integer":
      return (
        <NumberInput
          id={`attr-${def.code}`}
          label={def.label}
          description={def.help_text}
          required={def.required}
          error={error}
          mode="integer"
          min={def.min ?? undefined}
          max={def.max ?? undefined}
          value={value?.type === "integer" ? value.value : null}
          onChange={(next) => onChange(next === null ? null : { type: "integer", value: next })}
        />
      )

    case "decimal":
      // Held as text end to end. A decimal that round-trips through a JS number
      // comes back with a tail the seller never typed.
      return (
        <DecimalField
          def={def}
          error={error}
          text={value?.type === "decimal" ? value.value : ""}
          onText={(next) => onChange(next === "" ? null : { type: "decimal", value: next })}
        />
      )

    case "money_minor":
      return <MoneyField def={def} value={value} onChange={onChange} error={error} />

    case "measure":
      return <MeasureField def={def} value={value} onChange={onChange} error={error} />

    case "date":
      return (
        <DateField
          def={def}
          error={error}
          text={value?.type === "date" ? value.value : ""}
          onText={(next) => onChange(next === "" ? null : { type: "date", value: next })}
        />
      )

    case "media":
      return <MediaField def={def} value={value} onChange={onChange} error={error} />

    case "gtin":
      return (
        <PlainTextField
          def={def}
          error={error}
          inputMode="numeric"
          text={value?.type === "gtin" ? value.value : ""}
          onText={(next) => onChange(next === "" ? null : { type: "gtin", value: next })}
        />
      )

    case "text":
      return (
        <PlainTextField
          def={def}
          error={error}
          text={value?.type === "text" ? value.value : ""}
          onText={(next) => onChange(next === "" ? null : { type: "text", value: next })}
        />
      )
  }
}

// ── Arms that need their own state or shell ─────────────────────

function PlainTextField({
  def,
  error,
  text,
  onText,
  inputMode,
}: {
  def: AttributeDefinition
  error: string | null
  text: string
  onText: (next: string) => void
  inputMode?: "numeric" | "decimal"
}) {
  const ids = useFieldIds(`attr-${def.code}`, { error, description: def.help_text })
  return (
    <FieldShell ids={ids} label={def.label} description={def.help_text} error={error} required={def.required}>
      <Input
        id={ids.fieldId}
        value={text}
        invalid={!!error}
        inputMode={inputMode}
        maxLength={def.max_len ?? undefined}
        aria-describedby={ids.describedBy}
        onChange={(e) => onText(e.target.value)}
      />
    </FieldShell>
  )
}

function DecimalField({
  def,
  error,
  text,
  onText,
}: {
  def: AttributeDefinition
  error: string | null
  text: string
  onText: (next: string) => void
}) {
  const ids = useFieldIds(`attr-${def.code}`, { error, description: def.help_text })
  return (
    <FieldShell ids={ids} label={def.label} description={def.help_text} error={error} required={def.required}>
      <Input
        id={ids.fieldId}
        value={text}
        invalid={!!error}
        inputMode="decimal"
        aria-describedby={ids.describedBy}
        onChange={(e) => onText(e.target.value)}
      />
    </FieldShell>
  )
}

function DateField({
  def,
  error,
  text,
  onText,
}: {
  def: AttributeDefinition
  error: string | null
  text: string
  onText: (next: string) => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <DatePicker
        id={`attr-${def.code}`}
        label={def.label}
        error={error}
        required={def.required}
        value={text}
        onChange={onText}
      />
      {def.help_text && <p className="text-xs text-brand-text/60">{def.help_text}</p>}
    </div>
  )
}

const MONEY_REFUSED = "Amounts are in rupees with at most two decimals — 1299 or 1299.50, not 1299.505."

/**
 * Rupees in, integer minor units out.
 *
 * The typed text is local state and the form only ever holds the parsed minor
 * value, so "1299." mid-keystroke does not become 1299 behind the seller's
 * back. A third decimal is refused outright with a message rather than rounded:
 * a catalogue that decides on its own whether ₹99.995 is ₹99.99 or ₹100.00 is a
 * catalogue that is wrong about somebody's price.
 */
function MoneyField({
  def,
  value,
  onChange,
  error,
}: {
  def: AttributeDefinition
  value: AttributeValue | null
  onChange: (next: AttributeValue | null) => void
  error: string | null
}) {
  const minor = value?.type === "money_minor" ? value.value : null
  const [text, setText] = useState(() => formatMinor(minor))
  const [refused, setRefused] = useState<string | null>(null)

  // Re-sync only when the value changed from outside (a draft loading, a reset)
  // and disagrees with what is already typed.
  useEffect(() => {
    if (parseMinor(text) !== minor) setText(formatMinor(minor))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minor])

  const description = def.help_text ?? "In rupees, e.g. 1299.50."
  const shown = error ?? refused
  const ids = useFieldIds(`attr-${def.code}`, { error: shown, description })

  function handle(next: string) {
    setText(next)
    if (next.trim() === "") {
      setRefused(null)
      onChange(null)
      return
    }
    const parsed = parseMinor(next)
    if (parsed === null) {
      setRefused(MONEY_REFUSED)
      // The form holds nothing rather than a guess, so a required money field
      // stays visibly unanswered while the text is unparseable.
      onChange(null)
      return
    }
    setRefused(null)
    onChange({ type: "money_minor", value: parsed, currency_code: "INR" })
  }

  return (
    <FieldShell ids={ids} label={def.label} description={description} error={shown} required={def.required}>
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="text-sm text-brand-text/60">
          ₹
        </span>
        <Input
          id={ids.fieldId}
          value={text}
          invalid={!!shown}
          inputMode="decimal"
          aria-describedby={ids.describedBy}
          onChange={(e) => handle(e.target.value)}
        />
      </div>
    </FieldShell>
  )
}

/** A number plus a unit chosen from the definition's own family — never a free-text unit. */
function MeasureField({
  def,
  value,
  onChange,
  error,
}: {
  def: AttributeDefinition
  value: AttributeValue | null
  onChange: (next: AttributeValue | null) => void
  error: string | null
}) {
  const units = def.units ?? []
  const unit = value?.type === "measure" ? value.unit : (def.default_unit ?? units[0]?.code ?? "")
  const text = value?.type === "measure" ? value.value : ""
  const description = def.help_text ?? (def.unit_family ? `Measured in ${def.unit_family}.` : undefined)
  const ids = useFieldIds(`attr-${def.code}`, { error, description })

  return (
    <FieldShell ids={ids} label={def.label} description={description} error={error} required={def.required}>
      <div className="flex items-center gap-2">
        <Input
          id={ids.fieldId}
          value={text}
          invalid={!!error}
          inputMode="decimal"
          aria-describedby={ids.describedBy}
          onChange={(e) =>
            onChange(e.target.value === "" ? null : { type: "measure", value: e.target.value, unit })
          }
        />
        {units.length > 0 ? (
          <Select
            aria-label={`${def.label} unit`}
            className="w-32"
            value={unit}
            options={units.map((u) => ({ value: u.code, label: u.label }))}
            onChange={(nextUnit) => onChange({ type: "measure", value: text, unit: nextUnit })}
          />
        ) : (
          <span className="shrink-0 text-sm text-brand-text/60">{unit || def.unit_family}</span>
        )}
      </div>
    </FieldShell>
  )
}

/**
 * The product's media, as the ids the catalogue stores.
 *
 * There is no upload contract on the web side yet — nothing in this repo posts
 * bytes to the media service — so this edits the list rather than pretending to
 * upload. When the upload route lands, only the "add" control changes; the
 * value shape it produces is already the one the server wants.
 */
function MediaField({
  def,
  value,
  onChange,
  error,
}: {
  def: AttributeDefinition
  value: AttributeValue | null
  onChange: (next: AttributeValue | null) => void
  error: string | null
}) {
  const ids = useFieldIds(`attr-${def.code}`, { error, description: def.help_text })
  const items = value?.type === "media" ? value.value : []
  const [draft, setDraft] = useState("")

  function commit(next: string[]) {
    onChange(next.length === 0 ? null : { type: "media", value: next })
  }

  return (
    <FieldShell
      ids={ids}
      label={def.label}
      description={def.help_text}
      error={error}
      required={def.required}
      labelAsGroup
    >
      <div className="flex flex-col gap-2">
        {items.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {items.map((id) => (
              <li
                key={id}
                className="flex items-center gap-2 rounded-lg border border-brand-text/15 bg-brand-card/60 px-2 py-1 text-xs"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/v1/media/${id}/serve?w=64&q=70`}
                  alt=""
                  className="h-8 w-8 rounded object-cover"
                />
                <span className="max-w-[10rem] truncate">{id}</span>
                <button
                  type="button"
                  aria-label={`Remove ${id}`}
                  className="text-brand-text/50 hover:text-red-500"
                  onClick={() => commit(items.filter((i) => i !== id))}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center gap-2">
          <Input
            id={ids.fieldId}
            value={draft}
            invalid={!!error}
            placeholder="Media id"
            aria-label={`${def.label} — media id to add`}
            aria-describedby={ids.describedBy}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button
            type="button"
            className="shrink-0 rounded-lg border border-brand-text/20 px-3 py-2 text-sm hover:border-brand-text/40 disabled:opacity-50"
            disabled={draft.trim() === ""}
            onClick={() => {
              const id = draft.trim()
              if (!id || items.includes(id)) return setDraft("")
              commit([...items, id])
              setDraft("")
            }}
          >
            Add
          </button>
        </div>
      </div>
    </FieldShell>
  )
}

/**
 * A data type this build does not know.
 *
 * Shown read-only with whatever the server sent, never dropped. A field that
 * silently vanishes from the form is a field the seller gets rejected on
 * without ever having been asked — and the value is still carried in form state
 * as `{type: 'unknown'}`, so an edit round-trips it back untouched.
 */
function UnknownField({
  def,
  value,
  error,
}: {
  def: AttributeDefinition
  value: AttributeValue | null
  error: string | null
}) {
  const raw = value?.type === "unknown" ? value.value : null
  const text =
    raw === null || raw === undefined
      ? ""
      : typeof raw === "string"
        ? raw
        : JSON.stringify(raw)
  const description = `This version of the seller tools does not know the field type “${def.data_type}”, so it is shown as sent and saved unchanged.`
  const ids = useFieldIds(`attr-${def.code}`, { error, description })

  return (
    <FieldShell ids={ids} label={def.label} description={description} error={error} required={def.required}>
      <Input
        id={ids.fieldId}
        value={text}
        readOnly
        aria-readonly="true"
        invalid={!!error}
        aria-describedby={ids.describedBy}
        className="bg-brand-text/5"
        placeholder="Not editable here"
        onChange={() => {
          /* read-only on purpose — see above */
        }}
      />
    </FieldShell>
  )
}
