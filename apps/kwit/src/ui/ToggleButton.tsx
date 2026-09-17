"use client"

import { useRef, useState } from "react"
import { PILL_ACTION, PILL_ACTION_ON } from "./styles"

/**
 * An optimistic on/off action (follow, save): moves on the press, rolls back
 * and reports through `onError` if the server refuses.
 */
export function ToggleButton({
  initial,
  perform,
  onError,
  onLabel,
  offLabel,
  icon,
  describedBy,
}: {
  initial: boolean
  perform: (next: boolean) => Promise<void>
  onError: (error: unknown) => void
  onLabel: string
  offLabel: string
  icon?: React.ReactNode
  describedBy?: string
}) {
  const [on, setOn] = useState(initial)
  const inFlight = useRef(false)

  const press = () => {
    if (inFlight.current) return
    inFlight.current = true
    const before = on
    setOn(!before)
    perform(!before)
      .catch((error: unknown) => {
        setOn(before)
        onError(error)
      })
      .finally(() => {
        inFlight.current = false
      })
  }

  return (
    <button type="button" aria-pressed={on} aria-describedby={describedBy} onClick={press} className={on ? PILL_ACTION_ON : PILL_ACTION}>
      {icon}
      {on ? onLabel : offLabel}
    </button>
  )
}
