"use client"

import { useMemo, useState } from "react"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Eye } from "lucide-react"
import type {
  AttributeDefinition,
  AttributeSchema,
  AttributeValue,
  AttributeValueMap,
} from "@atpost/types/commerce"
import { groupProgress, zodForSchema } from "@atpost/form"
import {
  Button,
  DatePicker,
  Input,
  MultiSelect,
  NumberInput,
  Select,
  Switch,
  Tabs,
  Textarea,
} from "@atpost/ui"

/**
 * The seller's form, rendered from the very response the shop consumes.
 *
 * It reads `GET /v1/commerce/categories/:id/attribute-schema` — the public,
 * unauthenticated route, not an admin-only projection of it — so the preview
 * physically cannot drift from what a seller sees. It also validates with
 * `zodForSchema`, the same rules the seller's form runs, which makes a
 * too-tight bound visible here rather than in a support ticket.
 *
 * Nothing here is submitted anywhere. "Check answers" runs the validator and
 * stops.
 */
export function SellerFormPreview({
  schema,
  isLoading,
  error,
}: {
  schema: AttributeSchema | null | undefined
  isLoading: boolean
  error: string | null
}) {
  if (error) return <p className="text-sm text-red-600">{error}</p>
  if (isLoading) return <p className="text-sm text-gray-500">Loading the seller&apos;s form…</p>
  if (!schema || schema.groups.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        This category asks for nothing yet, so a seller sees only the built-in fields.
      </p>
    )
  }
  return <PreviewForm schema={schema} />
}

function PreviewForm({ schema }: { schema: AttributeSchema }) {
  const groups = useMemo(
    () => schema.groups.slice().sort((a, b) => a.sort_order - b.sort_order),
    [schema],
  )
  const [tab, setTab] = useState(groups[0]?.name ?? "")
  const [checked, setChecked] = useState(false)

  const resolver = useMemo(() => zodResolver(zodForSchema(schema)), [schema])
  // `errors` is destructured here, not read later behind a condition: react-hook-form
  // subscribes to a formState key the first time it is read during render, so a
  // guarded read on the first pass would never subscribe and the tab would never
  // turn red.
  const {
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<Record<string, unknown>>({
    resolver,
    defaultValues: {},
    mode: "onSubmit",
  })

  const values = watch() as AttributeValueMap
  const active = groups.find((g) => g.name === tab) ?? groups[0]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-2 rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
        <Eye className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
        <p>
          Preview only — nothing typed here is saved or submitted. Rendered from schema version{" "}
          <span className="font-medium">{schema.schema_version}</span>, the same response the shop
          reads.
          {schema.variation_axes.length > 0 && (
            <> Variants split on {schema.variation_axes.join(", ")}.</>
          )}
        </p>
      </div>

      <Tabs
        aria-label="Seller form groups"
        value={active?.name ?? ""}
        onChange={setTab}
        items={groups.map((group) => {
          const progress = groupProgress(group, values)
          const invalid = checked && group.attributes.some((def) => !!errors[def.code])
          return {
            id: group.name,
            label: group.name,
            invalid,
            badge:
              progress.totalRequired > 0
                ? `${progress.filledRequired} / ${progress.totalRequired}`
                : `${group.attributes.length}`,
          }
        })}
      >
        <form
          // noValidate hands validation to zodForSchema. Without it the
          // browser's own required-field popup fires first and the schema's
          // rules — the ones a seller is actually judged by — never run.
          noValidate
          className="flex flex-col gap-4"
          onSubmit={handleSubmit(
            () => setChecked(true),
            () => setChecked(true),
          )}
        >
          {active?.attributes.map((def) => (
            <Controller
              key={def.code}
              control={control}
              name={def.code}
              render={({ field, fieldState }) => (
                <PreviewField
                  def={def}
                  value={(field.value as AttributeValue | undefined) ?? null}
                  onChange={field.onChange}
                  error={fieldState.error?.message ?? null}
                />
              )}
            />
          ))}
          <div className="flex justify-end">
            <Button type="submit" variant="outline">
              Check answers
            </Button>
          </div>
        </form>
      </Tabs>
    </div>
  )
}

/** One attribute, drawn with the control a seller would actually get. */
function PreviewField({
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
  const options = (def.values ?? [])
    .filter((v) => v.is_active !== false)
    .map((v) => ({ value: v.value, label: v.label }))

  switch (def.data_type) {
    case "long_text":
      return (
        <Textarea
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
          label={def.label}
          description={def.help_text}
          error={error}
          checked={value?.type === "boolean" ? value.value : false}
          onChange={(next) => onChange({ type: "boolean", value: next })}
        />
      )
    case "enum":
      return (
        <Select
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
    case "multi_enum":
      return (
        <MultiSelect
          label={def.label}
          description={def.help_text}
          required={def.required}
          error={error}
          options={options}
          maxSelections={def.max ?? undefined}
          value={value?.type === "multi_enum" ? value.value : []}
          onChange={(next) =>
            onChange(next.length === 0 ? null : { type: "multi_enum", value: next })
          }
        />
      )
    case "integer":
      return (
        <NumberInput
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
    case "money_minor":
      return (
        <NumberInput
          label={def.label}
          description={def.help_text ?? "Entered in minor units."}
          required={def.required}
          error={error}
          mode="integer"
          min={def.min ?? undefined}
          max={def.max ?? undefined}
          value={value?.type === "money_minor" ? value.value : null}
          onChange={(next) => onChange(next === null ? null : { type: "money_minor", value: next })}
        />
      )
    case "decimal":
      return (
        <NumberInput
          label={def.label}
          description={def.help_text}
          required={def.required}
          error={error}
          mode="decimal"
          min={def.min ?? undefined}
          max={def.max ?? undefined}
          value={value?.type === "decimal" ? Number(value.value) : null}
          onChange={(next) =>
            onChange(next === null ? null : { type: "decimal", value: String(next) })
          }
        />
      )
    case "measure": {
      const units = def.units ?? []
      const unit = value?.type === "measure" ? value.unit : (def.default_unit ?? units[0]?.code ?? "")
      return (
        <NumberInput
          label={def.label}
          description={def.help_text}
          required={def.required}
          error={error}
          mode="decimal"
          min={def.min ?? undefined}
          max={def.max ?? undefined}
          unit={
            units.length > 0 ? (
              <Select
                aria-label={`${def.label} unit`}
                className="h-8 w-24"
                value={unit}
                options={units.map((u) => ({ value: u.code, label: u.label }))}
                onChange={(nextUnit) =>
                  onChange({
                    type: "measure",
                    value: value?.type === "measure" ? value.value : "",
                    unit: nextUnit,
                  })
                }
              />
            ) : (
              <span className="text-xs text-gray-500">{unit || def.unit_family}</span>
            )
          }
          value={value?.type === "measure" && value.value !== "" ? Number(value.value) : null}
          onChange={(next) =>
            onChange(next === null ? null : { type: "measure", value: String(next), unit })
          }
        />
      )
    }
    case "date":
      return (
        <DatePicker
          label={def.label}
          error={error}
          value={value?.type === "date" ? value.value : ""}
          onChange={(next) => onChange(next === "" ? null : { type: "date", value: next })}
        />
      )
    case "media":
      return (
        <div className="rounded-xl border border-dashed border-gray-300 p-4 text-sm text-gray-500">
          <span className="font-medium text-gray-700">{def.label}</span> — media upload. Sellers see
          the picker here; the preview does not upload.
        </div>
      )
    case "text":
    case "gtin":
    default: {
      const current = value && "value" in value ? value.value : ""
      return (
        <div className="flex flex-col gap-1">
          <label htmlFor={`preview-${def.code}`} className="text-sm font-medium text-gray-800">
            {def.label}
            {def.required && (
              <span aria-hidden="true" className="ml-0.5 text-red-500">
                *
              </span>
            )}
          </label>
          <Input
            id={`preview-${def.code}`}
            value={typeof current === "string" ? current : ""}
            invalid={!!error}
            maxLength={def.max_len ?? undefined}
            onChange={(e) =>
              onChange(
                e.target.value === ""
                  ? null
                  : ({
                      type: def.data_type === "gtin" ? "gtin" : "text",
                      value: e.target.value,
                    } as AttributeValue),
              )
            }
          />
          {def.help_text && <p className="text-xs text-gray-500">{def.help_text}</p>}
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      )
    }
  }
}
