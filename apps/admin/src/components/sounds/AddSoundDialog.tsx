"use client"

import { useEffect, useRef, useState } from "react"
import { FileAudio, Upload, X } from "lucide-react"
import { Dialog } from "@/components/blocks/Dialog"
import { ErrorNote } from "@/components/blocks/bits"
import { buttonPrimary, buttonSecondary } from "@/components/blocks/buttons"
import { FormProblems } from "@/components/blocks/formFields"
import { useAdminMutation, useAdminSend } from "@/hooks/useAdminMutation"
import { adminKey } from "@/hooks/useAdminQuery"
import { readObject, type Row } from "@/lib/admin/data"
import { readApiError } from "@/lib/admin/mutation"
import { EMPTY_SOUND_FORM, SOUNDS, SOUNDS_APP, checkSoundForm, soundErrorMessage, soundRequest, type SoundFormInput, type SoundWrite } from "@/lib/admin/sounds"
import { SOUND_ACCEPT, SoundUploadError, checkSoundFile, formatBytes, uploadSoundFile, xhrPut, type PresignedUpload } from "@/lib/admin/soundUpload"
import { SoundDetailsFields } from "./SoundBits"

type Phase =
  | { step: "pick"; error: string | null }
  | { step: "uploading"; file: File; progress: number }
  | { step: "details"; file: File; upload: PresignedUpload }

/** Create refusals that mean the uploaded file itself is the problem: the admin must start again with another file. */
const FILE_PROBLEMS = ["UPLOAD_MISSING", "NOT_AUDIO", "TOO_LONG"]

/**
 * Add a sound: choose or drop an audio file (type and 20 MB checked here),
 * upload it straight to storage with progress and Cancel, then fill in the
 * details and create it. A new sound is a draft until someone enables it.
 */
export function AddSoundDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (sound: Row | null) => void }) {
  const [phase, setPhase] = useState<Phase>({ step: "pick", error: null })
  const [form, setForm] = useState<SoundFormInput>(EMPTY_SOUND_FORM)
  const [problems, setProblems] = useState<string[]>([])
  const [createError, setCreateError] = useState<{ message: string; fileProblem: boolean } | null>(null)
  const [over, setOver] = useState(false)
  const controller = useRef<AbortController | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const send = useAdminSend()

  const create = useAdminMutation<SoundWrite>({
    request: soundRequest,
    invalidate: [adminKey(SOUNDS_APP)],
    successMessage: "Sound added as a draft",
    errorTitle: "The sound was not added",
    onDone: (data) => {
      onCreated(readObject(data))
      close()
    },
  })

  const reset = () => {
    controller.current?.abort()
    controller.current = null
    setPhase({ step: "pick", error: null })
    setForm(EMPTY_SOUND_FORM)
    setProblems([])
    setCreateError(null)
    setOver(false)
    create.reset()
  }

  useEffect(() => {
    if (open) reset()
    return () => controller.current?.abort()
    // Only on opening: reset clears the previous attempt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function close() {
    controller.current?.abort()
    onClose()
  }

  const start = async (file: File) => {
    const check = checkSoundFile(file)
    if (!check.ok) {
      setPhase({ step: "pick", error: check.message })
      return
    }
    const abort = new AbortController()
    controller.current = abort
    setCreateError(null)
    setPhase({ step: "uploading", file, progress: 0 })
    try {
      const upload = await uploadSoundFile(
        file,
        {
          presign: async (body) => {
            const outcome = await send({ method: "post", url: `${SOUNDS}/uploads`, body })
            return outcome.kind === "done" ? outcome.data : null
          },
          put: xhrPut,
        },
        { signal: abort.signal, onProgress: (progress) => setPhase((p) => (p.step === "uploading" && p.file === file ? { ...p, progress } : p)) },
      )
      if (controller.current !== abort) return
      controller.current = null
      setPhase({ step: "details", file, upload })
      // A sensible starting title: the file name without its extension.
      setForm((f) => (f.title ? f : { ...f, title: file.name.replace(/\.[^.]+$/, "").slice(0, 200) }))
    } catch (err) {
      if (controller.current !== abort) return
      controller.current = null
      if (err instanceof SoundUploadError && err.kind === "cancelled") {
        setPhase({ step: "pick", error: err.message === "Upload cancelled." ? null : err.message })
        return
      }
      const message =
        err instanceof SoundUploadError
          ? err.kind === "presign" && err.cause
            ? soundErrorMessage(err.cause, err.message)
            : err.message
          : "The upload failed."
      setPhase({ step: "pick", error: message })
    }
  }

  const cancelUpload = () => {
    controller.current?.abort()
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (phase.step !== "details" || create.isPending) return
    const check = checkSoundForm(form)
    setProblems(check.problems)
    if (check.problems.length > 0) return
    setCreateError(null)
    create.mutate(
      { kind: "create", storageKey: phase.upload.storageKey, fields: check.fields },
      {
        onError: (err) => {
          const { code } = readApiError(err)
          setCreateError({ message: soundErrorMessage(err), fileProblem: !!code && FILE_PROBLEMS.includes(code) })
        },
      },
    )
  }

  const pickAnother = () => {
    setCreateError(null)
    setPhase({ step: "pick", error: null })
  }

  const uploading = phase.step === "uploading"

  return (
    <Dialog
      open={open}
      title="Add a sound"
      description="Upload an audio file, then describe it and its licence. New sounds start as drafts: creators see a sound only once it is enabled."
      onClose={close}
      dismissible={!create.isPending}
      size="lg"
    >
      {phase.step === "pick" ? (
        <div className="space-y-3">
          <div
            className={`admin-dropzone ${over ? "is-over" : ""}`}
            onDragOver={(e) => {
              e.preventDefault()
              setOver(true)
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setOver(false)
              const file = e.dataTransfer.files?.[0]
              if (file) void start(file)
            }}
          >
            <Upload className="h-6 w-6 text-mo-body" aria-hidden="true" />
            <p className="text-sm text-mo-ink">Drop an audio file here</p>
            <p className="text-xs text-mo-body">MP3, M4A/AAC, WAV or OGG · up to 20 MB · up to 5 minutes long</p>
            <button type="button" className={buttonSecondary} onClick={() => input.current?.click()}>
              Choose file
            </button>
            <input
              ref={input}
              type="file"
              accept={SOUND_ACCEPT}
              className="sr-only"
              tabIndex={-1}
              aria-label="Audio file"
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ""
                if (file) void start(file)
              }}
            />
          </div>
          {phase.error ? <ErrorNote message={phase.error} /> : null}
        </div>
      ) : null}

      {uploading ? (
        <div className="space-y-3" aria-live="polite">
          <FileSummary file={phase.file} />
          <progress className="admin-progress" max={1} value={phase.progress} aria-label="Upload progress" />
          <p className="text-xs text-mo-body">
            Uploading… {Math.round(phase.progress * 100)}%
          </p>
          <div className="flex justify-end">
            <button type="button" className={buttonSecondary} onClick={cancelUpload}>
              <X className="h-4 w-4" aria-hidden="true" /> Cancel upload
            </button>
          </div>
        </div>
      ) : null}

      {phase.step === "details" ? (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="flex items-center gap-2">
            <FileSummary file={phase.file} />
            <button type="button" className={`${buttonSecondary} ml-auto`} onClick={pickAnother} disabled={create.isPending}>
              Change file
            </button>
          </div>
          <SoundDetailsFields value={form} onChange={setForm} disabled={create.isPending} />
          <FormProblems problems={problems} />
          {createError ? (
            <div className="space-y-2">
              <ErrorNote message={createError.message} />
              {createError.fileProblem ? (
                <button type="button" className={buttonSecondary} onClick={pickAnother}>
                  Upload a different file
                </button>
              ) : null}
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <button type="button" className={buttonSecondary} onClick={close} disabled={create.isPending}>
              Cancel
            </button>
            <button type="submit" className={buttonPrimary} disabled={create.isPending}>
              {create.isPending ? "Adding…" : "Add sound"}
            </button>
          </div>
        </form>
      ) : null}
    </Dialog>
  )
}

function FileSummary({ file }: { file: File }) {
  return (
    <p className="flex min-w-0 items-center gap-2 text-sm text-mo-ink">
      <FileAudio className="h-4 w-4 shrink-0 text-mo-body" aria-hidden="true" />
      <span className="truncate">{file.name}</span>
      <span className="shrink-0 text-xs text-mo-body">{formatBytes(file.size)}</span>
    </p>
  )
}
