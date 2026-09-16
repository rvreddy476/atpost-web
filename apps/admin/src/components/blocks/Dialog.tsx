"use client"

import { useEffect, useId, useRef } from "react"
import { X } from "lucide-react"

/**
 * A modal on the native <dialog> element.
 *
 * `showModal()` gives the things an admin dialog must not get wrong for free:
 * focus moves inside and is trapped there, the rest of the page is inert, and
 * Escape closes it (routed through `onClose` so the owner's state agrees).
 */
export function Dialog({
  open,
  title,
  description,
  onClose,
  children,
  dismissible = true,
}: {
  open: boolean
  title: string
  description?: React.ReactNode
  onClose: () => void
  children: React.ReactNode
  /** False while a request is in flight, so Escape cannot abandon it half-done. */
  dismissible?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const descriptionId = useId()

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
      aria-describedby={description ? descriptionId : undefined}
      className="admin-dialog w-[min(28rem,calc(100vw-2rem))] rounded-mo border border-mo-strong bg-mo-surface p-0 text-mo-ink shadow-mo-lift"
      onCancel={(event) => {
        event.preventDefault()
        if (dismissible) onClose()
      }}
    >
      {open ? (
        <div className="p-5">
          <div className="mb-3 flex items-start gap-3">
            <div className="flex-1">
              <h2 id={titleId} className="font-mo-display text-lg font-semibold text-mo-ink">
                {title}
              </h2>
              {description ? (
                <div id={descriptionId} className="mt-1 text-sm text-mo-body">
                  {description}
                </div>
              ) : null}
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
          {children}
        </div>
      ) : null}
    </dialog>
  )
}
