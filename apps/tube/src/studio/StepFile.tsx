"use client"

/**
 * Step one: pick the file. Which is also the moment the upload starts.
 *
 * ── There is no Next button here, and that is the whole design ────────────
 *
 *     "Upload runs in the background from the moment the file is chosen — the
 *      creator fills in details while bytes move, which is the whole reason to
 *      do this on a wide screen."
 *
 * So choosing a file advances the step AND starts the transfer, in that
 * order. A studio that made somebody choose a file, read a summary and then
 * press Continue would have spent that reading time doing nothing, which on a
 * 2 GB upload is a minute of somebody's life for a confirmation they did not
 * need.
 *
 * ── The local gate refuses two things and guesses at nothing ──────────────
 * An empty file and one over 2 GB, both of which the server would refuse
 * anyway after the bytes had moved. The MIME check is deliberately weak: some
 * browsers report an empty type for a .mov, and refusing a real video because
 * the operating system did not name it is worse than letting the server give
 * the authoritative answer.
 */

import { useRef, useState } from "react"
import { UploadCloud } from "lucide-react"
import { MAX_VIDEO_BYTES, VIDEO_ACCEPT_ATTR } from "@/tube/uploadApi"
import { localFileRefusal } from "./useVideoUpload"

interface Props {
  onPick: (file: File) => void
  channelName: string
}

export function StepFile({ onPick, channelName }: Props) {
  const input = useRef<HTMLInputElement | null>(null)
  const [dragging, setDragging] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)

  const accept = (file: File | undefined) => {
    if (!file) return
    const problem = localFileRefusal(file)
    if (problem) {
      setRefusal(problem)
      return
    }
    setRefusal(null)
    onPick(file)
  }

  return (
    <div className="space-y-4">
      <div
        // A label element, so the whole plate is the file input's own control:
        // click, Enter and Space all open the picker with no key handler, and
        // a screen reader announces it as a file field rather than as a div
        // somebody has attached a click to.
        className={`flex flex-col items-center justify-center gap-4 rounded-mo border-2 border-dashed px-6 py-16 text-center transition-colors duration-150 ease-mo ${
          dragging ? "border-mo-cyan bg-mo-raised" : "border-mo-strong bg-mo-surface"
        }`}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          accept(e.dataTransfer.files?.[0])
        }}
      >
        <UploadCloud aria-hidden className="h-10 w-10 text-mo-body" />
        <div>
          <p className="font-mo-display text-xl tracking-mo-display text-mo-ink">
            Drag a video here
          </p>
          <p className="mt-1 text-sm text-mo-body">
            It posts to {channelName}. The upload starts as soon as you pick it, so you can write
            the details while it goes.
          </p>
        </div>
        <button
          type="button"
          className="mo-btn-primary inline-flex h-11 items-center rounded-mo-pill px-6"
          onClick={() => input.current?.click()}
        >
          Browse files
        </button>
        <p className="text-xs text-mo-body">
          MP4, WebM or MOV, up to {Math.floor(MAX_VIDEO_BYTES / (1024 * 1024 * 1024))} GB.
        </p>
        <input
          ref={input}
          type="file"
          accept={VIDEO_ACCEPT_ATTR}
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0]
            // Cleared so choosing the same file after a failure fires
            // `change` again.
            e.target.value = ""
            accept(file)
          }}
        />
      </div>

      {refusal ? (
        <p role="alert" className="text-sm text-mo-bad">
          {refusal}
        </p>
      ) : null}
    </div>
  )
}
