"use client"

import { Suspense } from "react"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { useDefinitionImpact, useDefinitions, useCatalogueRunner } from "@/hooks/useCatalogue"
import { apiErrorMessage } from "@/lib/catalogue"
import { DefinitionForm } from "@/components/catalogue/DefinitionForm"
import { ImpactDialog } from "@/components/catalogue/ImpactDialog"
import { useRouter, useSearchParams } from "next/navigation"

/**
 * The attribute definition editor, on its own route so it has room for the
 * option list and the regex tester rather than being folded into a dialog.
 *
 * `?definition=new` creates one; `?definition=<id>` edits it. `?category=<id>`
 * is carried through only so Back returns to the category the founder came
 * from.
 */
export default function DefinitionEditorPage() {
  return (
    <Suspense fallback={<p className="text-sm text-gray-500">Loading the attribute…</p>}>
      <DefinitionEditor />
    </Suspense>
  )
}

function DefinitionEditor() {
  const params = useSearchParams()
  const router = useRouter()
  const runner = useCatalogueRunner()
  const definitions = useDefinitions()

  const definitionId = params.get("definition")
  const categoryId = params.get("category")
  const isNew = definitionId === "new" || definitionId === null
  const definition = isNew
    ? null
    : (definitions.data ?? []).find((d) => d.id === definitionId) ?? null

  const impact = useDefinitionImpact(definition?.id ?? null)
  const backHref = categoryId
    ? `/catalogue?category=${encodeURIComponent(categoryId)}`
    : "/catalogue"

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={backHref}
        className="inline-flex w-fit items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Back to the catalogue
      </Link>

      <header>
        <h1 className="text-xl font-semibold">
          {isNew ? "New attribute" : definition ? definition.label : "Attribute"}
        </h1>
        <p className="text-xs text-gray-500">
          {isNew
            ? "Everything sellers will be asked for, and how it is validated."
            : "Saving changes the draft. Sellers see it once the taxonomy is published."}
        </p>
      </header>

      {!isNew && definition && impact.data && (
        <p
          data-testid="definition-impact"
          className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs text-gray-600"
        >
          In use on <span className="font-medium">{impact.data.live_products.toLocaleString()}</span>{" "}
          live products — {impact.data.missing.toLocaleString()} missing a value,{" "}
          {impact.data.out_of_range.toLocaleString()} outside the current limits.
        </p>
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        {definitions.isLoading && !isNew ? (
          <p className="text-sm text-gray-500">Loading the attribute…</p>
        ) : definitions.error ? (
          <p className="text-sm text-red-600">
            {apiErrorMessage(definitions.error, "Could not load attribute definitions.")}
          </p>
        ) : !isNew && !definition ? (
          <p className="text-sm text-gray-500">
            No attribute with that id. It may have been retired.
          </p>
        ) : (
          <DefinitionForm
            key={definition?.id ?? "new"}
            definition={definition}
            runner={runner}
            onDone={() => router.push(backHref)}
          />
        )}
      </div>

      <ImpactDialog
        prompt={runner.prompt}
        isPending={runner.isPending}
        onConfirm={runner.confirm}
        onCancel={runner.cancel}
      />
    </div>
  )
}
