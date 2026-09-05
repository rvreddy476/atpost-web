"use client"

import { useId, useRef } from "react"
import { cn } from "./cn"

export interface TabItem {
  id: string
  label: React.ReactNode
  /** Small count or status pill after the label — the listing form's "3 / 5". */
  badge?: React.ReactNode
  /** Draws the tab in the error colour; for a group holding a rejected field. */
  invalid?: boolean
  disabled?: boolean
}

export interface TabsProps {
  items: TabItem[]
  value: string
  onChange: (id: string) => void
  "aria-label"?: string
  className?: string
  children?: React.ReactNode
}

/**
 * A controlled tablist for the listing form's field groups. Follows the WAI
 * pattern: one tab in the sequence, arrow keys to move between them, Home/End
 * to jump. Panels are rendered by the caller — the form only ever mounts the
 * active group, and keeping the panel outside means it can live anywhere.
 */
export function Tabs({ items, value, onChange, className, children, ...props }: TabsProps) {
  const baseId = useId()
  const listRef = useRef<HTMLDivElement>(null)

  const tabId = (id: string) => `${baseId}-tab-${id}`
  const panelId = (id: string) => `${baseId}-panel-${id}`

  function move(delta: number) {
    const enabled = items.filter((i) => !i.disabled)
    if (enabled.length === 0) return
    const current = enabled.findIndex((i) => i.id === value)
    const next = enabled[(current + delta + enabled.length) % enabled.length]
    onChange(next.id)
    listRef.current?.querySelector<HTMLButtonElement>(`#${CSS.escape(tabId(next.id))}`)?.focus()
  }

  function jump(index: number) {
    const enabled = items.filter((i) => !i.disabled)
    const target = index < 0 ? enabled[enabled.length - 1] : enabled[0]
    if (!target) return
    onChange(target.id)
    listRef.current?.querySelector<HTMLButtonElement>(`#${CSS.escape(tabId(target.id))}`)?.focus()
  }

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div
        ref={listRef}
        role="tablist"
        aria-label={props["aria-label"]}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") {
            e.preventDefault()
            move(1)
          } else if (e.key === "ArrowLeft") {
            e.preventDefault()
            move(-1)
          } else if (e.key === "Home") {
            e.preventDefault()
            jump(0)
          } else if (e.key === "End") {
            e.preventDefault()
            jump(-1)
          }
        }}
        className="flex gap-1 overflow-x-auto border-b border-brand-text/10"
      >
        {items.map((item) => {
          const active = item.id === value
          return (
            <button
              key={item.id}
              type="button"
              id={tabId(item.id)}
              role="tab"
              aria-selected={active}
              aria-controls={panelId(item.id)}
              tabIndex={active ? 0 : -1}
              disabled={item.disabled}
              onClick={() => onChange(item.id)}
              className={cn(
                "-mb-px flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-text/50 disabled:pointer-events-none disabled:opacity-40",
                active
                  ? "border-brand-text font-medium text-brand-text"
                  : "border-transparent text-brand-text/60 hover:text-brand-text",
                item.invalid && "text-red-500",
              )}
            >
              {item.label}
              {item.badge !== undefined && item.badge !== null && (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[11px] tabular-nums",
                    item.invalid
                      ? "bg-red-500/10 text-red-500"
                      : "bg-brand-text/10 text-brand-text/70",
                  )}
                >
                  {item.badge}
                </span>
              )}
            </button>
          )
        })}
      </div>
      <div role="tabpanel" id={panelId(value)} aria-labelledby={tabId(value)}>
        {children}
      </div>
    </div>
  )
}
