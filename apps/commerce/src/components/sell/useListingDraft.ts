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
import { useSubmitProduct } from "@/hooks/useSellerDashboard"
import {
  apiMessage,
  attributeErrorsFrom,
  clearScratch,
  notPatchableFrom,
  revalidationFrom,
} from "@/lib/listing"

export interface RevalidationPrompt {
  /** The fields the server says would send the listing back for review. */
  fields: string[]
  /** Re-send the very same edit, this time with `revalidate: true`. */
  confirm: () => void
  cancel: () => void
}

export interface ListingDraft {
  productId: string | null
  saving: boolean
  /** Per-attribute messages the server rejected the last save with. */
  serverErrors: FieldErrorMap
  clearServerError: (code: string) => void
  /** A one-line problem that belongs to the whole form, not one field. */
  notice: string | null
  /** Set once a save lands, for the "Saved" line. */
  savedAt: number | null
  revalidation: RevalidationPrompt | null
  /** Create on the first save, PATCH on every one after. Resolves true when the server took it. */
  save: (body: ListingCreatePayload) => Promise<boolean>
  /** Save, then hand the draft to review. */
  submitForReview: (body: ListingCreatePayload) => Promise<boolean>
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
  const [notice, setNotice] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [revalidation, setRevalidation] = useState<RevalidationPrompt | null>(null)
  const [saving, setSaving] = useState(false)

  // The body of the save that hit the 409, kept so "yes, send it back for
  // review" re-sends exactly that edit rather than whatever the form holds a
  // few keystrokes later.
  const pending = useRef<ListingCreatePayload | null>(null)
  // `send` calls itself for that retry. Going through a ref keeps it out of its
  // own dependency list instead of tying a knot for no benefit.
  const sendRef = useRef<(body: ListingCreatePayload, revalidate: boolean) => Promise<string | null>>(
    async () => null,
  )

  const clearServerError = useCallback((code: string) => {
    setServerErrors((prev) => {
      if (!prev[code]) return prev
      const next = { ...prev }
      delete next[code]
      return next
    })
  }, [])

  async function send(body: ListingCreatePayload, revalidate: boolean): Promise<string | null> {
    setSaving(true)
    setServerErrors({})
    setNotice(null)
    setRevalidation(null)
    pending.current = body
    try {
      if (!productId) {
        const created = await create.mutateAsync({ ...body, status: "draft" })
        setProductId(created.id)
        // The server now holds it. Nothing local may claim to.
        clearScratch(categoryId)
        setSavedAt(Date.now())
        return created.id
      }

      // Variants are their own routes; the product PATCH allowlist does not
      // take them, and sending one would earn a FIELD_NOT_PATCHABLE by name.
      const { variants: _variants, ...patchable } = body
      const payload: ListingPatchPayload = revalidate ? { ...patchable, revalidate: true } : patchable
      await patch.mutateAsync({ productId, patch: payload })
      setSavedAt(Date.now())
      return productId
    } catch (err) {
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
            if (again) void sendRef.current(again, true)
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
    notice,
    savedAt,
    revalidation,
    // `revalidate` is false on every first attempt, without exception. The 409
    // exists so a human decides what a re-review costs; sending true up front
    // would answer that question on their behalf.
    save: async (body) => (await send(body, false)) !== null,
    submitForReview: async (body) => {
      const id = await send(body, false)
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
