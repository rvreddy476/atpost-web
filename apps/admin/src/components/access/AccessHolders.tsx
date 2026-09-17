"use client"

import { useState } from "react"
import { ConfirmReasonDialog } from "@/components/blocks/ConfirmReasonDialog"
import { DataTable, type DataColumn } from "@/components/blocks/DataTable"
import { Field, IdText, OffsetPager, StatusPill } from "@/components/blocks/bits"
import { buttonDanger, buttonSecondary, inputClass } from "@/components/blocks/buttons"
import { useAdmin } from "@/components/shell/AdminShell"
import { useAdminMutation } from "@/hooks/useAdminMutation"
import { adminKey, useAdminList } from "@/hooks/useAdminQuery"
import { ACCESS, ACCESS_PAGE, accessCan, holderState, holdersQuery, readHolders, secondApproverNote, type Catalogue, type Holder } from "@/lib/admin/access"
import { adminAppLabel, isAdminAppId } from "@/lib/admin/apps"
import { humanise, when } from "@/lib/admin/data"

export const ACCESS_KEY = adminKey("platform")

const appLabel = (app: string | null) => (app === null ? "Platform-wide" : isAdminAppId(app) ? adminAppLabel(app) : humanise(app))

const STATE_TONE = { active: "good", expired: "warn", inactive: "normal" } as const

type Pending = { kind: "revoke" | "logout"; holder: Holder } | null

/**
 * Who holds which role, for which application, until when — with their
 * 2FA enrolment. Revoking needs a reason and a fresh 2FA code (a
 * super-admin revocation is sent for a second approver); force logout ends
 * every session that user has. Roles granted by the deployment's
 * configuration are listed apart and cannot be revoked here.
 */
export function AccessHolders({ catalogue }: { catalogue: Catalogue }) {
  const { me } = useAdmin()
  const [draft, setDraft] = useState({ role: "", app: "" })
  const [applied, setApplied] = useState(draft)
  const [offset, setOffset] = useState(0)
  const [pending, setPending] = useState<Pending>(null)
  const page = useAdminList("platform", `${ACCESS}/roles?${holdersQuery(applied, offset)}`, { keys: ["holders"] })
  const { holders, envHolders } = readHolders(page.raw)
  const mayManage = accessCan(me, "manage")
  const mayLogout = accessCan(me, "revokeSessions")

  const revoke = useAdminMutation<{ holder: Holder; reason: string }>({
    request: ({ holder, reason }) => ({ method: "delete", url: `${ACCESS}/users/${encodeURIComponent(holder.userId)}/roles/${encodeURIComponent(holder.role)}`, body: { app: holder.app, reason } }),
    invalidate: [ACCESS_KEY],
    successMessage: "Role revoked",
    errorTitle: "Revocation failed",
    onDone: () => setPending(null),
  })
  const logout = useAdminMutation<{ holder: Holder; reason: string }>({
    request: ({ holder, reason }) => ({ method: "post", url: `${ACCESS}/users/${encodeURIComponent(holder.userId)}/sessions/revoke`, body: { reason } }),
    invalidate: [ACCESS_KEY],
    successMessage: "Sessions revoked: that user is signed out everywhere",
    errorTitle: "Force logout failed",
    onDone: () => setPending(null),
  })

  const columns = (env: boolean): DataColumn<Holder>[] => [
    { key: "user", header: "User", value: (h) => h.userId, filterable: true, cell: (h) => <IdText id={h.userId} /> },
    { key: "role", header: "Role", value: (h) => h.role, sortable: true, cell: (h) => <span className="font-semibold">{humanise(h.role)}</span> },
    { key: "app", header: "Application", value: (h) => h.app ?? "platform", sortable: true, cell: (h) => appLabel(h.app) },
    {
      key: "mfa",
      header: "2FA",
      value: (h) => (h.mfaEnrolled === null ? "unknown" : h.mfaEnrolled ? "enrolled" : "not enrolled"),
      sortable: true,
      cell: (h) => (h.mfaEnrolled === null ? <StatusPill value="unknown" /> : h.mfaEnrolled ? <StatusPill value="enrolled" tone="good" /> : <StatusPill value="not_enrolled" tone="bad" />),
    },
    { key: "state", header: "State", value: (h) => holderState(h), sortable: true, cell: (h) => <StatusPill value={holderState(h)} tone={STATE_TONE[holderState(h)]} /> },
    { key: "expires", header: "Expires", value: (h) => h.expiresAt, sortable: true, cell: (h) => (h.expiresAt ? when(h.expiresAt) : "Never") },
    { key: "reason", header: "Reason", value: (h) => h.reason, filterable: true, cell: (h) => h.reason ?? "—" },
    { key: "by", header: "Granted by", value: (h) => h.grantedBy, cell: (h) => (env ? "Configuration" : h.grantedBy ? <IdText id={h.grantedBy} /> : "—") },
    { key: "at", header: "Granted", value: (h) => h.grantedAt, sortable: true, cell: (h) => when(h.grantedAt) },
    {
      key: "actions",
      header: "",
      value: () => null,
      align: "right",
      cell: (h) => (
        <span className="inline-flex gap-1">
          {mayManage && !env && holderState(h) === "active" ? (
            <button type="button" className={buttonDanger} onClick={() => setPending({ kind: "revoke", holder: h })} aria-label={`Revoke ${h.role} from ${h.userId}`}>
              Revoke
            </button>
          ) : null}
          {mayLogout ? (
            <button type="button" className={buttonSecondary} onClick={() => setPending({ kind: "logout", holder: h })} aria-label={`Force logout ${h.userId}`}>
              Force logout
            </button>
          ) : null}
        </span>
      ),
    },
  ]

  const rowId = (h: Holder) => `${h.userId}:${h.role}:${h.app ?? "platform"}`

  return (
    <>
      <form
        className="mb-3 flex flex-wrap items-end gap-3"
        aria-label="Holder filters"
        onSubmit={(e) => {
          e.preventDefault()
          setApplied(draft)
          setOffset(0)
        }}
      >
        <div className="w-56">
          <Field label="Role">
            {(id) => (
              <select id={id} className={inputClass} value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })}>
                <option value="">Any role</option>
                {catalogue.roles.map((r) => (
                  <option key={r.name} value={r.name}>
                    {r.label}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
        <div className="w-56">
          <Field label="Application">
            {(id) => (
              <select id={id} className={inputClass} value={draft.app} onChange={(e) => setDraft({ ...draft, app: e.target.value })}>
                <option value="">Any</option>
                <option value="platform">Platform-wide</option>
                {catalogue.apps.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
        <button type="submit" className={buttonSecondary}>
          Apply
        </button>
      </form>

      <DataTable caption="Role holders" rows={holders} columns={columns(false)} rowId={rowId} loading={page.isLoading} error={page.error} onRetry={page.refetch} emptyMessage="Nobody holds a role matching these filters." pageSize={ACCESS_PAGE} />
      <OffsetPager offset={offset} limit={ACCESS_PAGE} count={holders.length} onChange={setOffset} />

      {envHolders.length > 0 ? (
        <section className="mt-6" aria-label="Roles granted by configuration">
          <h3 className="text-sm font-semibold text-mo-ink">Granted by configuration</h3>
          <p className="mb-2 text-xs text-mo-body">These roles come from the deployment&apos;s environment allowlists, not from a grant. They cannot be revoked here; remove them from the configuration instead.</p>
          <DataTable caption="Roles granted by configuration" rows={envHolders} columns={columns(true)} rowId={rowId} pageSize={ACCESS_PAGE} />
        </section>
      ) : null}

      <ConfirmReasonDialog
        open={pending?.kind === "revoke"}
        title={pending ? `Revoke ${humanise(pending.holder.role)} from this user?` : ""}
        description={
          pending ? (
            <>
              {appLabel(pending.holder.app)} · user {pending.holder.userId}. Their admin sessions end with the role. Needs a fresh 2FA code.
              {secondApproverNote(pending.holder.role) ? <span className="mt-1 block text-mo-warn">{secondApproverNote(pending.holder.role)}</span> : null}
            </>
          ) : null
        }
        confirmLabel="Revoke"
        destructive
        busy={revoke.isPending}
        onConfirm={(reason) => pending && revoke.mutate({ holder: pending.holder, reason })}
        onClose={() => setPending(null)}
      />
      <ConfirmReasonDialog
        open={pending?.kind === "logout"}
        title="Sign this user out everywhere?"
        description={pending ? `User ${pending.holder.userId}: every session they hold is revoked and they must sign in again. Their roles stay. Needs a fresh 2FA code.` : null}
        confirmLabel="Force logout"
        destructive
        busy={logout.isPending}
        onConfirm={(reason) => pending && logout.mutate({ holder: pending.holder, reason })}
        onClose={() => setPending(null)}
      />
    </>
  )
}
