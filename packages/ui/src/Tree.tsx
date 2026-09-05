"use client"

import { useCallback, useState } from "react"
import { ChevronDown, ChevronRight, ChevronUp } from "lucide-react"
import { cn } from "./cn"

export interface TreeNode {
  id: string
  label: React.ReactNode
  /** Secondary line — a slug, a product count, whatever the row needs. */
  meta?: React.ReactNode
  children?: TreeNode[]
  disabled?: boolean
}

export interface TreeProps {
  nodes: TreeNode[]
  /** Controlled selection. Omit for a tree that only expands and collapses. */
  selectedId?: string | null
  onSelect?: (node: TreeNode) => void
  /** Controlled expansion. Omit and the tree keeps its own. */
  expandedIds?: string[]
  onExpandedChange?: (ids: string[]) => void
  defaultExpandedIds?: string[]
  /**
   * Reorder within a node's own sibling list. `direction` is -1 for up, 1 for
   * down; the tree only fires it when the move is possible.
   *
   * Buttons, not drag-and-drop: v1 needs reordering that works on a phone, with
   * a keyboard, and without a new dependency. Drag can come later.
   */
  onReorder?: (node: TreeNode, direction: -1 | 1, siblings: TreeNode[]) => void
  /** Trailing controls for a row — rename, delete, add child. */
  renderActions?: (node: TreeNode) => React.ReactNode
  emptyMessage?: React.ReactNode
  className?: string
  "aria-label"?: string
}

const INDENT_PX = 20

export function Tree({
  nodes,
  selectedId,
  onSelect,
  expandedIds,
  onExpandedChange,
  defaultExpandedIds,
  onReorder,
  renderActions,
  emptyMessage = "Nothing here yet.",
  className,
  ...props
}: TreeProps) {
  const [internal, setInternal] = useState<string[]>(defaultExpandedIds ?? [])
  const expanded = expandedIds ?? internal

  const toggle = useCallback(
    (id: string) => {
      const next = expanded.includes(id)
        ? expanded.filter((x) => x !== id)
        : [...expanded, id]
      if (expandedIds === undefined) setInternal(next)
      onExpandedChange?.(next)
    },
    [expanded, expandedIds, onExpandedChange],
  )

  if (nodes.length === 0) {
    return <p className="text-sm text-brand-text/50">{emptyMessage}</p>
  }

  return (
    <ul role="tree" aria-label={props["aria-label"]} className={cn("flex flex-col", className)}>
      {nodes.map((node, index) => (
        <TreeBranch
          key={node.id}
          node={node}
          siblings={nodes}
          index={index}
          depth={0}
          expanded={expanded}
          toggle={toggle}
          selectedId={selectedId}
          onSelect={onSelect}
          onReorder={onReorder}
          renderActions={renderActions}
        />
      ))}
    </ul>
  )
}

interface BranchProps {
  node: TreeNode
  siblings: TreeNode[]
  index: number
  depth: number
  expanded: string[]
  toggle: (id: string) => void
  selectedId?: string | null
  onSelect?: (node: TreeNode) => void
  onReorder?: (node: TreeNode, direction: -1 | 1, siblings: TreeNode[]) => void
  renderActions?: (node: TreeNode) => React.ReactNode
}

function TreeBranch({
  node,
  siblings,
  index,
  depth,
  expanded,
  toggle,
  selectedId,
  onSelect,
  onReorder,
  renderActions,
}: BranchProps) {
  const children = node.children ?? []
  const hasChildren = children.length > 0
  const isOpen = hasChildren && expanded.includes(node.id)
  const selected = selectedId === node.id

  return (
    <li role="treeitem" aria-expanded={hasChildren ? isOpen : undefined} aria-selected={selected}>
      <div
        className={cn(
          "group flex items-center gap-1 rounded-lg pr-1 transition-colors",
          selected ? "bg-brand-text/10" : "hover:bg-brand-text/5",
          node.disabled && "opacity-50",
        )}
        style={{ paddingLeft: depth * INDENT_PX }}
      >
        {hasChildren ? (
          <button
            type="button"
            aria-label={isOpen ? "Collapse" : "Expand"}
            onClick={() => toggle(node.id)}
            className="shrink-0 rounded p-1 text-brand-text/50 hover:bg-brand-text/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-text/50"
          >
            {isOpen ? (
              <ChevronDown aria-hidden="true" className="h-4 w-4" />
            ) : (
              <ChevronRight aria-hidden="true" className="h-4 w-4" />
            )}
          </button>
        ) : (
          // Keeps leaves aligned with their expandable siblings.
          <span aria-hidden="true" className="h-6 w-6 shrink-0" />
        )}

        <button
          type="button"
          disabled={node.disabled}
          onClick={() => onSelect?.(node)}
          className="flex min-w-0 flex-1 flex-col items-start gap-0.5 rounded px-1 py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-text/50 disabled:pointer-events-none"
        >
          <span className="truncate text-sm text-brand-text">{node.label}</span>
          {node.meta && <span className="truncate text-xs text-brand-text/50">{node.meta}</span>}
        </button>

        {onReorder && (
          <span className="flex shrink-0 items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
            <button
              type="button"
              aria-label={`Move ${typeof node.label === "string" ? node.label : "item"} up`}
              disabled={index === 0}
              onClick={() => onReorder(node, -1, siblings)}
              className="rounded p-1 text-brand-text/50 hover:bg-brand-text/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-text/50 disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ChevronUp aria-hidden="true" className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label={`Move ${typeof node.label === "string" ? node.label : "item"} down`}
              disabled={index === siblings.length - 1}
              onClick={() => onReorder(node, 1, siblings)}
              className="rounded p-1 text-brand-text/50 hover:bg-brand-text/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-text/50 disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ChevronDown aria-hidden="true" className="h-4 w-4" />
            </button>
          </span>
        )}

        {renderActions && <span className="flex shrink-0 items-center">{renderActions(node)}</span>}
      </div>

      {isOpen && (
        <ul role="group" className="flex flex-col">
          {children.map((child, childIndex) => (
            <TreeBranch
              key={child.id}
              node={child}
              siblings={children}
              index={childIndex}
              depth={depth + 1}
              expanded={expanded}
              toggle={toggle}
              selectedId={selectedId}
              onSelect={onSelect}
              onReorder={onReorder}
              renderActions={renderActions}
            />
          ))}
        </ul>
      )}
    </li>
  )
}
