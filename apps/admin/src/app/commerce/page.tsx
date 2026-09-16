"use client"

import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { AppDashboard } from "@/components/blocks/AppDashboard"
import { useAdmin } from "@/components/shell/AdminShell"
import { MStoreBanners, MStoreCodSettle, MStoreCompliance, MStoreDeadLetters } from "@/components/commerce/MStoreSections"
import { useProductQueue, useSellerQueue } from "@/hooks/useAdminCommerce"
import { findNavGroup } from "@/lib/admin/me"
import { COMMERCE_SECTIONS } from "@/lib/admin/sections"

const DESCRIPTIONS: Record<string, string> = {
  catalogue: "Attribute definitions, category schemas and publishing",
  sellers: "Approve sellers, request changes, suspend, verify KYC",
  products: "Review submitted listings",
  payouts: "What sellers are owed (needs 2FA to view)",
}

/**
 * The older MStore screens keep their URLs (the catalogue editor links
 * between its own pages); here they are cards under MStore. Queue counts come
 * from the queues themselves, so they are never 0 on a failed read.
 */
function MStoreScreens() {
  const { nav } = useAdmin()
  const links = findNavGroup(nav, "commerce")?.links ?? []
  const hasSellers = links.some((l) => l.id === "sellers")
  const hasProducts = links.some((l) => l.id === "products")
  const sellers = useSellerQueue({ enabled: hasSellers })
  const products = useProductQueue({ enabled: hasProducts })
  const count = (q: { isLoading: boolean; isError: boolean; data?: unknown[] }) =>
    q.isLoading ? "…" : q.isError || !q.data ? "unavailable" : String(q.data.length)
  if (links.length === 0) return null
  return (
    <ul className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="MStore screens">
      {links.map((link) => (
        <li key={link.id}>
          <Link href={link.href} className="flex h-full flex-col rounded-mo border border-mo bg-mo-surface p-4 hover:border-mo-strong">
            <span className="flex items-center gap-1 font-mo-display text-base font-semibold text-mo-ink">
              {link.label} <ArrowRight className="h-4 w-4 text-mo-body" aria-hidden="true" />
            </span>
            <span className="mt-1 text-xs text-mo-body">{DESCRIPTIONS[link.id]}</span>
            {link.id === "sellers" ? <span className="mt-2 text-sm text-mo-ink">{count(sellers)} waiting</span> : null}
            {link.id === "products" ? <span className="mt-2 text-sm text-mo-ink">{count(products)} waiting</span> : null}
          </Link>
        </li>
      ))}
    </ul>
  )
}

/** MStore. KYC verify and pending payouts need a fresh 2FA code; COD settlement is two-person. */
export default function MStoreDashboard() {
  return (
    <AppDashboard
      app="commerce"
      description="Sellers, products, payouts and the catalogue, plus banners, jobs and compliance."
      sections={COMMERCE_SECTIONS}
      extra={<MStoreScreens />}
      renderSection={(id) => {
        switch (id) {
          case "banners":
            return <MStoreBanners />
          case "jobs":
            return <MStoreDeadLetters />
          case "compliance":
            return <MStoreCompliance />
          case "cod":
            return <MStoreCodSettle />
          default:
            return null
        }
      }}
    />
  )
}
