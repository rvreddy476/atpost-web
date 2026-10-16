"use client"

import { Ban, CircleCheck, CirclePause, Pencil, TriangleAlert } from "lucide-react"
import { ConfirmReasonDialog } from "@/components/blocks/ConfirmReasonDialog"
import type { DataColumn } from "@/components/blocks/DataTable"
import { buttonDanger, buttonSecondary } from "@/components/blocks/buttons"
import { SelectField, TextAreaField, TextField } from "@/components/blocks/formFields"
import { num, str, when, type Row } from "@/lib/admin/data"
import {
  LICENSE_TYPES,
  SOUND_TEXT_LIMITS,
  WITHDRAW_REASON_MAX,
  WITHDRAW_SCOPES,
  canWithdraw,
  formatDuration,
  licenseExpiry,
  licenseExpiryNote,
  licenseTypeLabel,
  soundStatusChip,
  toggleFor,
  usageCount,
  type LicenseType,
  type SoundFormInput,
  type WithdrawScope,
} from "@/lib/admin/sounds"

/**
 * The sound library's stateless pieces: table columns, the status chip, the
 * licence cell, the details fields, the write controls and the withdraw
 * dialog. No hooks here, so each renders (and is tested) on its own.
 */

const CHIP_TONE: Record<"normal" | "good" | "warn" | "bad", string> = {
  normal: "border-mo-strong text-mo-body",
  good: "border-mo-good/50 text-mo-good",
  warn: "border-mo-warn/50 text-mo-warn",
  bad: "border-mo-bad/50 text-mo-bad",
}

export function SoundStatusChip({ sound }: { sound: Row }) {
  const chip = soundStatusChip(sound)
  return <span className={`inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-xs ${CHIP_TONE[chip.tone]}`}>{chip.label}</span>
}

/** Licence type, rights holder, and the expiry — flagged when it has passed or ends within 30 days. */
export function LicenceCell({ sound, now = Date.now() }: { sound: Row; now?: number }) {
  const expiry = licenseExpiry(sound.license_expires_at, now)
  const note = licenseExpiryNote(sound.license_expires_at, now)
  const tone = expiry.state === "expired" ? "text-mo-bad" : expiry.state === "soon" ? "text-mo-warn" : "text-mo-body"
  return (
    <span className="flex flex-col">
      <span>{licenseTypeLabel(sound.license_type)}</span>
      {str(sound.rights_holder) ? <span className="text-xs text-mo-body">{str(sound.rights_holder)}</span> : null}
      {expiry.state === "none" ? null : (
        <span className={`inline-flex items-center gap-1 text-xs ${tone}`} data-licence={expiry.state}>
          {expiry.state === "ok" ? null : <TriangleAlert className="h-3 w-3" aria-hidden="true" />}
          {note ?? `Until ${when(sound.license_expires_at)}`}
        </span>
      )}
    </span>
  )
}

export function soundColumns(onOpen: (row: Row) => void, now: number = Date.now()): DataColumn<Row>[] {
  return [
    {
      key: "title",
      header: "Title",
      value: (r) => str(r.title),
      sortable: true,
      cell: (r) => (
        <button type="button" className="text-left font-semibold text-mo-ink hover:underline" onClick={() => onOpen(r)} aria-label={`Open ${str(r.title) ?? "sound"}`}>
          {str(r.title) ?? "Untitled"}
        </button>
      ),
    },
    { key: "artist", header: "Artist", value: (r) => str(r.artist), sortable: true },
    { key: "genre", header: "Genre", value: (r) => str(r.genre), sortable: true, cell: (r) => str(r.genre) ?? "—" },
    { key: "duration", header: "Duration", value: (r) => num(r.duration_ms), sortable: true, align: "right", cell: (r) => <span className="tabular-nums">{formatDuration(r.duration_ms)}</span> },
    { key: "licence", header: "Licence", value: (r) => str(r.license_expires_at), sortable: true, cell: (r) => <LicenceCell sound={r} now={now} /> },
    { key: "status", header: "Status", value: (r) => soundStatusChip(r).label, sortable: true, cell: (r) => <SoundStatusChip sound={r} /> },
    { key: "uses", header: "Uses", value: (r) => usageCount(r), sortable: true, align: "right", cell: (r) => <span className="tabular-nums">{usageCount(r).toLocaleString("en-IN")}</span> },
    { key: "created", header: "Created", value: (r) => str(r.created_at), sortable: true, cell: (r) => when(r.created_at) },
  ]
}

const LICENSE_OPTIONS: readonly { value: LicenseType | ""; label: string }[] = [{ value: "", label: "Choose…" }, ...LICENSE_TYPES]

/** The details form's fields, controlled. The licence type is fixed once a sound exists (`licenseTypeLocked`). */
export function SoundDetailsFields({
  value,
  onChange,
  licenseTypeLocked = false,
  disabled = false,
}: {
  value: SoundFormInput
  onChange: (next: SoundFormInput) => void
  licenseTypeLocked?: boolean
  disabled?: boolean
}) {
  const set = <K extends keyof SoundFormInput>(key: K) => (v: SoundFormInput[K]) => onChange({ ...value, [key]: v })
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <TextField label="Title" value={value.title} onChange={set("title")} maxLength={SOUND_TEXT_LIMITS.title} disabled={disabled} />
      <TextField label="Artist" value={value.artist} onChange={set("artist")} maxLength={SOUND_TEXT_LIMITS.artist} disabled={disabled} />
      <TextField label="Genre" value={value.genre} onChange={set("genre")} maxLength={SOUND_TEXT_LIMITS.genre} placeholder="e.g. Pop, Folk, Lo-fi" disabled={disabled} />
      <TextField label="Mood (optional)" value={value.mood} onChange={set("mood")} maxLength={SOUND_TEXT_LIMITS.mood} placeholder="e.g. Upbeat, Calm" disabled={disabled} />
      <SelectField
        label="Licence type"
        value={value.license_type}
        options={LICENSE_OPTIONS}
        onChange={set("license_type")}
        disabled={disabled || licenseTypeLocked}
        hint={licenseTypeLocked ? "Fixed when the sound was added." : undefined}
      />
      <TextField label="Rights holder" value={value.rights_holder} onChange={set("rights_holder")} maxLength={SOUND_TEXT_LIMITS.rights_holder} disabled={disabled} />
      <TextField label="Licence reference (optional)" value={value.license_reference} onChange={set("license_reference")} maxLength={SOUND_TEXT_LIMITS.license_reference} placeholder="Agreement or invoice number" disabled={disabled} />
      <TextField label="Licence expiry (optional)" type="date" value={value.license_expires_day} onChange={set("license_expires_day")} hint="Leave blank if the licence does not end." disabled={disabled} />
      <div className="sm:col-span-2">
        <TextAreaField label="Attribution (optional)" value={value.attribution} onChange={set("attribution")} placeholder="Credit shown with the sound, if the licence asks for one" rows={2} disabled={disabled} />
      </div>
    </div>
  )
}

/**
 * Edit, Enable/Disable and Withdraw. Nothing at all without
 * media:sounds.manage; a withdrawn sound offers only Edit.
 */
export function SoundWriteControls({
  manage,
  sound,
  busy,
  onEdit,
  onToggle,
  onWithdraw,
}: {
  manage: boolean
  sound: Row
  busy: boolean
  onEdit: () => void
  onToggle: (isActive: boolean) => void
  onWithdraw: () => void
}) {
  if (!manage) return null
  const toggle = toggleFor(sound)
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Sound actions">
      <button type="button" className={buttonSecondary} onClick={onEdit} disabled={busy}>
        <Pencil className="h-4 w-4" aria-hidden="true" /> Edit details
      </button>
      {toggle ? (
        <button type="button" className={buttonSecondary} onClick={() => onToggle(toggle.isActive)} disabled={busy}>
          {toggle.isActive ? <CircleCheck className="h-4 w-4" aria-hidden="true" /> : <CirclePause className="h-4 w-4" aria-hidden="true" />}
          {toggle.label}
        </button>
      ) : null}
      {canWithdraw(sound) ? (
        <button type="button" className={buttonDanger} onClick={onWithdraw} disabled={busy}>
          <Ban className="h-4 w-4" aria-hidden="true" /> Withdraw
        </button>
      ) : null}
    </div>
  )
}

/**
 * Withdraw, with the two scopes and a required reason. Controlled: the owner
 * holds the chosen scope, so confirming sends exactly the scope on screen.
 */
export function WithdrawSoundDialog({
  open,
  title,
  scope,
  onScopeChange,
  busy,
  onWithdraw,
  onClose,
}: {
  open: boolean
  title: string
  scope: WithdrawScope | null
  onScopeChange: (scope: WithdrawScope) => void
  busy: boolean
  onWithdraw: (request: { scope: WithdrawScope; reason: string }) => void
  onClose: () => void
}) {
  return (
    <ConfirmReasonDialog
      open={open}
      title={`Withdraw “${title}”?`}
      description="Choose how far the withdrawal reaches. The reason is recorded in the audit log."
      confirmLabel={scope === "everywhere" ? "Remove from all posts" : "Stop new uses"}
      destructive
      busy={busy}
      canConfirm={scope !== null}
      maxReasonLength={WITHDRAW_REASON_MAX}
      onConfirm={(reason) => {
        if (scope) onWithdraw({ scope, reason })
      }}
      onClose={onClose}
    >
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-semibold text-mo-ink">Withdraw from</legend>
        {WITHDRAW_SCOPES.map((option) => (
          <label
            key={option.value}
            className={`flex items-start gap-2 rounded-mo-sm border p-3 text-sm ${scope === option.value ? (option.value === "everywhere" ? "border-mo-bad/60" : "border-mo-strong") : "border-mo"}`}
          >
            <input
              type="radio"
              name="withdraw-scope"
              value={option.value}
              checked={scope === option.value}
              onChange={() => onScopeChange(option.value)}
              className="mt-0.5 accent-mo-cyan"
            />
            <span>
              <span className="block font-semibold text-mo-ink">{option.label}</span>
              <span className="block text-xs text-mo-body">{option.description}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {scope === "everywhere" ? (
        <p role="alert" className="flex items-start gap-2 rounded-mo-sm border border-mo-bad/40 bg-mo-bad/10 p-3 text-sm text-mo-bad" data-testid="withdraw-everywhere-warning">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          Every post that uses this sound goes silent at once, including posts already published. Use this only when the sound
          must not be heard anywhere — for example, the rights holder has revoked the licence.
        </p>
      ) : null}
    </ConfirmReasonDialog>
  )
}
