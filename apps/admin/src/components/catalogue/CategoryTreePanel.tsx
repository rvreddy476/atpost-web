"use client"

import { useMemo, useState } from "react"
import { FolderPlus, Pencil, Plus } from "lucide-react"
import type { Category } from "@atpost/types/commerce"
import { Button, Dialog, Input, Switch, Tree, type TreeNode } from "@atpost/ui"
import {
  categoryChildren,
  categoryPath,
  expandedIdsFor,
  findCategory,
  toTreeNodes,
} from "@/lib/catalogue"
import { commands, type CatalogueRunner } from "@/hooks/useCatalogue"

/**
 * The category taxonomy itself.
 *
 * There is deliberately no delete. A category id is a value clients keep — it
 * is written into every product row, cached in the shop's nav, and pasted into
 * links people have bookmarked — so a node that should no longer be used is
 * deactivated (`is_active: false`), never removed. The admin API has no DELETE
 * for the same reason.
 */
export function CategoryTreePanel({
  categories,
  isLoading,
  error,
  selectedId,
  onSelect,
  runner,
}: {
  categories: Category[]
  isLoading: boolean
  error: string | null
  selectedId: string | null
  onSelect: (id: string) => void
  runner: CatalogueRunner
}) {
  const nodes = useMemo(() => toTreeNodes(categories), [categories])
  const [expanded, setExpanded] = useState<string[] | null>(null)
  const [rename, setRename] = useState<Category | null>(null)
  const [addUnder, setAddUnder] = useState<{ parent: Category | null } | null>(null)

  const selected = selectedId ? findCategory(categories, selectedId) : null
  const openIds = expanded ?? expandedIdsFor(categories, selectedId)

  function handleReorder(node: TreeNode, direction: -1 | 1, siblings: TreeNode[]) {
    const index = siblings.findIndex((s) => s.id === node.id)
    const neighbour = siblings[index + direction]
    if (!neighbour) return
    const moved = findCategory(categories, node.id)
    const other = findCategory(categories, neighbour.id)
    if (!moved || !other) return
    runner.run(
      commands.reorderCategories(moved, other, {
        moved: index,
        neighbour: index + direction,
      }),
    )
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-900">Categories</h2>
        <Button size="sm" variant="outline" onClick={() => setAddUnder({ parent: null })}>
          <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Root
        </Button>
      </div>

      {error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : isLoading ? (
        <p className="text-sm text-gray-500">Loading categories…</p>
      ) : (
        <Tree
          aria-label="Product categories"
          nodes={nodes}
          selectedId={selectedId}
          onSelect={(node) => onSelect(node.id)}
          expandedIds={openIds}
          onExpandedChange={setExpanded}
          onReorder={handleReorder}
          emptyMessage="No categories yet. Add a root to begin."
          renderActions={(node) => {
            const category = findCategory(categories, node.id)
            if (!category) return null
            return (
              <>
                <button
                  type="button"
                  aria-label={`Add a child under ${category.name}`}
                  title="Add a child category"
                  onClick={() => setAddUnder({ parent: category })}
                  className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                >
                  <FolderPlus className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label={`Rename ${category.name}`}
                  title="Rename"
                  onClick={() => setRename(category)}
                  className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                >
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                </button>
              </>
            )
          }}
        />
      )}

      {selected && (
        <div className="mt-4 flex flex-col gap-2 border-t border-gray-100 pt-4">
          <p className="text-xs text-gray-500">
            {categoryPath(categories, selected.id)
              .map((c) => c.name)
              .join(" › ")}
          </p>
          <Switch
            label="Visible in the shop"
            description="Turn off to retire a category. Nothing is deleted — its id keeps resolving for products and links that already use it."
            checked={selected.is_active}
            disabled={runner.isPending}
            onChange={(next) =>
              runner.run(
                commands.patchCategory(
                  selected.id,
                  { is_active: next },
                  next
                    ? `Show “${selected.name}” in the shop again.`
                    : `Retire “${selected.name}” — sellers can no longer list under it.`,
                  next ? `“${selected.name}” is visible` : `“${selected.name}” retired`,
                ),
              )
            }
          />
          <Switch
            label="Sellers may list here"
            description="Off makes this a grouping node only: sellers must pick one of its children."
            checked={selected.is_listable}
            disabled={runner.isPending}
            onChange={(next) =>
              runner.run(
                commands.patchCategory(
                  selected.id,
                  { is_listable: next },
                  next
                    ? `Let sellers list directly under “${selected.name}”.`
                    : `Make “${selected.name}” a grouping node — sellers must choose a child instead.`,
                  next
                    ? `Sellers may list under “${selected.name}”`
                    : `“${selected.name}” is grouping only`,
                ),
              )
            }
          />
        </div>
      )}

      <RenameDialog
        category={rename}
        busy={runner.isPending}
        onClose={() => setRename(null)}
        onSubmit={(name) => {
          if (!rename) return
          runner.run(
            commands.patchCategory(
              rename.id,
              { name },
              `Rename “${rename.name}” to “${name}”.`,
              `Renamed to “${name}”`,
            ),
          )
          setRename(null)
        }}
      />

      <AddCategoryDialog
        open={addUnder !== null}
        parent={addUnder?.parent ?? null}
        siblings={
          addUnder?.parent ? categoryChildren(addUnder.parent) : addUnder ? categories : []
        }
        busy={runner.isPending}
        onClose={() => setAddUnder(null)}
        onSubmit={(body, name) => {
          runner.run(commands.createCategory(body, name))
          setAddUnder(null)
        }}
      />
    </section>
  )
}

function RenameDialog({
  category,
  busy,
  onClose,
  onSubmit,
}: {
  category: Category | null
  busy: boolean
  onClose: () => void
  onSubmit: (name: string) => void
}) {
  const [name, setName] = useState("")
  const current = category?.name ?? ""

  return (
    <Dialog open={!!category} onClose={onClose} title="Rename category">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          const next = (name || current).trim()
          if (next !== "" && next !== current) onSubmit(next)
          else onClose()
        }}
      >
        <label className="flex flex-col gap-1 text-sm font-medium text-gray-800">
          Name
          <Input
            autoFocus
            defaultValue={current}
            key={category?.id}
            onChange={(e) => setName(e.target.value)}
            aria-label="Category name"
          />
        </label>
        <p className="text-xs text-gray-500">
          The slug and id do not change — renaming is safe for links and for products already
          filed here.
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function AddCategoryDialog({
  open,
  parent,
  siblings,
  busy,
  onClose,
  onSubmit,
}: {
  open: boolean
  parent: Category | null
  siblings: Category[]
  busy: boolean
  onClose: () => void
  onSubmit: (body: Record<string, unknown>, name: string) => void
}) {
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [listable, setListable] = useState(true)

  const effectiveSlug = slug.trim() === "" ? slugify(name) : slugify(slug)
  const nextOrder = siblings.reduce((max, c) => Math.max(max, c.display_order), -1) + 1

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={parent ? `New category under ${parent.name}` : "New root category"}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim() === "" || effectiveSlug === "") return
          onSubmit(
            {
              name: name.trim(),
              slug: effectiveSlug,
              parent_id: parent?.id ?? null,
              display_order: nextOrder,
              is_active: true,
              is_listable: listable,
            },
            name.trim(),
          )
          setName("")
          setSlug("")
          setListable(true)
        }}
      >
        <label className="flex flex-col gap-1 text-sm font-medium text-gray-800">
          Name
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Running shoes"
            aria-label="New category name"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-gray-800">
          Slug
          <Input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder={slugify(name) || "running-shoes"}
            aria-label="New category slug"
          />
        </label>
        <Switch
          label="Sellers may list here"
          description="Off makes it a grouping node; sellers pick one of its children instead."
          checked={listable}
          onChange={setListable}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || name.trim() === ""}>
            Create
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
