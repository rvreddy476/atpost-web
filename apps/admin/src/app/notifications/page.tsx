"use client"

import { useState } from "react"
import { DataTable } from "@/components/blocks/DataTable"
import { ConfirmReasonDialog } from "@/components/blocks/ConfirmReasonDialog"
import { buttonSecondary } from "@/components/blocks/buttons"
import { IdText, StatusPill } from "@/components/blocks/bits"
import { useAdmin } from "@/components/shell/AdminShell"
import { useAdminMutation } from "@/hooks/useAdminMutation"
import { adminKey, useAdminList } from "@/hooks/useAdminQuery"
import { can } from "@/lib/admin/sections"
import { humanise, num, str, when, type Row } from "@/lib/admin/data"

export default function NotificationOperations() {
  const { me } = useAdmin()
  const allowed = can(me, "platform", "audit.read")
  const retryAllowed = can(me, "platform", "roles.manage")
  const q = useAdminList("platform", "/v1/admin/notifications/partner-jobs", { enabled: allowed, refetchInterval: 15000 })
  const [retry, setRetry] = useState<Row | null>(null)
  const save = useAdminMutation<string>({ request: reason => ({ method: "post", url: `/v1/admin/notifications/partner-jobs/${String(retry?.id)}/retry`, body: { reason } }), invalidate: [adminKey("platform")], successMessage: "Notification queued for retry", errorTitle: "Retry could not be saved", onDone: () => setRetry(null) })
  return <section className="space-y-5"><header><h1 className="text-2xl font-semibold">Partner notification delivery</h1><p className="mt-2 text-sm text-mo-body">Pending and failed app alerts across the four work categories. Delivery retries run automatically. Expired offers cannot be replayed.</p></header>
    {!allowed ? <p role="alert">You need platform audit access to view delivery health.</p> : <DataTable caption="Latest 100 notification delivery jobs" rows={q.data ?? []} rowId={r => String(r.id)} loading={q.isLoading} error={q.error} onRetry={q.refetch} columns={[
      { key: "id", header: "Notification", value: r => str(r.id), cell: r => <IdText id={r.id} /> },
      { key: "type", header: "Update", value: r => str(r.type), cell: r => humanise(r.type), filterable: true },
      { key: "status", header: "Status", value: r => str(r.status), cell: r => <StatusPill value={str(r.status) ?? "unknown"} />, filterable: true },
      { key: "attempts", header: "Attempts", value: r => num(r.attempts) },
      { key: "error", header: "Last result", value: r => str(r.last_error), cell: r => humanise(r.last_error) },
      { key: "next", header: "Next attempt", value: r => str(r.available_at), cell: r => r.status === "pending" ? when(r.available_at) : "—" },
      { key: "action", header: "Recovery", value: r => str(r.id), cell: r => retryAllowed && r.status === "failed" && !r.expires_at ? <button className={buttonSecondary} onClick={() => setRetry(r)}>Retry</button> : r.expires_at ? "Time-limited offer" : null },
    ]} emptyMessage="No pending or failed Partner notifications." />}
    <ConfirmReasonDialog open={!!retry} title="Retry failed notification" description="Use this after fixing the delivery problem. Devices that already received the update will not be notified again." confirmLabel="Queue retry" requireReason busy={save.isPending} maxReasonLength={1000} onClose={() => setRetry(null)} onConfirm={r => save.mutate(r)} />
  </section>
}

