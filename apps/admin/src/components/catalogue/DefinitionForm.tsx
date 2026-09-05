"use client"

import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Lock } from "lucide-react"
import { ATTRIBUTE_DATA_TYPES } from "@atpost/types/commerce"
import {
  Button,
  Checkbox,
  Input,
  NumberInput,
  RadioGroup,
  Select,
  Textarea,
} from "@atpost/ui"
import type { DefinitionRecord } from "@/lib/catalogue"
import { commands, type CatalogueRunner } from "@/hooks/useCatalogue"
import { RegexTester } from "./RegexTester"
import { EnumValueEditor } from "./EnumValueEditor"

const ENUM_TYPES = ["enum", "multi_enum"]
const NUMBER_TYPES = ["integer", "decimal", "money_minor"]
const TEXT_TYPES = ["text", "long_text"]

/** Lower-case, underscore-separated: the identity a client writes into a row. */
const CODE_PATTERN = /^[a-z][a-z0-9_]*$/

const formSchema = z
  .object({
    code: z
      .string()
      .min(2, "A code needs at least two characters.")
      .regex(CODE_PATTERN, "Lower-case letters, digits and underscores, starting with a letter."),
    label: z.string().min(1, "The label is what a seller reads — it cannot be blank."),
    help_text: z.string(),
    placeholder: z.string(),
    data_type: z.string().min(1),
    display_group: z.string(),
    scope: z.enum(["item", "offer"]),
    is_required: z.boolean(),
    is_variant_axis: z.boolean(),
    is_filterable: z.boolean(),
    is_searchable: z.boolean(),
    min: z.number().nullable(),
    max: z.number().nullable(),
    min_len: z.number().nullable(),
    max_len: z.number().nullable(),
    max_values: z.number().nullable(),
    regex: z.string(),
    unit_family: z.string(),
    default_unit: z.string(),
  })
  .superRefine((values, ctx) => {
    if (values.min !== null && values.max !== null && values.min > values.max) {
      ctx.addIssue({ code: "custom", path: ["max"], message: "Maximum is below the minimum." })
    }
    if (values.min_len !== null && values.max_len !== null && values.min_len > values.max_len) {
      ctx.addIssue({
        code: "custom",
        path: ["max_len"],
        message: "Maximum length is below the minimum.",
      })
    }
    if (values.regex.trim() !== "") {
      try {
        new RegExp(values.regex)
      } catch (error) {
        ctx.addIssue({ code: "custom", path: ["regex"], message: (error as Error).message })
      }
    }
  })

type FormValues = z.infer<typeof formSchema>

function defaultsFrom(definition: DefinitionRecord | null): FormValues {
  return {
    code: definition?.code ?? "",
    label: definition?.label ?? "",
    help_text: definition?.help_text ?? "",
    placeholder: definition?.placeholder ?? "",
    data_type: (definition?.data_type as string) ?? "text",
    display_group: definition?.display_group ?? "",
    scope: (definition?.scope ?? "item") as "item" | "offer",
    is_required: definition?.is_required ?? false,
    is_variant_axis: definition?.is_variant_axis ?? false,
    is_filterable: definition?.is_filterable ?? false,
    is_searchable: definition?.is_searchable ?? false,
    min: definition?.min ?? null,
    max: definition?.max ?? null,
    min_len: definition?.min_len ?? null,
    max_len: definition?.max_len ?? null,
    max_values: definition?.max_values ?? null,
    regex: definition?.regex ?? "",
    unit_family: definition?.unit_family ?? "",
    default_unit: definition?.default_unit ?? "",
  }
}

function blankToNull(value: string): string | null {
  return value.trim() === "" ? null : value.trim()
}

/**
 * Which sentence the impact dialog should lead with.
 *
 * Only the narrowing edits can produce a 409, so naming the one that did is the
 * difference between "the server said no" and "you are about to make Brand
 * required for 412 live listings".
 */
function describeChange(before: DefinitionRecord | null, values: FormValues): string {
  const label = values.label || values.code
  if (!before) return `Create the attribute “${label}”.`
  if (!before.is_required && values.is_required) {
    return `Make “${label}” required for every listing that already asks for it.`
  }
  const tightened =
    (values.min !== null && (before.min === null || values.min > before.min)) ||
    (values.max !== null && (before.max === null || values.max < before.max)) ||
    (values.max_len !== null && (before.max_len === null || values.max_len < before.max_len)) ||
    (values.min_len !== null && (before.min_len === null || values.min_len > before.min_len)) ||
    (values.max_values !== null &&
      (before.max_values === null || values.max_values < before.max_values))
  if (tightened) return `Tighten the limits on “${label}”.`
  if (values.regex.trim() !== "" && values.regex !== (before.regex ?? "")) {
    return `Apply a new validation pattern to “${label}”.`
  }
  return `Save “${label}”.`
}

export function DefinitionForm({
  definition,
  runner,
  onDone,
}: {
  definition: DefinitionRecord | null
  runner: CatalogueRunner
  onDone: () => void
}) {
  const isNew = definition === null
  const {
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: defaultsFrom(definition),
    mode: "onBlur",
  })

  const dataType = watch("data_type")
  const isEnum = ENUM_TYPES.includes(dataType)
  const isNumber = NUMBER_TYPES.includes(dataType)
  const isText = TEXT_TYPES.includes(dataType)
  const isMeasure = dataType === "measure"

  function onSubmit(values: FormValues) {
    const body: Record<string, unknown> = {
      label: values.label.trim(),
      help_text: blankToNull(values.help_text),
      placeholder: blankToNull(values.placeholder),
      data_type: values.data_type,
      display_group: blankToNull(values.display_group),
      scope: values.scope,
      is_required: values.is_required,
      is_variant_axis: values.is_variant_axis,
      is_filterable: values.is_filterable,
      is_searchable: values.is_searchable,
    }
    if (isNumber) {
      body.min = values.min
      body.max = values.max
    }
    if (isText) {
      body.min_len = values.min_len
      body.max_len = values.max_len
      body.regex = blankToNull(values.regex)
    }
    if (isEnum) body.max_values = values.max_values
    if (isMeasure) {
      body.unit_family = blankToNull(values.unit_family)
      body.default_unit = blankToNull(values.default_unit)
    }

    const what = describeChange(definition, values)
    if (isNew) {
      body.code = values.code.trim()
      runner.run(commands.createDefinition(body, values.label.trim()))
    } else {
      runner.run(
        commands.patchDefinition(
          definition.id,
          body,
          what,
          `“${values.label.trim()}” saved`,
        ),
      )
    }
  }

  return (
    <form noValidate className="flex flex-col gap-6" onSubmit={handleSubmit(onSubmit)}>
      <section className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="definition-code" className="text-sm font-medium text-gray-800">
            Code
          </label>
          {isNew ? (
            <Controller
              control={control}
              name="code"
              render={({ field }) => (
                <Input
                  id="definition-code"
                  data-testid="definition-code"
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  invalid={!!errors.code}
                  placeholder="brand"
                />
              )}
            />
          ) : (
            /* Immutable after the first save. The code is the wire identity:
               it is written into every product row, every filter URL and every
               integration's payload, so renaming it would orphan them all. A
               mistyped code is retired with is_active and replaced. */
            <div className="relative">
              <Input
                id="definition-code"
                data-testid="definition-code"
                value={definition.code}
                readOnly
                disabled
                aria-describedby="definition-code-help"
                className="pr-9 font-mono"
              />
              <Lock
                aria-hidden="true"
                className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
              />
            </div>
          )}
          <p id="definition-code-help" className="text-xs text-gray-500">
            {isNew
              ? "The wire identity sellers, filters and integrations will use. It cannot be changed after the first save."
              : "The wire identity — fixed once saved. Retire this attribute and create a new one if the code is wrong."}
          </p>
          {errors.code && <p className="text-xs text-red-600">{errors.code.message}</p>}
        </div>

        <Controller
          control={control}
          name="label"
          render={({ field }) => (
            <div className="flex flex-col gap-1">
              <label htmlFor="definition-label" className="text-sm font-medium text-gray-800">
                Label
              </label>
              <Input
                id="definition-label"
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                invalid={!!errors.label}
                placeholder="Brand"
              />
              <p className="text-xs text-gray-500">What the seller sees above the field.</p>
              {errors.label && <p className="text-xs text-red-600">{errors.label.message}</p>}
            </div>
          )}
        />

        <Controller
          control={control}
          name="help_text"
          render={({ field }) => (
            <Textarea
              label="Help text"
              description="One line under the field. Say what a good answer looks like."
              value={field.value}
              minRows={2}
              onChange={field.onChange}
            />
          )}
        />

        <Controller
          control={control}
          name="placeholder"
          render={({ field }) => (
            <div className="flex flex-col gap-1">
              <label htmlFor="definition-placeholder" className="text-sm font-medium text-gray-800">
                Placeholder
              </label>
              <Input
                id="definition-placeholder"
                value={field.value}
                onChange={field.onChange}
                placeholder="e.g. Levi’s"
              />
              <p className="text-xs text-gray-500">Ghost text inside the empty field.</p>
            </div>
          )}
        />

        <Controller
          control={control}
          name="data_type"
          render={({ field }) => (
            <Select
              label="Data type"
              description={
                isNew
                  ? "Decides how the field is rendered and validated."
                  : "Changing a type on a live attribute re-interprets values already stored."
              }
              value={field.value}
              onChange={field.onChange}
              options={ATTRIBUTE_DATA_TYPES.map((t) => ({ value: t, label: t }))}
            />
          )}
        />

        <Controller
          control={control}
          name="display_group"
          render={({ field }) => (
            <div className="flex flex-col gap-1">
              <label htmlFor="definition-group" className="text-sm font-medium text-gray-800">
                Display group
              </label>
              <Input
                id="definition-group"
                value={field.value}
                onChange={field.onChange}
                placeholder="Basics"
              />
              <p className="text-xs text-gray-500">
                The tab this field appears under in the seller&apos;s form.
              </p>
            </div>
          )}
        />

        <Controller
          control={control}
          name="scope"
          render={({ field }) => (
            <RadioGroup
              label="Applies to"
              value={field.value}
              onChange={(v) => field.onChange(v as "item" | "offer")}
              options={[
                { value: "item", label: "Item", description: "Describes the product itself." },
                {
                  value: "offer",
                  label: "Offer",
                  description: "Describes one seller's listing of it.",
                },
              ]}
            />
          )}
        />
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <Controller
          control={control}
          name="is_required"
          render={({ field }) => (
            <Checkbox
              label="Required"
              description="A seller cannot publish without it. Turning this on for a live attribute needs the impact acknowledgement."
              checked={field.value}
              onChange={field.onChange}
            />
          )}
        />
        <Controller
          control={control}
          name="is_variant_axis"
          render={({ field }) => (
            <Checkbox
              label="Variation axis"
              description="Splits one product into variants — size, colour."
              checked={field.value}
              onChange={field.onChange}
            />
          )}
        />
        <Controller
          control={control}
          name="is_filterable"
          render={({ field }) => (
            <Checkbox
              label="Filterable"
              description="Appears in the shop's left-hand filters."
              checked={field.value}
              onChange={field.onChange}
            />
          )}
        />
        <Controller
          control={control}
          name="is_searchable"
          render={({ field }) => (
            <Checkbox
              label="Searchable"
              description="Its text is indexed for the search box."
              checked={field.value}
              onChange={field.onChange}
            />
          )}
        />
      </section>

      {(isEnum || isNumber || isText || isMeasure) && (
        <section className="flex flex-col gap-4 rounded-xl border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-900">
            {isEnum
              ? "Option list"
              : isMeasure
                ? "Units"
                : isNumber
                  ? "Range"
                  : "Length and pattern"}
          </h3>

          {isNumber && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Controller
                control={control}
                name="min"
                render={({ field }) => (
                  <NumberInput
                    label="Minimum"
                    mode={dataType === "integer" || dataType === "money_minor" ? "integer" : "decimal"}
                    value={field.value}
                    onChange={field.onChange}
                    description={dataType === "money_minor" ? "In minor units — 1000 is ₹10." : undefined}
                  />
                )}
              />
              <Controller
                control={control}
                name="max"
                render={({ field }) => (
                  <NumberInput
                    label="Maximum"
                    mode={dataType === "integer" || dataType === "money_minor" ? "integer" : "decimal"}
                    value={field.value}
                    onChange={field.onChange}
                    error={errors.max?.message ?? null}
                  />
                )}
              />
            </div>
          )}

          {isText && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Controller
                  control={control}
                  name="min_len"
                  render={({ field }) => (
                    <NumberInput
                      label="Minimum length"
                      mode="integer"
                      min={0}
                      value={field.value}
                      onChange={field.onChange}
                    />
                  )}
                />
                <Controller
                  control={control}
                  name="max_len"
                  render={({ field }) => (
                    <NumberInput
                      label="Maximum length"
                      mode="integer"
                      min={0}
                      value={field.value}
                      onChange={field.onChange}
                      error={errors.max_len?.message ?? null}
                    />
                  )}
                />
              </div>
              <Controller
                control={control}
                name="regex"
                render={({ field }) => (
                  <div className="flex flex-col gap-1">
                    <RegexTester pattern={field.value} onPatternChange={field.onChange} />
                    {errors.regex && (
                      <p className="text-xs text-red-600">{errors.regex.message}</p>
                    )}
                  </div>
                )}
              />
            </>
          )}

          {isMeasure && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Controller
                control={control}
                name="unit_family"
                render={({ field }) => (
                  <Select
                    label="Unit family"
                    value={field.value}
                    onChange={field.onChange}
                    placeholder="Choose a family…"
                    options={[
                      { value: "length", label: "Length" },
                      { value: "mass", label: "Mass" },
                      { value: "volume", label: "Volume" },
                      { value: "area", label: "Area" },
                      { value: "power", label: "Power" },
                      { value: "duration", label: "Duration" },
                    ]}
                  />
                )}
              />
              <Controller
                control={control}
                name="default_unit"
                render={({ field }) => (
                  <div className="flex flex-col gap-1">
                    <label htmlFor="definition-unit" className="text-sm font-medium text-gray-800">
                      Default unit
                    </label>
                    <Input
                      id="definition-unit"
                      value={field.value}
                      onChange={field.onChange}
                      placeholder="cm"
                    />
                    <p className="text-xs text-gray-500">
                      The unit the field opens on. Sellers may switch within the family.
                    </p>
                  </div>
                )}
              />
            </div>
          )}

          {isEnum && (
            <>
              {dataType === "multi_enum" && (
                <Controller
                  control={control}
                  name="max_values"
                  render={({ field }) => (
                    <NumberInput
                      label="Maximum selections"
                      mode="integer"
                      min={1}
                      className="max-w-40"
                      value={field.value}
                      onChange={field.onChange}
                      description="Leave empty for no limit."
                    />
                  )}
                />
              )}
              {definition ? (
                <EnumValueEditor definition={definition} runner={runner} />
              ) : (
                <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-500">
                  Save the attribute first — options are added once it has a code to hang them on.
                </p>
              )}
            </>
          )}
        </section>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Back
        </Button>
        <Button type="submit" disabled={runner.isPending}>
          {runner.isPending ? "Saving…" : isNew ? "Create attribute" : "Save changes"}
        </Button>
      </div>
    </form>
  )
}
