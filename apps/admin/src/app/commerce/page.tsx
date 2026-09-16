"use client"

import Link from "next/link"
import { PageHeader } from "@/components/blocks/PageHeader"
import { NoAccessToApp, useAdmin } from "@/components/shell/AdminShell"
import { useProductQueue, useSellerQueue } from "@/hooks/useAdminCommerce"
import { findNavGroup } from "@/lib/admin/me"

/**
 * MStore's dashboard — the counts that used to be the whole console's
 * overview. Pending payouts are not counted here: reading them needs a
 * step-up, and a landing page should not prompt for 2FA on arrival.
 */
export default function MStoreDashboard() {
  const { nav } = useAdmin()
  const group = findNavGroup(nav, "commerce")
  const has = (id: string) => group?.links.some((link) => link.id === id) ?? false
  const sellers = useSellerQueue()
  const products = useProductQueue()

  if (!group) return <NoAccessToApp />

  const cards = [
    has("sellers") && { label: "Pending sellers", n: sellers.data?.length, href: "/sellers", loading: sellers.isLoading, failed: sellers.isError },
    has("products") && { label: "Pending products", n: products.data?.length, href: "/products", loading: products.isLoading, failed: products.isError },
  ].filter(Boolean) as { label: string; n?: number; href: string; loading: boolean; failed: boolean }[]

  return (
    <div>
      <PageHeader eyebrow="Application" title={group.label} />
      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map((c) => (
          <Link key={c.href} href={c.href} className="rounded-mo border border-mo bg-mo-surface p-5 hover:border-mo-strong">
            <div className="text-sm text-mo-body">{c.label}</div>
            <div className="mt-2 font-mo-display text-3xl font-semibold text-mo-ink">{c.loading ? "…" : c.failed ? "—" : c.n ?? 0}</div>
          </Link>
        ))}
        {group.links
          .filter((link) => link.id === "catalogue" || link.id === "payouts")
          .map((link) => (
            <Link key={link.id} href={link.href} className="rounded-mo border border-mo bg-mo-surface p-5 hover:border-mo-strong">
              <div className="text-sm text-mo-body">Open</div>
              <div className="mt-2 font-mo-display text-xl font-semibold text-mo-ink">{link.label}</div>
            </Link>
          ))}
      </div>
    </div>
  )
}
