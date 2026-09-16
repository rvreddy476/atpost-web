"use client"

import { useId, useRef, useState } from "react"

export interface TabDef {
  id: string
  label: string
}

/**
 * WAI-ARIA tabs. Only the tabs passed are rendered — the caller has already
 * dropped the ones this admin may not see — and only the selected panel is
 * mounted, so a hidden queue never fetches.
 */
export function Tabs({
  tabs,
  label,
  children,
  initial,
}: {
  tabs: readonly TabDef[]
  label: string
  children: (tabId: string) => React.ReactNode
  initial?: string
}) {
  const [selected, setSelected] = useState(() => (initial && tabs.some((t) => t.id === initial) ? initial : tabs[0]?.id))
  const refs = useRef<Record<string, HTMLButtonElement | null>>({})
  const base = useId()
  const current = tabs.some((t) => t.id === selected) ? selected : tabs[0]?.id
  if (!current) return null

  const move = (delta: number) => {
    const index = tabs.findIndex((t) => t.id === current)
    const next = tabs[(index + delta + tabs.length) % tabs.length]
    setSelected(next.id)
    refs.current[next.id]?.focus()
  }

  return (
    <div>
      <div
        role="tablist"
        aria-label={label}
        className="mb-4 flex flex-wrap gap-1 border-b border-mo"
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") move(1)
          if (e.key === "ArrowLeft") move(-1)
        }}
      >
        {tabs.map((tab) => {
          const active = tab.id === current
          return (
            <button
              key={tab.id}
              ref={(el) => {
                refs.current[tab.id] = el
              }}
              type="button"
              role="tab"
              id={`${base}-tab-${tab.id}`}
              aria-selected={active}
              aria-controls={`${base}-panel-${tab.id}`}
              tabIndex={active ? 0 : -1}
              onClick={() => setSelected(tab.id)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm ${
                active ? "border-mo-cyan font-semibold text-mo-ink" : "border-transparent text-mo-body hover:text-mo-ink"
              }`}
            >
              {tab.label}
            </button>
          )
        })}
      </div>
      <div role="tabpanel" id={`${base}-panel-${current}`} aria-labelledby={`${base}-tab-${current}`}>
        {children(current)}
      </div>
    </div>
  )
}
