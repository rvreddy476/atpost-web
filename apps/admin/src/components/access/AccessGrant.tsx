"use client"

import { useState } from "react"
import { Search, ShieldAlert, UserCheck } from "lucide-react"
import { Field, IdText } from "@/components/blocks/bits"
import { buttonGhost, buttonPrimary, buttonSecondary, inputClass } from "@/components/blocks/buttons"
import { useAdmin } from "@/components/shell/AdminShell"
import { useAdminMutation } from "@/hooks/useAdminMutation"
import { useAdminList } from "@/hooks/useAdminQuery"
import {
  ACCESS,
  EMPTY_GRANT,
  accessCan,
  checkGrant,
  findRole,
  permissionPreview,
  readUserMatches,
  secondApproverNote,
  type Catalogue,
  type GrantField,
  type GrantForm,
  type UserMatch,
} from "@/lib/admin/access"
import { isUuid } from "@/lib/admin/data"
import { ACCESS_KEY } from "./AccessHolders"

/**
 * Grant a role: find the user (by handle or masked email, or by id for an
 * admin without the search permission), pick the role, the application or
 * platform-wide, an optional expiry and a required reason. The permissions
 * that grant carries are shown from the catalogue before confirming. The
 * grant needs a fresh 2FA code; a super-admin grant is sent for a second
 * approver and the console says so.
 */
export function AccessGrant({ catalogue }: { catalogue: Catalogue }) {
  const { me } = useAdmin()
  const maySearch = accessCan(me, "search")
  const [form, setForm] = useState<GrantForm>(EMPTY_GRANT)
  const [picked, setPicked] = useState<UserMatch | null>(null)
  const [problems, setProblems] = useState<Partial<Record<GrantField, string>>>({})
  const [q, setQ] = useState("")
  const [query, setQuery] = useState("")
  const search = useAdminList("platform", `${ACCESS}/users/search?q=${encodeURIComponent(query)}`, { enabled: maySearch && query.length >= 2, keys: ["results"] })
  const matches = readUserMatches(search.raw)

  const grant = useAdminMutation<{ userId: string; body: unknown }>({
    request: ({ userId, body }) => ({ method: "post", url: `${ACCESS}/users/${encodeURIComponent(userId)}/roles`, body }),
    invalidate: [ACCESS_KEY],
    successMessage: "Role granted",
    errorTitle: "Grant failed",
    onDone: () => {
      setForm({ ...EMPTY_GRANT, userId: form.userId })
      setProblems({})
    },
  })

  const role = findRole(catalogue, form.role)
  const platformOnly = role?.platformOnly ?? false
  const preview = form.role ? permissionPreview(catalogue, form.role, platformOnly ? null : form.app || null) : null
  const set = (field: GrantField, value: string) => {
    setForm((f) => ({ ...f, [field]: value, ...(field === "role" && findRole(catalogue, value)?.platformOnly ? { app: "" } : {}) }))
    setProblems((p) => ({ ...p, [field]: undefined }))
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const check = checkGrant(form, catalogue)
    if (!check.ok) {
      setProblems(check.problems)
      return
    }
    setProblems({})
    grant.mutate({ userId: form.userId.trim().toLowerCase(), body: check.body })
  }

  const problem = (field: GrantField) =>
    problems[field] ? (
      <p role="alert" className="text-sm text-mo-bad">
        {problems[field]}
      </p>
    ) : null

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <form className="space-y-4 rounded-mo border border-mo bg-mo-surface p-4" aria-label="Grant a role" onSubmit={submit}>
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-mo-ink">1. Who</h3>
          {maySearch ? (
            <>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Field label="Find a user" hint="By handle or masked email. Two characters or more.">
                    {(id) => <input id={id} type="search" className={inputClass} value={q} placeholder="@handle or a***@example.com" onChange={(e) => setQ(e.target.value)} />}
                  </Field>
                </div>
                <button type="button" className={buttonSecondary} onClick={() => setQuery(q.trim())} disabled={q.trim().length < 2}>
                  <Search className="h-4 w-4" aria-hidden="true" /> Search
                </button>
              </div>
              {query.length >= 2 ? (
                search.isLoading ? (
                  <p className="text-sm text-mo-body">Searching…</p>
                ) : search.error ? (
                  <p role="alert" className="text-sm text-mo-bad">
                    {search.error}
                  </p>
                ) : matches.length === 0 ? (
                  <p className="text-sm text-mo-body">No user matches.</p>
                ) : (
                  <ul className="divide-y divide-mo rounded-mo border border-mo" aria-label="Matching users">
                    {matches.map((m) => (
                      <li key={m.userId} className="flex items-center gap-3 px-3 py-2 text-sm">
                        <span className="flex-1">
                          <span className="font-semibold text-mo-ink">{m.handle ? `@${m.handle}` : "—"}</span>
                          <span className="ml-2 text-mo-body">{m.emailMasked ?? ""}</span>
                          <span className="ml-2">
                            <IdText id={m.userId} />
                          </span>
                        </span>
                        <button
                          type="button"
                          className={buttonSecondary}
                          onClick={() => {
                            setPicked(m)
                            set("userId", m.userId)
                          }}
                          aria-label={`Pick ${m.handle ? `@${m.handle}` : m.userId}`}
                        >
                          Pick
                        </button>
                      </li>
                    ))}
                  </ul>
                )
              ) : null}
            </>
          ) : (
            <Field label="User id" hint="Searching users needs the users search permission; paste the user id instead.">
              {(id) => <input id={id} className={inputClass} value={form.userId} onChange={(e) => set("userId", e.target.value)} />}
            </Field>
          )}
          {picked || (isUuid(form.userId) && !maySearch) ? (
            <p className="flex items-center gap-2 rounded-mo-sm border border-mo bg-mo-raised px-3 py-2 text-sm text-mo-ink" data-picked-user>
              <UserCheck className="h-4 w-4 text-mo-good" aria-hidden="true" />
              <span className="flex-1">
                {picked?.handle ? `@${picked.handle} ` : ""}
                {picked?.emailMasked ? `${picked.emailMasked} ` : ""}
                <IdText id={form.userId} />
              </span>
              {picked ? (
                <button
                  type="button"
                  className={buttonGhost}
                  onClick={() => {
                    setPicked(null)
                    set("userId", "")
                  }}
                >
                  Change
                </button>
              ) : null}
            </p>
          ) : null}
          {problem("userId")}
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-mo-ink">2. Which role, where</h3>
          <Field label="Role" hint={role?.description ?? undefined}>
            {(id) => (
              <select id={id} className={inputClass} value={form.role} onChange={(e) => set("role", e.target.value)}>
                <option value="">Choose…</option>
                {catalogue.roles.map((r) => (
                  <option key={r.name} value={r.name}>
                    {r.label}
                  </option>
                ))}
              </select>
            )}
          </Field>
          {problem("role")}
          <Field label="Scope" hint={platformOnly ? "This role is platform-wide only." : "A role scoped to one application allows nothing in the others."}>
            {(id) => (
              <select id={id} className={inputClass} value={platformOnly ? "" : form.app} onChange={(e) => set("app", e.target.value)} disabled={platformOnly}>
                <option value="">{platformOnly ? "Platform-wide" : "Choose an application…"}</option>
                {platformOnly
                  ? null
                  : catalogue.apps.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label}
                      </option>
                    ))}
              </select>
            )}
          </Field>
          {problem("app")}
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-mo-ink">3. Until when, and why</h3>
          <Field label="Expires (optional)" hint="Leave empty for no expiry. A time-limited grant is safer for a contractor or a trial.">
            {(id) => <input id={id} type="datetime-local" className={inputClass} value={form.expiresAt} onChange={(e) => set("expiresAt", e.target.value)} />}
          </Field>
          {problem("expiresAt")}
          <Field label="Reason">
            {(id) => <textarea id={id} rows={3} className={inputClass} value={form.reason} placeholder="Who asked for this and why it is needed" onChange={(e) => set("reason", e.target.value)} />}
          </Field>
          {problem("reason")}
        </section>

        {secondApproverNote(form.role) ? (
          <p role="note" className="flex items-start gap-2 rounded-mo-sm border border-mo-warn/50 bg-mo-warn/10 p-3 text-sm text-mo-ink">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-mo-warn" aria-hidden="true" />
            {secondApproverNote(form.role)}
          </p>
        ) : null}

        <div className="flex items-center gap-2">
          <button type="submit" className={buttonPrimary} disabled={grant.isPending}>
            {grant.isPending ? "Granting…" : "Grant role"}
          </button>
          <span className="text-xs text-mo-body">Needs a fresh 2FA code.</span>
        </div>
      </form>

      <aside className="rounded-mo border border-mo bg-mo-surface p-4" aria-label="Permission preview">
        <h3 className="text-sm font-semibold text-mo-ink">What this grant allows</h3>
        {!preview ? (
          <p className="mt-2 text-sm text-mo-body">Choose a role to see the permissions it carries.</p>
        ) : !preview.known ? (
          <p className="mt-2 text-sm text-mo-body">The catalogue does not list this role&apos;s permissions.</p>
        ) : preview.permissions.length === 0 ? (
          <p className="mt-2 text-sm text-mo-body">
            {platformOnly || !form.app ? "No permissions are listed for this role platform-wide." : "No permissions are listed for this role in that application."}
          </p>
        ) : (
          <>
            <p className="mt-1 text-xs text-mo-body">
              {role?.label ?? form.role} · {platformOnly || !form.app ? "platform-wide" : (catalogue.apps.find((a) => a.id === form.app)?.label ?? form.app)}
            </p>
            <ul className="mt-2 grid gap-1 font-mo-mono text-xs text-mo-ink sm:grid-cols-2" data-permission-preview>
              {preview.permissions.map((p) => (
                <li key={p} className="rounded-mo-sm border border-mo px-2 py-1">
                  {p}
                </li>
              ))}
            </ul>
          </>
        )}
      </aside>
    </div>
  )
}
