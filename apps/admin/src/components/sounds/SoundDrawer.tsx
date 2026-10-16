"use client"

import { useEffect, useRef, useState } from "react"
import { Play } from "lucide-react"
import { Drawer } from "@/components/blocks/Drawer"
import { Details, ErrorNote, IdText } from "@/components/blocks/bits"
import { buttonPrimary, buttonSecondary } from "@/components/blocks/buttons"
import { FormProblems } from "@/components/blocks/formFields"
import { useAdminMutation } from "@/hooks/useAdminMutation"
import { adminKey, useAdminObject } from "@/hooks/useAdminQuery"
import api from "@/lib/admin/api"
import { readObject, str, when, type Row } from "@/lib/admin/data"
import {
  SOUNDS_APP,
  editSoundPatch,
  formatDuration,
  soundErrorMessage,
  soundFormInput,
  soundPreviewUrl,
  soundRequest,
  soundStatusChip,
  soundUrl,
  usageCount,
  type SoundAbilities,
  type SoundFormInput,
  type SoundWrite,
  type WithdrawScope,
} from "@/lib/admin/sounds"
import { LicenceCell, SoundDetailsFields, SoundStatusChip, SoundWriteControls, WithdrawSoundDialog } from "./SoundBits"

/**
 * One sound: preview, details, and — for a holder of media:sounds.manage —
 * edit, enable/disable and withdraw. `initial` is the row from the list, shown
 * until the detail route answers.
 */
export function SoundDrawer({ id, initial, can, onClose }: { id: string | null; initial: Row | null; can: SoundAbilities; onClose: () => void }) {
  const detail = useAdminObject(SOUNDS_APP, id ? soundUrl(id) : "", { enabled: id !== null })
  const sound = detail.data ?? initial
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<SoundFormInput | null>(null)
  const [problems, setProblems] = useState<string[]>([])
  const [withdrawing, setWithdrawing] = useState(false)
  const [scope, setScope] = useState<WithdrawScope | null>(null)

  useEffect(() => {
    setEditing(false)
    setForm(null)
    setProblems([])
    setWithdrawing(false)
    setScope(null)
  }, [id])

  const write = useAdminMutation<SoundWrite>({
    request: soundRequest,
    invalidate: [adminKey(SOUNDS_APP)],
    successMessage: (data) => {
      const saved = readObject(data)
      return saved ? `Sound updated — now ${soundStatusChip(saved).label.toLowerCase()}` : "Sound updated"
    },
    errorTitle: "The sound was not changed",
    onDone: (_data, vars) => {
      if (vars.kind === "edit") {
        setEditing(false)
        setForm(null)
      }
      if (vars.kind === "withdraw") {
        setWithdrawing(false)
        setScope(null)
      }
    },
  })

  const startEdit = () => {
    if (!sound) return
    setForm(soundFormInput(sound))
    setProblems([])
    setEditing(true)
  }

  const saveEdit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!sound || !form || !id || write.isPending) return
    const { problems: found, patch } = editSoundPatch(sound, form)
    setProblems(found)
    if (found.length > 0) return
    if (Object.keys(patch).length === 0) {
      setEditing(false)
      return
    }
    write.mutate({ kind: "edit", id, patch })
  }

  const title = str(sound?.title) ?? "Sound"

  return (
    <Drawer open={id !== null} title={title} subtitle={str(sound?.artist) ?? undefined} onClose={onClose} dismissible={!write.isPending}>
      {!sound && detail.isLoading ? (
        <p role="status" className="text-sm text-mo-body">
          Loading…
        </p>
      ) : null}
      {detail.error && !sound ? <ErrorNote message={detail.error} onRetry={detail.refetch} /> : null}
      {sound && id ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <SoundStatusChip sound={sound} />
            <span className="text-xs text-mo-body">{usageCount(sound).toLocaleString("en-IN")} uses</span>
          </div>

          <SoundPreview id={id} />

          {editing && form ? (
            <form onSubmit={saveEdit} className="space-y-4" noValidate aria-label="Edit sound details">
              <SoundDetailsFields value={form} onChange={setForm} licenseTypeLocked disabled={write.isPending} />
              <FormProblems problems={problems} />
              {write.isError && write.variables?.kind === "edit" ? <ErrorNote message={soundErrorMessage(write.error)} /> : null}
              <div className="flex justify-end gap-2">
                <button type="button" className={buttonSecondary} onClick={() => setEditing(false)} disabled={write.isPending}>
                  Cancel
                </button>
                <button type="submit" className={buttonPrimary} disabled={write.isPending}>
                  {write.isPending ? "Saving…" : "Save changes"}
                </button>
              </div>
            </form>
          ) : (
            <>
              <SoundWriteControls
                manage={can.manage}
                sound={sound}
                busy={write.isPending}
                onEdit={startEdit}
                onToggle={(isActive) => write.mutate({ kind: "toggle", id, isActive })}
                onWithdraw={() => {
                  setScope(null)
                  setWithdrawing(true)
                }}
              />
              <Details
                items={[
                  ["Genre", str(sound.genre)],
                  ["Mood", str(sound.mood)],
                  ["Duration", formatDuration(sound.duration_ms)],
                  ["Licence", <LicenceCell key="licence" sound={sound} />],
                  ["Licence reference", str(sound.license_reference)],
                  ["Licence expiry", str(sound.license_expires_at) ? when(sound.license_expires_at) : "No expiry"],
                  ["Attribution", str(sound.attribution)],
                  ["Uses", usageCount(sound).toLocaleString("en-IN")],
                  ["Added", when(sound.created_at)],
                  ["Added by", str(sound.created_by) ? <IdText key="by" id={sound.created_by} /> : null],
                  ["Updated", when(sound.updated_at)],
                  ["Sound id", <IdText key="id" id={sound.id} />],
                ]}
              />
            </>
          )}

          <WithdrawSoundDialog
            open={withdrawing}
            title={title}
            scope={scope}
            onScopeChange={setScope}
            busy={write.isPending}
            onWithdraw={({ scope: chosen, reason }) => write.mutate({ kind: "withdraw", id, scope: chosen, reason })}
            onClose={() => setWithdrawing(false)}
          />
        </>
      ) : null}
    </Drawer>
  )
}

/**
 * The preview plays only when asked: nothing is fetched until the admin
 * presses Play. The bytes come through the console's own proxy (which follows
 * admin-service's redirect to the signed URL) and play from a blob: URL, the
 * one media source the console's CSP allows.
 */
function SoundPreview({ id }: { id: string }) {
  const [src, setSrc] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const audio = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    setSrc(null)
    setError(null)
    setLoading(false)
  }, [id])

  useEffect(() => {
    if (!src) return
    // Try to start at once (the press was the gesture); the controls are there if the browser declines.
    void audio.current?.play().catch(() => undefined)
    return () => URL.revokeObjectURL(src)
  }, [src])

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await api.get(soundPreviewUrl(id), { responseType: "blob" })
      const blob = response.data as Blob
      if (!blob.type.startsWith("audio/") && blob.type !== "application/octet-stream") throw new Error("not audio")
      setSrc(URL.createObjectURL(blob))
    } catch {
      setError("The preview could not be loaded.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <section aria-label="Preview" className="rounded-mo border border-mo bg-mo-sunken p-3">
      {src ? (
        <audio ref={audio} controls src={src} className="w-full" />
      ) : (
        <button type="button" className={buttonSecondary} onClick={() => void load()} disabled={loading}>
          <Play className="h-4 w-4" aria-hidden="true" /> {loading ? "Loading preview…" : "Play preview"}
        </button>
      )}
      {error ? (
        <div className="mt-2">
          <ErrorNote message={error} onRetry={() => void load()} />
        </div>
      ) : null}
    </section>
  )
}
