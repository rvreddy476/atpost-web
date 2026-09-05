"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Tabs } from "@atpost/ui"
import { apiErrorMessage, findCategory } from "@/lib/catalogue"
import {
  useAttributeSchemaPreview,
  useCategoryTree,
  useCatalogueRunner,
  useDefinitions,
  useSchemaState,
} from "@/hooks/useCatalogue"
import { CategoryAttributes } from "@/components/catalogue/CategoryAttributes"
import { CategoryTreePanel } from "@/components/catalogue/CategoryTreePanel"
import { ImpactDialog } from "@/components/catalogue/ImpactDialog"
import { PublishBar } from "@/components/catalogue/PublishBar"
import { SellerFormPreview } from "@/components/catalogue/SellerFormPreview"

/**
 * The catalogue console: the taxonomy on the left, what a category asks for on
 * the right, and the seller's own form one tab over. Adding a category or
 * changing a field is authored here and published from the bar at the top —
 * no deploy in the loop.
 */
export default function CataloguePage() {
  return (
    <Suspense fallback={<p className="text-sm text-gray-500">Loading the catalogue…</p>}>
      <CatalogueConsole />
    </Suspense>
  )
}

function CatalogueConsole() {
  const router = useRouter()
  const params = useSearchParams()
  const runner = useCatalogueRunner()

  const categories = useCategoryTree()
  const schemaState = useSchemaState()
  const definitions = useDefinitions()

  const roots = useMemo(() => categories.data ?? [], [categories.data])
  const fromUrl = params.get("category")
  const [selectedId, setSelectedId] = useState<string | null>(fromUrl)
  const [tab, setTab] = useState("attributes")

  // Fall back to the first root once the tree arrives, so the right-hand pane is
  // never an empty stare on first load.
  useEffect(() => {
    if (selectedId && findCategory(roots, selectedId)) return
    if (roots.length > 0) setSelectedId(roots[0].id)
  }, [roots, selectedId])

  const selected = selectedId ? findCategory(roots, selectedId) : null
  const preview = useAttributeSchemaPreview(
    tab === "preview" ? selectedId : null,
    "all",
  )

  function select(id: string) {
    setSelectedId(id)
    router.replace(`/catalogue?category=${encodeURIComponent(id)}`, { scroll: false })
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Catalogue</h1>
        <p className="text-xs text-gray-500">
          Categories, the attributes each one asks for, and the option lists behind them.
        </p>
      </div>

      <PublishBar state={schemaState.data} isLoading={schemaState.isLoading} runner={runner} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <CategoryTreePanel
          categories={roots}
          isLoading={categories.isLoading}
          error={categories.error ? apiErrorMessage(categories.error, "Could not load categories.") : null}
          selectedId={selectedId}
          onSelect={select}
          runner={runner}
        />

        <section className="min-w-0 rounded-xl border border-gray-200 bg-white p-4">
          {selected ? (
            <>
              <h2 className="mb-1 text-sm font-semibold text-gray-900">{selected.name}</h2>
              <p className="mb-3 text-xs text-gray-500">
                {selected.is_listable
                  ? "Sellers list directly here."
                  : "Grouping node — sellers must pick a child."}
              </p>
              <Tabs
                aria-label="Category detail"
                value={tab}
                onChange={setTab}
                items={[
                  { id: "attributes", label: "Attributes" },
                  { id: "preview", label: "Seller form preview" },
                ]}
              >
                {tab === "attributes" ? (
                  <CategoryAttributes
                    category={selected}
                    categories={roots}
                    definitions={definitions.data ?? []}
                    runner={runner}
                    onEditDefinition={(definition) =>
                      router.push(
                        `/catalogue/attributes?definition=${encodeURIComponent(definition.id)}&category=${encodeURIComponent(selected.id)}`,
                      )
                    }
                    onCreateDefinition={() =>
                      router.push(
                        `/catalogue/attributes?definition=new&category=${encodeURIComponent(selected.id)}`,
                      )
                    }
                  />
                ) : (
                  <SellerFormPreview
                    schema={preview.data}
                    isLoading={preview.isLoading}
                    error={
                      preview.error
                        ? apiErrorMessage(preview.error, "Could not load the seller's form.")
                        : null
                    }
                  />
                )}
              </Tabs>
            </>
          ) : (
            <p className="text-sm text-gray-500">
              {categories.isLoading ? "Loading…" : "Select a category to see what it asks for."}
            </p>
          )}
        </section>
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
