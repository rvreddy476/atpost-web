"use client"

import { CircleDot, CloudUpload, Loader2 } from "lucide-react"
import { Button } from "@atpost/ui"
import { commands, type CatalogueRunner } from "@/hooks/useCatalogue"
import type { SchemaState } from "@/lib/catalogue"

/**
 * Draft state, made impossible to miss.
 *
 * Saving a definition does not put it in front of a seller — publishing does.
 * Without this strip a half-typed attribute looks identical to a live one, and
 * the founder finds out which it was from a support ticket.
 */
export function PublishBar({
  state,
  isLoading,
  runner,
}: {
  state: SchemaState | undefined
  isLoading: boolean
  runner: CatalogueRunner
}) {
  const dirty = state?.draft_dirty ?? false

  return (
    <div
      data-testid="publish-bar"
      className={[
        "mb-6 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3",
        dirty ? "border-amber-300 bg-amber-50" : "border-gray-200 bg-white",
      ].join(" ")}
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-gray-400" aria-hidden="true" />
      ) : (
        <CircleDot
          aria-hidden="true"
          className={dirty ? "h-4 w-4 text-amber-600" : "h-4 w-4 text-emerald-600"}
        />
      )}
      <div className="min-w-0 flex-1">
        <p className={dirty ? "text-sm font-semibold text-amber-900" : "text-sm font-medium text-gray-900"}>
          {isLoading
            ? "Reading draft state…"
            : dirty
              ? "Unpublished changes"
              : "Everything is published"}
        </p>
        <p className="text-xs text-gray-600">
          {state?.published_version === null || state?.published_version === undefined
            ? "No version has been published yet."
            : `Live version ${state.published_version}.`}
          {dirty
            ? " Sellers still see the last published taxonomy until you publish."
            : " Sellers see exactly what is below."}
        </p>
      </div>
      <Button
        onClick={() => runner.run(commands.publish(state?.published_version ?? null))}
        disabled={runner.isPending || isLoading || !dirty}
      >
        <CloudUpload className="h-4 w-4" aria-hidden="true" />
        Publish
      </Button>
    </div>
  )
}
