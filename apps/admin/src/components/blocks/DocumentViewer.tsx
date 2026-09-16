"use client"

import { useEffect, useReducer } from "react"
import { Eye, EyeOff, FileText, Lock } from "lucide-react"
import { initialReveal, isBlurred, revealReducer } from "@/lib/blocks/reveal"
import { buttonPrimary, buttonSecondary } from "./buttons"

export interface ViewerDocument {
  id: string
  title: string
  /** Image or PDF URL. For a sensitive document, pass it only once revealed if the route allows. */
  url: string | null
  kind: "image" | "pdf"
  sensitive: boolean
}

/**
 * Shows a document or image. A sensitive one (KYC, ID, selfie) is blurred and
 * its PDF link withheld until the admin clicks "Reveal".
 *
 * `onReveal` is the audit hook: it will call admin-service's audited reveal
 * route once that exists (and may return a signed URL). It resolves `true` to
 * unblur, `false` to stay hidden (e.g. the step-up prompt was dismissed), and
 * a rejection shows the error and keeps the document hidden. The watermark
 * names the viewer so a screenshot carries who took it.
 */
export function DocumentViewer({
  document,
  onReveal,
  watermark,
}: {
  document: ViewerDocument
  onReveal: (document: ViewerDocument) => Promise<boolean>
  watermark?: string
}) {
  const [state, dispatch] = useReducer(revealReducer, document.sensitive, initialReveal)
  const blurred = isBlurred(state)

  useEffect(() => {
    dispatch({ type: "reset", sensitive: document.sensitive })
  }, [document.id, document.sensitive])

  const reveal = async () => {
    if (state.status === "revealing") return
    dispatch({ type: "request" })
    try {
      dispatch({ type: "resolved", revealed: await onReveal(document) })
    } catch (err) {
      dispatch({ type: "failed", error: err instanceof Error ? err.message : "The document could not be revealed." })
    }
  }

  return (
    <figure className="overflow-hidden rounded-mo border border-mo bg-mo-surface">
      <div className="relative grid min-h-[16rem] place-items-center bg-mo-sunken" data-blurred={blurred ? "true" : "false"}>
        {document.url && document.kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived URLs; next/image would cache them
          <img
            src={document.url}
            alt={blurred ? "" : document.title}
            draggable={false}
            className={`max-h-[70vh] w-auto object-contain transition-[filter] ${blurred ? "pointer-events-none select-none blur-2xl" : ""}`}
          />
        ) : (
          <FileText className={`h-16 w-16 text-mo-body ${blurred ? "blur-sm" : ""}`} aria-hidden="true" />
        )}

        {!blurred && watermark ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 grid select-none place-items-center overflow-hidden text-center font-mo-mono text-sm text-mo-ink/15 [transform:rotate(-24deg)]"
          >
            {watermark}
          </span>
        ) : null}

        {blurred ? (
          <div className="absolute inset-0 grid place-items-center bg-mo-sunken/40 p-4 text-center">
            <div>
              <Lock className="mx-auto mb-2 h-6 w-6 text-mo-body" aria-hidden="true" />
              <p className="text-sm text-mo-ink">Sensitive document</p>
              <p className="mb-3 text-xs text-mo-body">Revealing it is recorded in the audit trail.</p>
              <button type="button" className={buttonPrimary} onClick={() => void reveal()} disabled={state.status === "revealing"}>
                <Eye className="h-4 w-4" aria-hidden="true" />
                {state.status === "revealing" ? "Revealing…" : "Reveal"}
              </button>
              {state.error ? (
                <p role="alert" className="mt-2 text-xs text-mo-bad">
                  {state.error}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
      <figcaption className="flex items-center gap-2 px-3 py-2 text-sm">
        <span className="flex-1 truncate text-mo-ink">{document.title}</span>
        {!blurred && document.kind === "pdf" && document.url ? (
          <a href={document.url} target="_blank" rel="noopener noreferrer" className="text-mo-cyan underline">
            Open PDF
          </a>
        ) : null}
        {document.sensitive && !blurred ? (
          <button type="button" className={buttonSecondary} onClick={() => dispatch({ type: "hide" })}>
            <EyeOff className="h-4 w-4" aria-hidden="true" /> Hide
          </button>
        ) : null}
      </figcaption>
    </figure>
  )
}
