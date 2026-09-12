"use client"

import { useState } from "react"
import Link from "next/link"
import { RotateCcw } from "lucide-react"
import { FencedNotice } from "@/components/sell/FencedNotice"
import { SellerShell } from "@/components/sell/SellerShell"
import { ReturnStatusPill } from "@/components/sell/StatusPill"
import { useApproveReturn, useRejectReturn, type SellerReturnCard } from "@/hooks/useCommerce"
import { useSellerReturnPages } from "@/hooks/useSeller"
import { apiMessage } from "@/lib/listing"
import { inr } from "@/lib/money"
import { isFenced } from "@/lib/seller"

export default function SellerReturnsPage() {
  return (
    <SellerShell redirectTo="/shop/sell/returns">
      <ReturnsInbox />
    </SellerShell>
  )
}

// The server's own filter values (ListSellerReturns: requested / approved /
// rejected / refunded). "" is the unfiltered inbox.
const STATUSES: ReadonlyArray<{ id: string; label: string }> = [
  { id: "", label: "All" },
  { id: "requested", label: "Requested" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
  { id: "refunded", label: "Refunded" },
]

function ReturnsInbox() {
  const [status, setStatus] = useState("")
  const q = useSellerReturnPages(status)
  const rows = q.data?.pages.flatMap((p) => p.returns) ?? []

  return (
    <div>
      <span className="shop-eyebrow">MSeller</span>
      <h1 className="shop-display mt-2 text-3xl sm:text-[38px]">Returns</h1>

      <div role="group" aria-label="Filter returns" className="mt-6 flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-pressed={status === s.id}
            onClick={() => setStatus(s.id)}
            className={`btn btn-outline btn-sm ${
              status === s.id ? "border-shop-interactive bg-shop-interactive/10 text-shop-interactive" : ""
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {q.isLoading ? (
        <div className="cart-state"><span className="cart-loader" />Loading returns…</div>
      ) : q.isError ? (
        <div className="mt-6">
          {isFenced(q.error) ? (
            <FencedNotice feature="Returns" />
          ) : (
            <div className="notice notice-error" role="alert">
              <p>{apiMessage(q.error, "Could not load your returns.")}</p>
              <button type="button" className="btn btn-outline btn-sm mt-3" onClick={() => q.refetch()}>
                Try again
              </button>
            </div>
          )}
        </div>
      ) : rows.length === 0 ? (
        <div className="panel panel-pad mt-6 flex flex-col items-center py-14 text-center">
          <div className="empty-vbag-mark"><RotateCcw size={30} aria-hidden="true" /></div>
          <p className="max-w-sm text-shop-muted">
            {status ? "No returns in this state." : "No return requests. When a buyer asks to send something back, it lands here."}
          </p>
        </div>
      ) : (
        <>
          <ul className="mt-6 flex flex-col gap-3">
            {rows.map((row) => <ReturnRow key={row.return.id} row={row} />)}
          </ul>
          <div className="mt-6">
            {q.hasNextPage ? (
              <button
                type="button"
                className="btn btn-outline btn-sm"
                disabled={q.isFetchingNextPage}
                onClick={() => q.fetchNextPage()}
              >
                {q.isFetchingNextPage ? "Loading…" : "Load more"}
              </button>
            ) : (
              <p className="text-xs text-shop-faint">That is every return in this view.</p>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function ReturnRow({ row }: { row: SellerReturnCard }) {
  const r = row.return
  const item = row.order_item
  const approve = useApproveReturn()
  const reject = useRejectReturn()
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState("")
  const [reasonError, setReasonError] = useState<string | null>(null)
  const busy = approve.isPending || reject.isPending
  const serverError = approve.isError
    ? apiMessage(approve.error, "Could not approve the return.")
    : reject.isError
      ? apiMessage(reject.error, "Could not reject the return.")
      : null

  function submitReject(e: React.FormEvent) {
    e.preventDefault()
    const text = reason.trim()
    // The route binds `reason` as required; refusing an empty one here saves
    // a round trip and, more to the point, a buyer reading "rejected: ".
    if (text.length < 3) {
      setReasonError("Tell the buyer why, in a sentence.")
      return
    }
    setReasonError(null)
    reject.mutate({ returnId: r.id, reason: text })
  }

  return (
    <li className="panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-shop-faint">
            {row.order ? (
              <Link href={`/sell/orders/${r.order_id}`} className="hover:text-shop-interactive">
                Order {row.order.order_number}
              </Link>
            ) : (
              <>Order {r.order_id.slice(0, 8)}</>
            )}
          </div>
          <div className="mt-1.5 font-semibold">
            {item?.product_title ?? "Item"}
            {item ? <span className="text-shop-muted"> · {item.sku} · Qty {item.quantity}</span> : null}
          </div>
          <div className="mt-1.5 text-sm text-shop-muted">
            <span className="font-semibold text-shop-ink">{r.reason_code.replace(/_/g, " ")}</span>
            {r.reason_description ? <> · {r.reason_description}</> : null}
          </div>
          <div className="mt-1.5 text-xs text-shop-faint">
            Requested {new Date(r.requested_at).toLocaleString()}
            {typeof r.refund_amount === "number" ? (
              <>
                <span className="mx-2" aria-hidden="true">·</span>
                Refund <span className="font-semibold text-shop-gold">{inr(r.refund_amount)}</span>
              </>
            ) : null}
            {r.rejection_reason ? (
              <>
                <span className="mx-2" aria-hidden="true">·</span>
                Rejected: {r.rejection_reason}
              </>
            ) : null}
          </div>
        </div>
        <ReturnStatusPill status={r.status} />
      </div>

      {/* Only a requested return can be decided (ApproveReturn / RejectReturn
          refuse any other status with a 400), so the buttons exist only then.
          Approving moves money back to the buyer, which is the zone's rule for
          gold; rejecting is the danger outline. */}
      {r.status === "requested" ? (
        <div className="mt-4 border-t border-white/10 pt-4">
          {rejecting ? (
            <form onSubmit={submitReject} className="flex flex-col gap-3" noValidate>
              <div>
                <label htmlFor={`reject-${r.id}`} className="field-label">Reason for rejecting</label>
                <textarea
                  id={`reject-${r.id}`}
                  className="field"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  disabled={busy}
                  aria-invalid={!!reasonError}
                  placeholder="The buyer will read this."
                />
                {reasonError ? <p className="field-hint text-shop-bad">{reasonError}</p> : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="submit" className="btn btn-danger btn-sm" disabled={busy}>
                  {reject.isPending ? "Rejecting…" : "Reject return"}
                </button>
                <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setRejecting(false)}>
                  Back
                </button>
                {serverError ? <p className="text-sm text-shop-bad" role="alert">{serverError}</p> : null}
              </div>
            </form>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="btn btn-gold btn-sm"
                disabled={busy}
                onClick={() => approve.mutate(r.id)}
              >
                {approve.isPending ? "Approving…" : "Approve and refund"}
              </button>
              <button type="button" className="btn btn-danger btn-sm" disabled={busy} onClick={() => setRejecting(true)}>
                Reject
              </button>
              {serverError ? <p className="text-sm text-shop-bad" role="alert">{serverError}</p> : null}
            </div>
          )}
        </div>
      ) : null}
    </li>
  )
}
