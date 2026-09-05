"use client"

import { createContext, useContext } from "react"
import { cn } from "./cn"

/**
 * The list-page table, lifted verbatim out of the four places it had been
 * pasted (admin sellers / products / payouts and the seller's own product list)
 * together with the loading, empty and error branches each of them had
 * re-implemented — or, in the case of `error`, had simply not implemented.
 *
 * The class names below are the admin console's existing neutral palette rather
 * than the brand-* tokens the rest of this package uses. That is deliberate for
 * now: this extraction has to render byte-identically to what it replaced. Move
 * it onto brand tokens when the admin zone gets its theme pass, in one edit
 * here instead of four.
 */

type Section = "head" | "body"

const SectionContext = createContext<Section>("body")

/** cn() but empty means "no class attribute at all", matching the original markup. */
function classesOrNone(...parts: (string | false | null | undefined)[]): string | undefined {
  return cn(...parts) || undefined
}

export interface TableProps extends React.HTMLAttributes<HTMLTableElement> {
  /** Replaces the table with a loading line. */
  loading?: boolean
  loadingMessage?: React.ReactNode
  /** Replaces the table with the empty message. Ignored while loading. */
  empty?: boolean
  emptyMessage?: React.ReactNode
  /** Replaces the table with an error line. Wins over loading and empty. */
  error?: string | null
  /** Class for the rounded border around the table. */
  wrapperClassName?: string
}

export function Table({
  loading,
  loadingMessage = "Loading…",
  empty,
  emptyMessage = "Nothing to show.",
  error,
  wrapperClassName,
  className,
  children,
  ...props
}: TableProps) {
  if (error) return <p className="text-sm text-red-600">{error}</p>
  if (loading) return <p className="text-gray-500">{loadingMessage}</p>
  if (empty) return <p className="text-gray-500">{emptyMessage}</p>

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-gray-200 bg-white",
        wrapperClassName,
      )}
    >
      <table className={cn("w-full text-sm", className)} {...props}>
        {children}
      </table>
    </div>
  )
}

export function THead({ className, children, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <SectionContext.Provider value="head">
      <thead className={cn("bg-gray-50 text-left text-gray-500", className)} {...props}>
        {children}
      </thead>
    </SectionContext.Provider>
  )
}

export function TBody({ className, children, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <SectionContext.Provider value="body">
      <tbody className={classesOrNone(className)} {...props}>
        {children}
      </tbody>
    </SectionContext.Provider>
  )
}

/** Body rows carry the divider; header rows do not. The section decides, not the caller. */
export function TR({ className, children, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  const section = useContext(SectionContext)
  return (
    <tr
      className={classesOrNone(section === "body" && "border-t border-gray-100", className)}
      {...props}
    >
      {children}
    </tr>
  )
}

export function TH({ className, children, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th className={cn("px-4 py-2", className)} {...props}>
      {children}
    </th>
  )
}

export function TD({ className, children, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn("px-4 py-3", className)} {...props}>
      {children}
    </td>
  )
}
