import { orderStatusUI, returnStatusUI } from "@/lib/seller"

/**
 * One status, in the zone's pill. `.status-pill` borrows the text colour for
 * its border, so a status is carried by hue alone and never becomes a solid
 * block competing with the row's one gold figure.
 */
export function OrderStatusPill({ status }: { status: string | undefined | null }) {
  const ui = orderStatusUI(status)
  return <span className={`status-pill ${ui.cls}`}>{ui.label}</span>
}

export function ReturnStatusPill({ status }: { status: string | undefined | null }) {
  const ui = returnStatusUI(status)
  return <span className={`status-pill ${ui.cls}`}>{ui.label}</span>
}
