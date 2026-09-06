"use client"

import { useMemo, useState } from "react"
import type { Category } from "@atpost/types/commerce"
import { Input, Tree, type TreeNode } from "@atpost/ui"

/**
 * Step one of the guided listing: which category is this?
 *
 * A grouping node — `is_listable: false` — cannot carry a listing, but it is
 * how a seller reaches the one that can, so clicking it opens it instead of
 * selecting it. Nothing is ever hidden: a seller who cannot find "Shirts" under
 * "Fashion" concludes we do not sell shirts.
 */
export function CategoryPicker({
  categories,
  isLoading,
  error,
  onPick,
}: {
  categories: Category[]
  isLoading: boolean
  error: string | null
  onPick: (category: Category) => void
}) {
  const [query, setQuery] = useState("")
  const [expanded, setExpanded] = useState<string[]>([])

  const byId = useMemo(() => index(categories), [categories])
  const filtered = useMemo(() => filterTree(categories, query.trim().toLowerCase()), [categories, query])
  const nodes = useMemo(() => filtered.map(toNode), [filtered])

  // A search shows its matches already opened; otherwise the tree starts closed
  // so the top level is readable at a glance.
  const expandedIds = query.trim() ? Array.from(byId.keys()) : expanded

  if (error) return <p className="text-sm text-shop-bad">{error}</p>

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="category-search" className="text-sm font-medium text-brand-text">
          Find a category
        </label>
        <Input
          id="category-search"
          value={query}
          placeholder="Search categories"
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {isLoading ? (
        <p className="text-sm text-shop-faint">Loading categories…</p>
      ) : (
        <Tree
          aria-label="Categories"
          nodes={nodes}
          expandedIds={expandedIds}
          onExpandedChange={setExpanded}
          emptyMessage={query ? `No category matches “${query}”.` : "No categories yet."}
          onSelect={(node) => {
            const category = byId.get(node.id)
            if (!category) return
            if (!category.is_listable) {
              // Drill in rather than select. Selecting it would only earn a
              // rejection from the create route a dozen fields later.
              setExpanded((prev) =>
                prev.includes(node.id) ? prev.filter((id) => id !== node.id) : [...prev, node.id],
              )
              return
            }
            onPick(category)
          }}
        />
      )}
    </div>
  )
}

function index(categories: Category[], into = new Map<string, Category>()): Map<string, Category> {
  for (const category of categories) {
    into.set(category.id, category)
    if (category.children?.length) index(category.children, into)
  }
  return into
}

function toNode(category: Category): TreeNode {
  return {
    id: category.id,
    label: category.name,
    meta: category.is_listable
      ? `${category.product_count} listed`
      : "Grouping only — open it to pick a subcategory",
    children: category.children?.map(toNode),
  }
}

/** Keeps a node when it matches, or when any descendant does. */
function filterTree(categories: Category[], needle: string): Category[] {
  if (!needle) return categories
  const kept: Category[] = []
  for (const category of categories) {
    const children = filterTree(category.children ?? [], needle)
    const hit = category.name.toLowerCase().includes(needle) || category.slug.toLowerCase().includes(needle)
    if (hit || children.length > 0) kept.push({ ...category, children: hit ? category.children : children })
  }
  return kept
}
