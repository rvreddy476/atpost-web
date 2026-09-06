"use client"

import { Input, Select, Textarea } from "@atpost/ui"
import type { TaxClass } from "@/hooks/useListing"

/*
 * The fields every listing has, whatever category it is filed under.
 *
 * These are the same fields /sell/products/new asks for today, plus the tax
 * class the create route now requires. Both branches of the guided flow render
 * them from here, so the category-driven form and the fallback cannot disagree
 * about what a product is.
 */

export interface ListingBasics {
  title: string
  description: string
  returnPolicy: string
  taxClassId: string
}

export interface ListingOfferDetails {
  sku: string
  mrp: string
  price: string
  stock: string
}

export const RETURN_POLICIES = ["no_return", "7_days", "15_days", "30_days"] as const

export const emptyBasics: ListingBasics = {
  title: "",
  description: "",
  returnPolicy: "7_days",
  taxClassId: "",
}

export const emptyOffer: ListingOfferDetails = { sku: "", mrp: "", price: "", stock: "" }

/** Required answers filled, for the group badge and the "n of m ready" line. */
export function basicsProgress(basics: ListingBasics): { filledRequired: number; totalRequired: number } {
  const required = [basics.title.trim(), basics.taxClassId.trim()]
  return { filledRequired: required.filter(Boolean).length, totalRequired: required.length }
}

/**
 * In "stem" mode only the SKU counts: the money is per row in the grid, and
 * counting a price the seller is never asked for would leave the tab badge
 * permanently short of its total.
 */
export function offerProgress(
  offer: ListingOfferDetails,
  mode: "single" | "stem" = "single",
): { filledRequired: number; totalRequired: number } {
  const required =
    mode === "stem"
      ? [offer.sku.trim()]
      : [offer.sku.trim(), offer.mrp.trim(), offer.price.trim()]
  return { filledRequired: required.filter(Boolean).length, totalRequired: required.length }
}

export function BasicsFields({
  value,
  onChange,
  taxClasses,
  taxClassesLoading,
}: {
  value: ListingBasics
  onChange: (next: ListingBasics) => void
  taxClasses: TaxClass[]
  taxClassesLoading: boolean
}) {
  const set = <K extends keyof ListingBasics>(key: K, next: ListingBasics[K]) =>
    onChange({ ...value, [key]: next })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="listing-title" className="text-sm font-medium text-brand-text">
          Title
          <span aria-hidden="true" className="ml-0.5 text-red-500">
            *
          </span>
        </label>
        <Input
          id="listing-title"
          value={value.title}
          maxLength={200}
          onChange={(e) => set("title", e.target.value)}
        />
      </div>

      <Textarea
        id="listing-description"
        label="Description"
        description="What a shopper needs to know before buying."
        value={value.description}
        onChange={(next) => set("description", next)}
      />

      <Select
        id="listing-return-policy"
        label="Return policy"
        value={value.returnPolicy}
        options={RETURN_POLICIES.map((p) => ({ value: p, label: p.replace(/_/g, " ") }))}
        onChange={(next) => set("returnPolicy", next)}
      />

      <Select
        id="listing-tax-class"
        label="Tax class"
        required
        description={
          taxClassesLoading
            ? "Loading the tax classes…"
            : "Decides the GST rate on every sale of this product."
        }
        placeholder="Choose a tax class…"
        value={value.taxClassId}
        options={taxClasses.map((t) => ({
          value: t.id,
          label: t.rate_percent === undefined ? t.name : `${t.name} — ${t.rate_percent}%`,
        }))}
        onChange={(next) => set("taxClassId", next)}
      />
    </div>
  )
}

/**
 * The seller's own SKU, price and stock — in one of two modes, and the
 * difference between them is the whole variation feature.
 *
 *   "single"  the four fields exactly as they have always been: one SKU, one
 *             price, one stock count, for a product that comes one way.
 *   "stem"    the SKU alone, as the stem each row of the variant grid is
 *             suggested from. MRP, price and stock are gone because they now
 *             live per row — a product-level price beside a grid of per-row
 *             prices would leave the seller guessing which one a buyer is
 *             charged, and only one of the two is ever sent.
 */
export function OfferFields({
  value,
  onChange,
  mode = "single",
}: {
  value: ListingOfferDetails
  onChange: (next: ListingOfferDetails) => void
  mode?: "single" | "stem"
}) {
  const set = <K extends keyof ListingOfferDetails>(key: K, next: ListingOfferDetails[K]) =>
    onChange({ ...value, [key]: next })

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="flex flex-col gap-1 sm:col-span-2">
        <label htmlFor="listing-sku" className="text-sm font-medium text-brand-text">
          {mode === "stem" ? "SKU stem" : "SKU"}
          <span aria-hidden="true" className="ml-0.5 text-red-500">
            *
          </span>
        </label>
        <Input id="listing-sku" value={value.sku} onChange={(e) => set("sku", e.target.value)} />
        {mode === "stem" && (
          <p className="text-xs text-gray-500">
            Every row of the grid starts from this — TEE becomes TEE-M-BLUE — and each one stays
            editable.
          </p>
        )}
      </div>

      {mode === "stem" ? null : (
        <>
      <div className="flex flex-col gap-1">
        <label htmlFor="listing-mrp" className="text-sm font-medium text-brand-text">
          MRP
          <span aria-hidden="true" className="ml-0.5 text-red-500">
            *
          </span>
        </label>
        <Input
          id="listing-mrp"
          inputMode="decimal"
          value={value.mrp}
          onChange={(e) => set("mrp", e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="listing-price" className="text-sm font-medium text-brand-text">
          Selling price
          <span aria-hidden="true" className="ml-0.5 text-red-500">
            *
          </span>
        </label>
        <Input
          id="listing-price"
          inputMode="decimal"
          value={value.price}
          onChange={(e) => set("price", e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="listing-stock" className="text-sm font-medium text-brand-text">
          Stock qty
        </label>
        <Input
          id="listing-stock"
          inputMode="numeric"
          value={value.stock}
          onChange={(e) => set("stock", e.target.value)}
        />
      </div>
        </>
      )}
    </div>
  )
}
