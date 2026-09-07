"use client"

import { useCallback, useState } from "react"
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query"
import api from "@atpost/api-client"
import { useToast } from "@atpost/ui"
import type { AttributeSchema, AttributeScope, Category } from "@atpost/types/commerce"
import {
  apiErrorMessage,
  normaliseBinding,
  normaliseDefinition,
  normaliseEnumValue,
  normaliseImpact,
  normaliseSchemaState,
  parseImpactConflict,
  rows,
  unwrap,
  type CategoryAttributeBinding,
  type DefinitionRecord,
  type EnumValueRecord,
  type ImpactConflict,
  type ImpactCounts,
  type SchemaState,
} from "@/lib/catalogue"

/** Everything the founder authors goes through admin-service's catalogue proxy. */
export const CATALOGUE = "/v1/admin/commerce/catalogue"
/** The unauthenticated routes the shop itself reads. The preview uses these. */
export const PUBLIC_COMMERCE = "/v1/commerce"

export const catalogueKeys = {
  all: ["catalogue"] as const,
  // `gate` used to key AdminGate's access probe. The gate now reads
  // /v1/auth/me/capabilities, whose cache key lives with the hook that owns it.
  categories: ["catalogue", "categories"] as const,
  schemaState: ["catalogue", "schema-state"] as const,
  definitions: ["catalogue", "definitions"] as const,
  definition: (id: string) => ["catalogue", "definition", id] as const,
  impact: (id: string) => ["catalogue", "impact", id] as const,
  enumValues: (defId: string) => ["catalogue", "enum-values", defId] as const,
  categoryAttributes: (categoryId: string) =>
    ["catalogue", "category-attributes", categoryId] as const,
  preview: (categoryId: string, scope: string) =>
    ["catalogue", "preview", categoryId, scope] as const,
}

// ── Queries ─────────────────────────────────────────────────────

/** The same tree=true payload the shop's category nav consumes. */
export function useCategoryTree() {
  return useQuery<Category[]>({
    queryKey: catalogueKeys.categories,
    queryFn: async () => {
      return rows((await api.get(`${PUBLIC_COMMERCE}/categories?tree=true`)).data) as Category[]
    },
  })
}

export function useSchemaState() {
  return useQuery<SchemaState>({
    queryKey: catalogueKeys.schemaState,
    queryFn: async () =>
      normaliseSchemaState(unwrap((await api.get(`${CATALOGUE}/attribute-schema`)).data)),
  })
}

export function useDefinitions() {
  return useQuery<DefinitionRecord[]>({
    queryKey: catalogueKeys.definitions,
    queryFn: async () => {
      return rows((await api.get(`${CATALOGUE}/attribute-definitions`)).data).map(normaliseDefinition)
    },
  })
}

export function useEnumValues(defId: string | null) {
  return useQuery<EnumValueRecord[]>({
    queryKey: catalogueKeys.enumValues(defId ?? "none"),
    enabled: !!defId,
    queryFn: async () => {
      return rows((await api.get(`${CATALOGUE}/attribute-definitions/${defId}/enum-values`)).data)
        .map(normaliseEnumValue)
        .sort((a, b) => a.sort_order - b.sort_order)
    },
  })
}

export function useDefinitionImpact(defId: string | null, enabled = true) {
  return useQuery<ImpactCounts>({
    queryKey: catalogueKeys.impact(defId ?? "none"),
    enabled: !!defId && enabled,
    queryFn: async () =>
      normaliseImpact((await api.get(`${CATALOGUE}/attribute-definitions/${defId}/impact`)).data),
  })
}

/** A category's OWN bindings — never the inherited ones. */
export function useCategoryAttributes(categoryId: string | null) {
  return useQuery<CategoryAttributeBinding[]>({
    queryKey: catalogueKeys.categoryAttributes(categoryId ?? "none"),
    enabled: !!categoryId,
    queryFn: () => fetchCategoryAttributes(categoryId as string),
  })
}

async function fetchCategoryAttributes(categoryId: string): Promise<CategoryAttributeBinding[]> {
  return rows((await api.get(`${CATALOGUE}/categories/${categoryId}/attributes`)).data)
    .map(normaliseBinding)
    .sort((a, b) => a.sort_order - b.sort_order)
}

/**
 * The ancestors' own bindings, one query each.
 *
 * Inheritance is resolved here rather than read off the effective schema
 * because the effective schema cannot say WHICH ancestor contributed a row —
 * and "brand comes from Fashion" is the whole reason the founder trusts the
 * inherited half of the table instead of retyping it twelve times.
 */
export function useAncestorAttributes(ancestorIds: string[]) {
  return useQueries({
    queries: ancestorIds.map((id) => ({
      queryKey: catalogueKeys.categoryAttributes(id),
      queryFn: () => fetchCategoryAttributes(id),
    })),
  })
}

/** The seller-form preview reads exactly what the shop reads. */
export function useAttributeSchemaPreview(categoryId: string | null, scope: AttributeScope | "all") {
  return useQuery<AttributeSchema | null>({
    queryKey: catalogueKeys.preview(categoryId ?? "none", scope),
    enabled: !!categoryId,
    queryFn: async () => {
      const body = unwrap<AttributeSchema>(
        (
          await api.get(
            `${PUBLIC_COMMERCE}/categories/${categoryId}/attribute-schema?scope=${scope}`,
          )
        ).data,
      )
      return body ?? null
    },
  })
}

// ── Mutations ───────────────────────────────────────────────────

/**
 * One edit, expressed as a thing that can be attempted twice: once without an
 * acknowledgement, and — only if a human read the impact and pressed Apply —
 * once with it.
 */
export interface CatalogueCommand {
  request: (ack: number | null) => Promise<unknown>
  /** What the founder is about to do, in words, for the impact dialog. */
  what: string
  /** Toast title on success. */
  success: string
  invalidate?: readonly (readonly unknown[])[]
}

export interface NarrowingPrompt {
  conflict: ImpactConflict
  what: string
}

export interface CatalogueRunner {
  run: (command: CatalogueCommand) => void
  isPending: boolean
  prompt: NarrowingPrompt | null
  confirm: () => void
  cancel: () => void
}

function withAck(path: string, ack: number | null): string {
  if (ack === null) return path
  return `${path}${path.includes("?") ? "&" : "?"}ack_impact=${ack}`
}

/**
 * The single mutation path for the whole console.
 *
 * Every attempt starts with `ack = null`. An acknowledgement is only ever
 * produced by the confirm button below, which cannot appear until the server
 * has refused once and the founder has read the number it refused with — the
 * point of the 409 is that a person sees the count, so it is never guessed,
 * pre-fetched or replayed.
 */
export function useCatalogueRunner(): CatalogueRunner {
  const qc = useQueryClient()
  const { success, error } = useToast()
  const [pending, setPending] = useState<{ command: CatalogueCommand; conflict: ImpactConflict } | null>(
    null,
  )

  const mutation = useMutation({
    mutationFn: ({ command, ack }: { command: CatalogueCommand; ack: number | null }) =>
      command.request(ack),
    onSuccess: (_data, { command }) => {
      setPending(null)
      for (const key of command.invalidate ?? [catalogueKeys.all]) {
        qc.invalidateQueries({ queryKey: key as unknown[] })
      }
      success(command.success)
    },
    onError: (err, { command, ack }) => {
      const conflict = parseImpactConflict(err)
      // Re-prompt when the server refuses with a number we have not shown yet —
      // including the case where the count moved between the two attempts. The
      // founder confirms the new number; nothing retries on its own.
      if (conflict && conflict.affected !== ack) {
        setPending({ command, conflict })
        return
      }
      setPending(null)
      error(
        ack === null ? "Change refused" : "Change refused even with the acknowledgement",
        apiErrorMessage(err, "The server did not say why."),
      )
    },
  })

  const run = useCallback(
    (command: CatalogueCommand) => mutation.mutate({ command, ack: null }),
    // `mutation` is a stable object from TanStack Query; mutate is bound to it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mutation.mutate],
  )

  const confirm = useCallback(() => {
    if (!pending) return
    mutation.mutate({ command: pending.command, ack: pending.conflict.affected })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, mutation.mutate])

  const cancel = useCallback(() => setPending(null), [])

  return {
    run,
    isPending: mutation.isPending,
    prompt: pending ? { conflict: pending.conflict, what: pending.command.what } : null,
    confirm,
    cancel,
  }
}

// ── Commands ────────────────────────────────────────────────────

const CATEGORY_KEYS = [catalogueKeys.categories, catalogueKeys.schemaState] as const

export const commands = {
  createCategory: (body: Record<string, unknown>, name: string): CatalogueCommand => ({
    request: (ack) => api.post(withAck(`${CATALOGUE}/categories`, ack), body),
    what: `Create the category “${name}”.`,
    success: `Category “${name}” created`,
    invalidate: CATEGORY_KEYS,
  }),

  patchCategory: (
    categoryId: string,
    body: Record<string, unknown>,
    what: string,
    success: string,
  ): CatalogueCommand => ({
    request: (ack) => api.patch(withAck(`${CATALOGUE}/categories/${categoryId}`, ack), body),
    what,
    success,
    invalidate: CATEGORY_KEYS,
  }),

  /**
   * Swap two siblings' `display_order`. Two PATCHes inside one command so the
   * pair is one undoable thought to the founder and one toast on screen.
   */
  reorderCategories: (
    moved: { id: string; name: string; display_order: number },
    neighbour: { id: string; display_order: number },
    fallback: { moved: number; neighbour: number },
  ): CatalogueCommand => {
    // Equal orders (a tree seeded with zeroes) would make the swap a no-op, so
    // fall back to the two rows' positions in the sibling list.
    const same = moved.display_order === neighbour.display_order
    const movedTo = same ? fallback.neighbour : neighbour.display_order
    const neighbourTo = same ? fallback.moved : moved.display_order
    return {
      request: async (ack) => {
        await api.patch(withAck(`${CATALOGUE}/categories/${moved.id}`, ack), {
          display_order: movedTo,
        })
        await api.patch(withAck(`${CATALOGUE}/categories/${neighbour.id}`, ack), {
          display_order: neighbourTo,
        })
      },
      what: `Move “${moved.name}” among its siblings.`,
      success: `“${moved.name}” moved`,
      invalidate: CATEGORY_KEYS,
    }
  },

  setCategoryAttributes: (
    categoryId: string,
    attributes: Record<string, unknown>[],
    what: string,
    success: string,
  ): CatalogueCommand => ({
    request: (ack) =>
      api.put(withAck(`${CATALOGUE}/categories/${categoryId}/attributes`, ack), { items: attributes }),
    what,
    success,
    invalidate: [
      catalogueKeys.categoryAttributes(categoryId),
      catalogueKeys.schemaState,
      ["catalogue", "preview"],
    ],
  }),

  createDefinition: (body: Record<string, unknown>, label: string): CatalogueCommand => ({
    request: (ack) => api.post(withAck(`${CATALOGUE}/attribute-definitions`, ack), body),
    what: `Create the attribute “${label}”.`,
    success: `Attribute “${label}” created`,
    invalidate: [catalogueKeys.definitions, catalogueKeys.schemaState],
  }),

  patchDefinition: (
    defId: string,
    body: Record<string, unknown>,
    what: string,
    success: string,
  ): CatalogueCommand => ({
    request: (ack) =>
      api.patch(withAck(`${CATALOGUE}/attribute-definitions/${defId}`, ack), body),
    what,
    success,
    invalidate: [
      catalogueKeys.definitions,
      catalogueKeys.definition(defId),
      catalogueKeys.impact(defId),
      catalogueKeys.schemaState,
      ["catalogue", "preview"],
    ],
  }),

  createEnumValue: (
    defId: string,
    body: Record<string, unknown>,
    label: string,
  ): CatalogueCommand => ({
    request: (ack) =>
      api.post(withAck(`${CATALOGUE}/attribute-definitions/${defId}/enum-values`, ack), body),
    what: `Add the option “${label}”.`,
    success: `Option “${label}” added`,
    invalidate: [catalogueKeys.enumValues(defId), catalogueKeys.definitions, catalogueKeys.schemaState],
  }),

  /**
   * Paste-in options, created in order. Typing forty options one at a time is
   * how a category gets abandoned half-built, so this is one command, one
   * toast, and one place for a failure to surface.
   */
  bulkCreateEnumValues: (
    defId: string,
    rows: { code: string; label: string }[],
    startSortOrder: number,
  ): CatalogueCommand => ({
    request: async (ack) => {
      for (const [index, row] of rows.entries()) {
        await api.post(withAck(`${CATALOGUE}/attribute-definitions/${defId}/enum-values`, ack), {
          code: row.code,
          value: row.code,
          label: row.label,
          sort_order: startSortOrder + index,
          is_active: true,
        })
      }
    },
    what: `Add ${rows.length} options.`,
    success: `${rows.length} option${rows.length === 1 ? "" : "s"} added`,
    invalidate: [catalogueKeys.enumValues(defId), catalogueKeys.definitions, catalogueKeys.schemaState],
  }),

  patchEnumValue: (
    defId: string,
    valueId: string,
    body: Record<string, unknown>,
    what: string,
    success: string,
  ): CatalogueCommand => ({
    request: (ack) =>
      api.patch(
        withAck(`${CATALOGUE}/attribute-definitions/${defId}/enum-values/${valueId}`, ack),
        body,
      ),
    what,
    success,
    invalidate: [
      catalogueKeys.enumValues(defId),
      catalogueKeys.definitions,
      catalogueKeys.impact(defId),
      catalogueKeys.schemaState,
    ],
  }),

  reorderEnumValues: (defId: string, order: string[]): CatalogueCommand => ({
    request: (ack) =>
      api.put(withAck(`${CATALOGUE}/attribute-definitions/${defId}/enum-values/order`, ack), {
        order,
      }),
    what: "Reorder this attribute's options.",
    success: "Option order saved",
    invalidate: [catalogueKeys.enumValues(defId), catalogueKeys.schemaState],
  }),

  publish: (version: number | null): CatalogueCommand => ({
    request: (ack) => api.post(withAck(`${CATALOGUE}/attribute-schema/publish`, ack), {}),
    what: "Publish the draft taxonomy to every seller and shopper.",
    success:
      version === null ? "Taxonomy published" : `Taxonomy published over version ${version}`,
    invalidate: [catalogueKeys.all],
  }),
}
