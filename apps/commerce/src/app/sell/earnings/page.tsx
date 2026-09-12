"use client"

import { Download, Wallet } from "lucide-react"
import Link from "next/link"
import { FencedNotice } from "@/components/sell/FencedNotice"
import { SellerShell } from "@/components/sell/SellerShell"
import { OrderStatusPill } from "@/components/sell/StatusPill"
import { useSellerEarningsPages } from "@/hooks/useSeller"
import { apiMessage } from "@/lib/listing"
import { inr } from "@/lib/money"
import { earningsCsvHref, isFenced, summariseEarnings } from "@/lib/seller"

// The same prefix axios and ./media.ts use: "" at the root, "/shop" under the
// zone's basePath. The rewrite that turns /v1/... into the proxy lives there.
const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "")

export default function SellerEarningsPage() {
  return (
    <SellerShell redirectTo="/shop/sell/earnings">
      <Earnings />
    </SellerShell>
  )
}

function Earnings() {
  const q = useSellerEarningsPages(50)
  const rows = q.data?.pages.flatMap((p) => p.earnings) ?? []
  const totals = summariseEarnings(rows)
  const csvHref = earningsCsvHref(API_BASE)

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="shop-eyebrow">MSeller</span>
          <h1 className="shop-display mt-2 text-3xl sm:text-[38px]">Earnings</h1>
          <p className="mt-2 max-w-xl text-sm text-shop-muted">
            Delivered prepaid lines with the platform&rsquo;s commission, fee and TDS taken out. Cash-on-delivery
            collections are settled separately as remittances.
          </p>
        </div>
        {/* A plain anchor: the browser follows it with the session cookies and
            saves the attachment the server names. No fetch, no blob, nothing
            for a popup blocker to object to. */}
        <a href={csvHref} download="earnings.csv" className="btn btn-outline btn-sm">
          <Download size={14} aria-hidden="true" /> Download CSV
        </a>
      </div>

      {q.isLoading ? (
        <div className="cart-state"><span className="cart-loader" />Loading earnings…</div>
      ) : q.isError ? (
        <div className="mt-6">
          {isFenced(q.error) ? (
            <FencedNotice feature="The earnings statement" />
          ) : (
            <div className="notice notice-error" role="alert">
              <p>{apiMessage(q.error, "Could not load your earnings.")}</p>
              <button type="button" className="btn btn-outline btn-sm mt-3" onClick={() => q.refetch()}>
                Try again
              </button>
            </div>
          )}
        </div>
      ) : rows.length === 0 ? (
        <div className="panel panel-pad mt-6 flex flex-col items-center py-14 text-center">
          <div className="empty-vbag-mark"><Wallet size={30} aria-hidden="true" /></div>
          <p className="max-w-sm text-shop-muted">
            Nothing earned yet. A line appears here once its order is delivered.
          </p>
        </div>
      ) : (
        <>
          {/* The route has no period parameter, so the summary is of what is
              loaded and says so; the CSV is the whole statement. */}
          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-5">
            <Tile label="Net payout" value={inr(totals.net)} gold />
            <Tile label="Gross" value={inr(totals.gross)} />
            <Tile label="Commission" value={inr(totals.commission)} />
            <Tile label="Platform fee" value={inr(totals.platform_fee)} />
            <Tile label="TDS" value={inr(totals.tds)} />
          </div>
          <p className="mt-2 text-xs text-shop-faint">
            Totals over the {totals.count} {totals.count === 1 ? "line" : "lines"} loaded below.
          </p>

          <div className="panel mt-6 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-shop-faint">
                <tr>
                  <th className="px-4 py-3 font-semibold">Delivered</th>
                  <th className="px-4 py-3 font-semibold">Order</th>
                  <th className="px-4 py-3 font-semibold">Product</th>
                  <th className="px-4 py-3 text-right font-semibold">Qty</th>
                  <th className="px-4 py-3 text-right font-semibold">Gross</th>
                  <th className="px-4 py-3 text-right font-semibold">Commission</th>
                  <th className="px-4 py-3 text-right font-semibold">Fee</th>
                  <th className="px-4 py-3 text-right font-semibold">TDS</th>
                  <th className="px-4 py-3 text-right font-semibold">Net</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {rows.map((e) => (
                  <tr key={e.order_item_id}>
                    <td className="whitespace-nowrap px-4 py-3 text-shop-muted">
                      {e.delivered_at ? new Date(e.delivered_at).toLocaleDateString() : "unknown"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <Link href={`/sell/orders/${e.order_id}`} className="hover:text-shop-interactive">
                        {e.order_number}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{e.product_title}</div>
                      <div className="text-xs text-shop-faint">{e.sku}</div>
                    </td>
                    <td className="px-4 py-3 text-right">{e.quantity}</td>
                    <td className="px-4 py-3 text-right">{inr(e.gross_amount)}</td>
                    <td className="px-4 py-3 text-right text-shop-muted">{inr(e.commission_amount)}</td>
                    <td className="px-4 py-3 text-right text-shop-muted">{inr(e.platform_fee)}</td>
                    <td className="px-4 py-3 text-right text-shop-muted">{inr(e.tds_amount)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-shop-gold">{inr(e.net_amount)}</td>
                    <td className="px-4 py-3"><OrderStatusPill status={e.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

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
              <p className="text-xs text-shop-faint">That is every delivered line.</p>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function Tile({ label, value, gold }: { label: string; value: string; gold?: boolean }) {
  return (
    <div className="panel p-4">
      <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-shop-faint">{label}</div>
      <div className={`mt-1 text-lg font-semibold ${gold ? "text-shop-gold" : ""}`}>{value}</div>
    </div>
  )
}
