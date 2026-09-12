"use client"

import Link from "next/link"
import { SellerShell } from "@/components/sell/SellerShell"
import { useMyProducts, useSubmitProduct } from "@/hooks/useSellerDashboard"
import { Table, TBody, TD, TH, THead, TR } from "@atpost/ui"

function MyProducts() {
  const { data: products, isLoading } = useMyProducts()
  const submit = useSubmitProduct()

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="shop-display text-2xl">My products</h1>
        <div className="flex flex-wrap items-center gap-2">
          {/* The guided route asks the category first and then only what that
              category needs. The plain one below it is unchanged and still the
              fastest path for a seller who knows exactly what they are doing. */}
          <Link
            href="/sell/products/guided"
            className="btn btn-outline btn-sm"
          >
            Start from a category
          </Link>
          <Link href="/sell/products/new" className="btn btn-gold btn-sm">
            + Add product
          </Link>
        </div>
      </div>
      <Table
        loading={isLoading}
        empty={!products || products.length === 0}
        emptyMessage="No products yet. Add your first one."
      >
        <THead>
          <TR>
            <TH>Title</TH>
            <TH>Approval</TH>
            <TH className="text-right">Action</TH>
          </TR>
        </THead>
        <TBody>
          {products?.map((p) => (
            <TR key={p.id}>
              <TD className="font-medium">{p.title}</TD>
              <TD className="text-shop-muted">{p.approval_status}</TD>
              <TD className="text-right">
                {p.approval_status === "draft" ? (
                  <button
                    onClick={() => submit.mutate(p.id)}
                    disabled={submit.isPending}
                    className="btn btn-outline btn-sm"
                  >
                    Submit for review
                  </button>
                ) : (
                  <span className="text-xs text-shop-faint">—</span>
                )}
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  )
}

/**
 * MSeller's front door: the product list, inside the shell that gates on a
 * session and a seller profile and draws the Products / Orders / Returns /
 * Earnings sections. The gating and the onboarding form used to live in this
 * file; they moved to components/sell so the new sections could share them.
 * `/shop` as the login return path is what this page has always sent.
 */
export default function SellPage() {
  return (
    <SellerShell redirectTo="/shop">
      <MyProducts />
    </SellerShell>
  )
}
