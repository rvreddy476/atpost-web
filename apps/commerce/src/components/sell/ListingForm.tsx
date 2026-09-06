"use client"

import { useEffect, useMemo, useState } from "react"
import { Controller, useForm, type Control } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { AlertTriangle, Info } from "lucide-react"
import type {
  AttributeDefinition,
  AttributeGroup,
  AttributeSchema,
  AttributeValue,
  AttributeValueMap,
  Category,
} from "@atpost/types/commerce"
import { emptyValueFor, fieldErrorMessage, groupProgress, zodForSchema } from "@atpost/form"
import { Button, Tabs } from "@atpost/ui"
import type { ListingCreatePayload } from "@/hooks/useListing"
import { useTaxClasses } from "@/hooks/useListing"
import { readScratch, toAttributePayload, writeScratch } from "@/lib/listing"
import { AttributeField } from "./AttributeField"
import {
  BasicsFields,
  OfferFields,
  basicsProgress,
  emptyBasics,
  emptyOffer,
  offerProgress,
  type ListingBasics,
  type ListingOfferDetails,
} from "./ListingBuiltIns"
import { useListingDraft, type ListingDraft } from "./useListingDraft"

/** The sentence that makes the item/offer split mean something to a seller. */
const OFFER_LINE = "These are yours. The details above are shared with other sellers."

// ═══════════════════════════════════════════════════════════════
//  THE FORK
// ═══════════════════════════════════════════════════════════════
//
// Everything below hangs off one question: does this category have attributes
// authored against it?
//
//   yes → the category's own form, rendered from the schema (SchemaListingForm)
//   no  → exactly the form /sell/products/new has always shown (FallbackForm)
//
// The fallback is not a degraded mode, it is the point: it lets the founder
// author one category at a time instead of all hundred before any seller can
// list anything. A category with nothing authored behaves precisely as it does
// today, and the seller never learns there was a second path.

export function ListingForm({
  category,
  schema,
  schemaLoading,
  schemaError,
  initialProductId,
}: {
  category: Category
  schema: AttributeSchema | null
  schemaLoading: boolean
  schemaError: string | null
  initialProductId: string | null
}) {
  const hasAuthoredForm =
    !!schema && schema.groups.some((group) => group.attributes && group.attributes.length > 0)

  if (schemaLoading) {
    return <p className="text-sm text-gray-500">Loading this category’s form…</p>
  }

  return hasAuthoredForm ? (
    <SchemaListingForm
      category={category}
      schema={schema as AttributeSchema}
      initialProductId={initialProductId}
    />
  ) : (
    <FallbackForm category={category} initialProductId={initialProductId} schemaError={schemaError} />
  )
}

// ═══════════════════════════════════════════════════════════════
//  Fallback — today's form, unchanged
// ═══════════════════════════════════════════════════════════════

function FallbackForm({
  category,
  initialProductId,
  schemaError,
}: {
  category: Category
  initialProductId: string | null
  schemaError: string | null
}) {
  const draft = useListingDraft(category.id, initialProductId)
  const taxes = useTaxClasses()
  const scratch = useMemo(() => readScratch(category.id), [category.id])
  const [basics, setBasics] = useState<ListingBasics>(
    () => (scratch?.values.basics as ListingBasics | undefined) ?? emptyBasics,
  )
  const [offer, setOffer] = useState<ListingOfferDetails>(
    () => (scratch?.values.offer as ListingOfferDetails | undefined) ?? emptyOffer,
  )
  const [attempted, setAttempted] = useState(false)

  useEffect(() => {
    if (draft.productId) return
    writeScratch(category.id, { basics, offer })
  }, [category.id, basics, offer, draft.productId])

  const missing = builtInGaps(basics, offer)
  const body = () => buildBody({ category, schema: null, basics, offer, attributes: {} })

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p>
          <span className="font-medium">{category.name}</span> has no questions of its own yet, so
          this is the standard listing form. Category questions appear here the moment they are
          published — nothing you fill in now is wasted.
          {schemaError && <span className="block text-xs opacity-80">({schemaError})</span>}
        </p>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold text-brand-text">Product</h2>
        <BasicsFields
          value={basics}
          onChange={setBasics}
          taxClasses={taxes.data ?? []}
          taxClassesLoading={taxes.isLoading}
        />
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-brand-text">Your offer</h2>
        <p className="mb-4 mt-1 text-xs text-gray-500">{OFFER_LINE}</p>
        <OfferFields value={offer} onChange={setOffer} />
      </section>

      <SaveBar
        draft={draft}
        missing={attempted ? missing : []}
        onSave={() => void draft.save(body())}
        onSubmit={() => {
          setAttempted(true)
          if (missing.length > 0) return
          void draft.submitForReview(body())
        }}
      />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
//  Schema-driven — the category's own form
// ═══════════════════════════════════════════════════════════════

const BASICS_TAB = "__basics"
const OFFER_TAB = "__offer"

function SchemaListingForm({
  category,
  schema,
  initialProductId,
}: {
  category: Category
  schema: AttributeSchema
  initialProductId: string | null
}) {
  const draft = useListingDraft(category.id, initialProductId)
  const taxes = useTaxClasses()
  const scratch = useMemo(() => readScratch(category.id), [category.id])

  const { itemGroups, offerAttributes } = useMemo(() => arrangeGroups(schema), [schema])

  const [basics, setBasics] = useState<ListingBasics>(
    () => (scratch?.values.basics as ListingBasics | undefined) ?? emptyBasics,
  )
  const [offer, setOffer] = useState<ListingOfferDetails>(
    () => (scratch?.values.offer as ListingOfferDetails | undefined) ?? emptyOffer,
  )
  const [tab, setTab] = useState(BASICS_TAB)
  const [attempted, setAttempted] = useState(false)

  const defaults = useMemo(
    () => initialAttributeValues(schema, scratch?.values.attributes as AttributeValueMap | undefined),
    [schema, scratch],
  )
  const resolver = useMemo(() => zodResolver(zodForSchema(schema)), [schema])
  // `errors` is destructured during render on purpose: react-hook-form only
  // subscribes to a formState key when it is read, so a guarded read would
  // leave the tab badges permanently green.
  const {
    control,
    getValues,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<Record<string, unknown>>({ resolver, defaultValues: defaults, mode: "onSubmit" })

  const values = watch() as AttributeValueMap

  useEffect(() => {
    if (draft.productId) return
    writeScratch(category.id, { basics, offer, attributes: values })
    // `values` is a fresh object every render; keying on its JSON keeps this to
    // the keystrokes that actually changed something.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category.id, basics, offer, JSON.stringify(values), draft.productId])

  /** Local verdict first, the server's rejection on top of it — the server's wins. */
  function errorFor(def: AttributeDefinition): string | null {
    const fromServer = draft.serverErrors[def.code]
    if (fromServer) return fieldErrorMessage(fromServer, def.label)
    if (!attempted) return null
    const message = errors[def.code]?.message
    return typeof message === "string" ? message : null
  }

  function groupIsInvalid(attributes: AttributeDefinition[]): boolean {
    return attributes.some((def) => !!errorFor(def))
  }

  const missing = builtInGaps(basics, offer)
  const body = () =>
    buildBody({ category, schema, basics, offer, attributes: getValues() as AttributeValueMap })

  const tabs = [
    {
      id: BASICS_TAB,
      // "Product", not "Basics" — a category is free to have a group called
      // Basics, and two tabs with one name is a maze.
      label: "Product",
      badge: badge(basicsProgress(basics)),
      invalid: attempted && missing.some((m) => m.tab === BASICS_TAB),
    },
    ...itemGroups.map((group) => ({
      id: group.name,
      label: group.name,
      badge: badge(groupProgress(group, values)),
      invalid: groupIsInvalid(group.attributes),
    })),
    {
      id: OFFER_TAB,
      label: "Offer",
      badge: badge(combine(offerProgress(offer), groupProgress(asGroup(offerAttributes), values))),
      invalid:
        (attempted && missing.some((m) => m.tab === OFFER_TAB)) || groupIsInvalid(offerAttributes),
    },
  ]

  const activeProgress =
    tab === BASICS_TAB
      ? basicsProgress(basics)
      : tab === OFFER_TAB
        ? combine(offerProgress(offer), groupProgress(asGroup(offerAttributes), values))
        : groupProgress(itemGroups.find((g) => g.name === tab) ?? asGroup([]), values)

  const activeGroup = itemGroups.find((group) => group.name === tab)

  return (
    <form
      // noValidate hands validation to zodForSchema. Without it the browser's
      // own required-field bubble fires first and the schema's rules — the ones
      // the seller is actually judged by — never run.
      noValidate
      className="flex flex-col gap-5"
      onSubmit={handleSubmit(
        () => {
          setAttempted(true)
          if (missing.length > 0) {
            setTab(missing[0].tab)
            return
          }
          void draft.submitForReview(body())
        },
        () => {
          setAttempted(true)
          // Land on the first group that has something wrong with it rather
          // than leaving the seller to hunt through the tabs.
          const firstBad = tabs.find((t) => t.invalid)
          if (firstBad) setTab(firstBad.id)
        },
      )}
    >
      <p className="text-xs text-gray-500">
        {schema.category_path.length > 0 ? schema.category_path.join(" › ") : category.name} · form
        version {schema.schema_version}
        {schema.variation_axes.length > 0 && <> · variants split on {schema.variation_axes.join(", ")}</>}
      </p>

      <Tabs aria-label="Listing sections" value={tab} onChange={setTab} items={tabs}>
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <p className="mb-4 text-xs text-gray-500">
            {activeProgress.totalRequired > 0
              ? `${activeProgress.filledRequired} of ${activeProgress.totalRequired} ready`
              : "Nothing required in this section"}
          </p>

          {tab === BASICS_TAB && (
            <BasicsFields
              value={basics}
              onChange={setBasics}
              taxClasses={taxes.data ?? []}
              taxClassesLoading={taxes.isLoading}
            />
          )}

          {activeGroup && (
            <div className="flex flex-col gap-4">
              {activeGroup.attributes.map((def) => (
                <AttributeControl
                  key={def.code}
                  def={def}
                  control={control}
                  error={errorFor(def)}
                  onDirty={draft.clearServerError}
                />
              ))}
            </div>
          )}

          {tab === OFFER_TAB && (
            <div className="flex flex-col gap-4">
              <p className="text-xs text-gray-500">{OFFER_LINE}</p>
              <OfferFields value={offer} onChange={setOffer} />
              {offerAttributes.map((def) => (
                <AttributeControl
                  key={def.code}
                  def={def}
                  control={control}
                  error={errorFor(def)}
                  onDirty={draft.clearServerError}
                />
              ))}
            </div>
          )}
        </div>
      </Tabs>

      <SaveBar
        draft={draft}
        missing={attempted ? missing : []}
        onSave={() => void draft.save(body())}
        // Submit is the form's own event so the resolver runs first.
        submitIsFormEvent
      />
    </form>
  )
}

/** One attribute, wired to react-hook-form. */
function AttributeControl({
  def,
  control,
  error,
  onDirty,
}: {
  def: AttributeDefinition
  // The form is keyed by attribute code, so the field names are only known at
  // runtime; `Control<Record<string, unknown>>` is the honest type for that.
  control: Control<Record<string, unknown>>
  error: string | null
  onDirty: (code: string) => void
}) {
  return (
    <Controller
      control={control}
      name={def.code}
      render={({ field }) => (
        <AttributeField
          def={def}
          error={error}
          value={(field.value as AttributeValue | undefined) ?? null}
          onChange={(next) => {
            // A field the server rejected stops being rejected the moment the
            // seller changes it — leaving the message up would be a lie.
            onDirty(def.code)
            field.onChange(next)
          }}
        />
      )}
    />
  )
}

// ═══════════════════════════════════════════════════════════════
//  Shared chrome
// ═══════════════════════════════════════════════════════════════

function SaveBar({
  draft,
  missing,
  onSave,
  onSubmit,
  submitIsFormEvent,
}: {
  draft: ListingDraft
  missing: BuiltInGap[]
  onSave: () => void
  onSubmit?: () => void
  submitIsFormEvent?: boolean
}) {
  return (
    <div className="flex flex-col gap-3">
      {missing.length > 0 && (
        <p className="text-sm text-red-600">
          Still needed: {missing.map((m) => m.label).join(", ")}.
        </p>
      )}

      {draft.notice && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {draft.notice}
        </p>
      )}

      {draft.revalidation && <RevalidationPanel prompt={draft.revalidation} />}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" disabled={draft.saving} onClick={onSave}>
          {draft.saving ? "Saving…" : "Save draft"}
        </Button>
        <Button
          type={submitIsFormEvent ? "submit" : "button"}
          disabled={draft.saving}
          onClick={submitIsFormEvent ? undefined : onSubmit}
        >
          Submit for review
        </Button>
        {draft.savedAt && (
          <span className="text-xs text-gray-500">
            Draft saved{draft.productId ? "" : " locally"} ·{" "}
            {new Date(draft.savedAt).toLocaleTimeString()}
          </span>
        )}
      </div>

      <p className="text-xs text-gray-500">
        Saving keeps this as a draft on your account. Nothing reaches the shop until a reviewer
        approves it.
      </p>
    </div>
  )
}

/**
 * The 409. Said in the words it will cost, with the decision left where it
 * belongs — `revalidate: true` is only ever sent from this button.
 */
function RevalidationPanel({ prompt }: { prompt: { fields: string[]; confirm: () => void; cancel: () => void } }) {
  return (
    <div role="alert" className="flex flex-col gap-2 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
      <p className="flex items-start gap-2 font-medium">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        This listing is already approved.
      </p>
      <p>
        {prompt.fields.length > 0 ? (
          <>
            Changing <span className="font-medium">{prompt.fields.join(", ")}</span> sends it back for
            review.
          </>
        ) : (
          <>Saving this change sends the listing back for review.</>
        )}{" "}
        It stops showing in the shop until a reviewer approves it again, which usually takes a day or
        two. Your other listings are not affected.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button type="button" onClick={prompt.confirm}>
          Save it and send for review
        </Button>
        <Button type="button" variant="outline" onClick={prompt.cancel}>
          Leave it as it is
        </Button>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
//  Plumbing
// ═══════════════════════════════════════════════════════════════

interface BuiltInGap {
  tab: string
  label: string
}

function builtInGaps(basics: ListingBasics, offer: ListingOfferDetails): BuiltInGap[] {
  const gaps: BuiltInGap[] = []
  if (!basics.title.trim()) gaps.push({ tab: BASICS_TAB, label: "a title" })
  if (!basics.taxClassId.trim()) gaps.push({ tab: BASICS_TAB, label: "a tax class" })
  if (!offer.sku.trim()) gaps.push({ tab: OFFER_TAB, label: "a SKU" })
  if (!offer.mrp.trim()) gaps.push({ tab: OFFER_TAB, label: "an MRP" })
  if (!offer.price.trim()) gaps.push({ tab: OFFER_TAB, label: "a selling price" })
  return gaps
}

function badge(progress: { filledRequired: number; totalRequired: number }): string {
  return progress.totalRequired > 0
    ? `${progress.filledRequired} / ${progress.totalRequired}`
    : "—"
}

function combine(
  a: { filledRequired: number; totalRequired: number },
  b: { filledRequired: number; totalRequired: number },
) {
  return {
    filledRequired: a.filledRequired + b.filledRequired,
    totalRequired: a.totalRequired + b.totalRequired,
  }
}

function asGroup(attributes: AttributeDefinition[]): AttributeGroup {
  return { name: "Offer", sort_order: Number.MAX_SAFE_INTEGER, attributes }
}

/**
 * Groups in the order the founder authored them, with every offer-scope
 * attribute lifted out into a final Offer group.
 *
 * The lift is what makes the Offer line true: an `offer`-scope attribute is one
 * seller's own answer, an `item`-scope one is shared by everyone listing the
 * same product. Leaving a seller's shipping window in the middle of "Fabric and
 * fit" would make the sentence under it a lie.
 */
function arrangeGroups(schema: AttributeSchema): {
  itemGroups: AttributeGroup[]
  offerAttributes: AttributeDefinition[]
} {
  const sorted = [...schema.groups].sort((a, b) => a.sort_order - b.sort_order)
  const itemGroups: AttributeGroup[] = []
  const offerAttributes: AttributeDefinition[] = []
  for (const group of sorted) {
    const attributes = group.attributes ?? []
    // A group the founder already called "Offer" is one they meant as the
    // seller's own; taking it whole avoids a second tab with the same name.
    if (group.name.trim().toLowerCase() === "offer") {
      offerAttributes.push(...attributes)
      continue
    }
    const mine = attributes.filter((def) => def.scope !== "offer")
    offerAttributes.push(...attributes.filter((def) => def.scope === "offer"))
    if (mine.length > 0) itemGroups.push({ ...group, attributes: mine })
  }
  return { itemGroups, offerAttributes }
}

/** A blank for every attribute, with anything the pre-create scratch held laid over it. */
function initialAttributeValues(
  schema: AttributeSchema,
  saved: AttributeValueMap | undefined,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const group of schema.groups) {
    for (const def of group.attributes ?? []) {
      const held = saved?.[def.code]
      out[def.code] = held ?? emptyValueFor(def)
    }
  }
  return out
}

function buildBody({
  category,
  schema,
  basics,
  offer,
  attributes,
}: {
  category: Category
  schema: AttributeSchema | null
  basics: ListingBasics
  offer: ListingOfferDetails
  attributes: AttributeValueMap
}): ListingCreatePayload {
  const days = basics.returnPolicy === "no_return" ? 0 : Number(basics.returnPolicy.split("_")[0])
  return {
    title: basics.title.trim(),
    description: basics.description,
    category_id: category.id,
    tax_class_id: basics.taxClassId,
    product_type: "physical",
    condition: "new",
    return_policy_type: basics.returnPolicy,
    return_policy_days: Number.isFinite(days) ? days : 0,
    variants: [
      {
        sku: offer.sku.trim(),
        mrp: Number(offer.mrp || 0),
        selling_price: Number(offer.price || 0),
        stock_qty: Number(offer.stock || 0),
      },
    ],
    // The schema version is deliberately NOT sent. PATCH refuses any body key
    // outside its column allowlist plus attributes/revalidate/variation_axes/
    // variants, so an extra key fails the whole save with a 400 — and the
    // server stamps schema_version itself from what is actually published,
    // which is the only figure that can honestly say what the answers were
    // checked against.
    ...(schema ? { attributes: toAttributePayload(attributes) } : {}),
  }
}
