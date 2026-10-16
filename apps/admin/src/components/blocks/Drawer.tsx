"use client"

import { useEffect, useId, useRef } from "react"
import { X } from "lucide-react"

/**
 * A side panel on the native <dialog> element, for a record's detail view
 * beside the list it came from. Same guarantees as Dialog: focus moves in and
 * is trapped, the page behind is inert, Escape closes it through `onClose`.
 */
export function Drawer({
  open,
  title,
  subtitle,
  onClose,
  children,
  dismissible = true,
}: {
  open: boolean
  title: string
  subtitle?: React.ReactNode
  onClose: () => void
  children: React.ReactNode
  /** False while a request is in flight. */
  dismissible?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className="admin-dialog admin-drawer border-mo-strong bg-mo-surface p-0 text-mo-ink shadow-mo-lift"
      onCancel={(event) => {
        event.preventDefault()
        if (dismissible) onClose()
      }}
    >
      {open ? (
        <div className="flex h-full flex-col">
          <div className="flex items-start gap-3 border-b border-mo p-5">
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="break-words font-mo-display text-lg font-semibold text-mo-ink">
                {title}
              </h2>
              {subtitle ? <div className="mt-1 text-sm text-mo-body">{subtitle}</div> : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={!dismissible}
              aria-label="Close"
              className="rounded-mo-sm p-1.5 text-mo-body hover:bg-mo-raised hover:text-mo-ink disabled:opacity-40"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">{children}</div>
        </div>
      ) : null}
    </dialog>
  )
}
