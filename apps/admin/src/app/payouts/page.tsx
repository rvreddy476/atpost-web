"use client"

import { Table, TBody, TD, TH, THead, TR } from "@atpost/ui"
import { usePendingPayouts } from "@/hooks/useAdminCommerce"

export default function PayoutsPage() {
  const { data: payouts, isLoading } = usePendingPayouts()

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Pending payouts</h1>
      <Table
        loading={isLoading}
        empty={!payouts || payouts.length === 0}
        emptyMessage="No pending payouts."
      >
        <THead>
          <TR>
            <TH>Seller</TH>
            <TH>Amount</TH>
            <TH>Status</TH>
          </TR>
        </THead>
        <TBody>
          {payouts?.map((p) => (
            <TR key={p.id}>
              <TD className="text-gray-600">{p.seller_id}</TD>
              <TD className="font-medium">
                {(p.currency_code ?? "INR")} {(p.amount_minor / 100).toFixed(2)}
              </TD>
              <TD className="text-gray-600">{p.status}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  )
}
