"use client"

import { useCallback, useRef, useState } from "react"
import type { FieldErrorMap } from "@atpost/form"
import { mergeServerErrors } from "@atpost/form"
import {
  useCreateListing,
  usePatchListing,
  type ListingCreatePayload,
  type ListingPatchPayload,
} from "@/hooks/useListing"
import api from "@atpost/api-client"
import { useSubmitProduct } from "@/hooks/useSellerDashboard"
import {
  apiMessage,
  attributeErrorsFrom,
  clearScratch,
  notPatchableFrom,
  revalidationFrom,
  variationProblemsFrom,
} from "@/lib/listing"
import {
  axesPayload,
  patchVariantsPayload,
  problemsOntoRows,
  rupeesToMinor,
  type MatrixRow,
  type RowProblems,
} from "@/lib/variation"

export interface RevalidationPrompt {
  /** The fields the server says would send the listing back for review. */
  fields: string[]
  /** Re-send the very same edit, this time with `revalidate: true`. */
  confirm: () => void
  cancel: () => void
}

/**
 * The variant grid, as the save path needs it: the axes in order and every row
 * the seller can see — including the ones they excluded and the ones that
 * already exist on the server, because a matrix PATCH must name every variant
 * the product has.
 *
 * Passed alongside the body rather than inside it because a PATCH and a POST
 * want different things from the same grid: the POST wants prices and SKUs,
 * the PATCH wants variant ids and options.
 */
export interface MatrixSave {
  axes: string[]
  rows: MatrixRow[]
}

export interface ListingDraft {
  productId: string | null
  saving: boolean
  /** Per-attribute messages the server rejected the last save with. */
  serverErrors: FieldErrorMap
  clearServerError: (code: string) => void
  /** Row key → what the server said about that row of the grid. */
  variantErrors: RowProblems
  /** A one-line problem that belongs to the whole form, not one field. */
  notice: string | null
  /** Set once a save lands, for the "Saved" line. */
  savedAt: number | null
  revalidation: RevalidationPrompt | null
  /** Create on the first save, PATCH on every one after. Resolves true when the server took it. */
  save: (body: ListingCreatePayload, matrix?: MatrixSave) => Promise<boolean>
  /** Save, then hand the draft to review. */
  submitForReview: (body: ListingCreatePayload, matrix?: MatrixSave) => Promise<boolean>
}

/**
 * One listing's trip from "nothing" to "with the reviewers".
 *
 * The draft is the server's row, not the browser's: the first save POSTs and
 * everything after PATCHes the id it returned. The pre-create scratch in local
 * storage is dropped the instant that id exists, so the two stores never both
 * believe they are authoritative.
 */
export function useListingDraft(categoryId: string, existingProductId: string | null): ListingDraft {
  const create = useCreateListing()
  const patch = usePatchListing()
  const submit = useSubmitProduct()

  const [productId, setProductId] = useState<string | null>(existingProductId)
  const [serverErrors, setServerErrors] = useState<FieldErrorMap>({})
  const [variantErrors, setVariantErrors] = useState<RowProblems>({})
  const [notice, setNotice] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [revalidation, setRevalidation] = useState<RevalidationPrompt | null>(null)
  const [saving, setSaving] = useState(false)

  // The body of the save that hit the 409, kept so "yes, send it back for
  // review" re-sends exactly that edit rather than whatever the form holds a
  // few keystrokes later. The grid travels with it for the same reason.
  const pending = useRef<{ body: ListingCreatePayload; matrix?: MatrixSave } | null>(null)
  // `send` calls itself for that retry. Going through a ref keeps it out of its
  // own dependency list instead of tying a knot for no benefit.
  const sendRef = useRef<
    (body: ListingCreatePayload, revalidate: boolean, matrix?: MatrixSave) => Promise<string | null>
  >(async () => null)

  const clearServerError = useCallback((code: string) => {
    setServerErrors((prev) => {
      if (!prev[code]) return prev
      const next = { ...prev }
      delete next[code]
      return next
    })
  }, [])

  /**
   * A row the grid gained on an EDIT.
   *
   * ─── HOW A NEW ROW IS REPRESENTED ───────────────────────────────
   *
   * It cannot ride the matrix PATCH: that route takes `variant_id` per entry
   * and refuses an id the product does not already have, so a row with no id
   * has nowhere to go in it. Nor can a new variant be born with its options —
   * `POST /products/:id/variants` writes SKU, price and weight and knows
   * nothing about axes.
   *
   * So a new row is TWO steps, in this order, and the order is the whole
   * point: create the variant first, so that when the matrix PATCH lands
   * every variant the product has — the old ones and the new one alike — is
   * named in it. The reverse order would send a patch that omits the new
   * variant, and the server would reject the lot; a patch that omitted an old
   * one would have its options cascaded away and never rewritten.
   *
   * If the create succeeds and the patch then fails, the variant exists with
   * no options — visible in the grid as a row to fix, not lost.
   */
  async function createMissingVariants(id: string, rows: MatrixRow[]): Promise<MatrixRow[]> {
    const out: MatrixRow[] = []
    for (const row of rows) {
      if (row.variantId || !row.included || row.stranded) {
        out.push(row)
        continue
      }
      const created = await api.post(`/v1/commerce/products/${id}/variants`, {
        sku: row.sku.trim(),
        mrp_minor: rupeesToMinor(row.mrp) ?? 0,
        selling_price_minor: rupeesToMinor(row.price) ?? 0,
      })
      const body = created.data as { data?: { id?: string } } | null
      const variantId = body?.data?.id
      // `dirty: false` — this row's money was just written by the create, so
      // the reprice pass below has nothing left to say about it.
      out.push(variantId ? { ...row, variantId, dirty: false } : row)
    }
    return out
  }

  /**
   * Money the seller changed on a row that already exists.
   *
   * The matrix PATCH moves options and nothing else — price is not one of the
   * things it carries — so a repriced row goes through the variant's own
   * route. Only rows the seller actually touched are sent: re-posting twenty
   * unchanged prices to prove they are unchanged is twenty chances for one of
   * them to fail.
   */
  async function repriceTouchedRows(rows: MatrixRow[]): Promise<void> {
    for (const row of rows) {
      if (!row.variantId || !row.dirty) continue
      const mrp = rupeesToMinor(row.mrp)
      const price = rupeesToMinor(row.price)
      if (mrp === null || price === null) continue
      await api.patch(`/v1/commerce/variants/${row.variantId}`, {
        mrp_minor: mrp,
        selling_price_minor: price,
      })
    }
  }

  async function send(
    body: ListingCreatePayload,
    revalidate: boolean,
    matrix?: MatrixSave,
  ): Promise<string | null> {
    setSaving(true)
    setServerErrors({})
    setVariantErrors({})
    setNotice(null)
    setRevalidation(null)
    pending.current = { body, matrix }
    // What the server's per-row complaints are matched against, in the order
    // they were sent — the server names an id-less variant by its POSITION in
    // that array, so a filtered-out row would shift every message by one.
    let sent: MatrixRow[] = matrix
      ? matrix.rows.filter((row) => row.included && !row.stranded)
      : []
    try {
      if (!productId) {
        const created = await create.mutateAsync({ ...body, status: "draft" })
        setProductId(created.id)
        // The server now holds it. Nothing local may claim to.
        clearScratch(categoryId)
        setSavedAt(Date.now())
        return created.id
      }

      // The product's own columns. Variants do not travel in this half: on a
      // patch the create-shaped `variants` array would be a body key the
      // allowlist does not know, and the matrix is sent below in the shape
      // that route actually takes.
      const { variants: _variants, variation_axes: axes, ...patchable } = body
      const payload: ListingPatchPayload = revalidate ? { ...patchable, revalidate: true } : patchable
      await patch.mutateAsync({ productId, patch: payload })

      if (axes && matrix) {
        // New rows first, so the matrix that follows can name every variant.
        const withIds = await createMissingVariants(productId, matrix.rows)
        sent = withIds.filter((row) => !!row.variantId)
        await patch.mutateAsync({
          productId,
          patch: {
            variation_axes: axesPayload(matrix.axes),
            variants: patchVariantsPayload(matrix.axes, withIds),
            ...(revalidate ? { revalidate: true } : {}),
          },
        })
        await repriceTouchedRows(withIds)
      }

      setSavedAt(Date.now())
      return productId
    } catch (err) {
      const variationProblems = variationProblemsFrom(err)
      if (variationProblems) {
        const { rows, unattached } = problemsOntoRows(variationProblems, sent)
        setVariantErrors(rows)
        setNotice(
          unattached.length > 0
            ? `The variant grid was refused. ${unattached.join(" ")}`
            : "The variant grid was refused. Each problem is marked on the row it belongs to.",
        )
        return null
      }

      const attributeErrors = attributeErrorsFrom(err)
      if (attributeErrors) {
        setServerErrors(mergeServerErrors({}, attributeErrors))
        setNotice("The catalogue refused some answers. Each one is marked on the field it belongs to.")
        return null
      }

      const needsReview = revalidationFrom(err)
      if (needsReview) {
        setRevalidation({
          fields: needsReview.fields,
          confirm: () => {
            const again = pending.current
            if (again) void sendRef.current(again.body, true, again.matrix)
          },
          cancel: () => setRevalidation(null),
        })
        return null
      }

      const refused = notPatchableFrom(err)
      if (refused) {
        setNotice(
          refused.patchable.length > 0
            ? `${refused.message} What can still be changed: ${refused.patchable.join(", ")}.`
            : refused.message,
        )
        return null
      }

      setNotice(apiMessage(err, "Could not save this listing. Nothing was changed."))
      return null
    } finally {
      setSaving(false)
    }
  }
  sendRef.current = send

  return {
    productId,
    saving,
    serverErrors,
    clearServerError,
    variantErrors,
    notice,
    savedAt,
    revalidation,
    // `revalidate` is false on every first attempt, without exception. The 409
    // exists so a human decides what a re-review costs; sending true up front
    // would answer that question on their behalf.
    save: async (body, matrix) => (await send(body, false, matrix)) !== null,
    submitForReview: async (body, matrix) => {
      const id = await send(body, false, matrix)
      if (!id) return false
      try {
        await submit.mutateAsync(id)
        return true
      } catch (err) {
        setNotice(apiMessage(err, "Saved, but the listing could not be sent for review."))
        return false
      }
    },
  }
}
