"use client"

import Link from "next/link"
import { useSellerQueue, useProductQueue, usePendingPayouts } from "@/hooks/useAdminCommerce"

export default function AdminDashboard() {
  const sellers = useSellerQueue()
  const products = useProductQueue()
  const payouts = usePendingPayouts()

  const cards = [
    { label: "Pending sellers", n: sellers.data?.length, href: "/sellers", loading: sellers.isLoading },
    { label: "Pending products", n: products.data?.length, href: "/products", loading: products.isLoading },
    { label: "Pending payouts", n: payouts.data?.length, href: "/payouts", loading: payouts.isLoading },
  ]

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Overview</h1>
      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="rounded-xl border border-gray-200 bg-white p-5 hover:border-gray-400"
          >
            <div className="text-sm text-gray-500">{c.label}</div>
            <div className="mt-2 text-3xl font-bold">{c.loading ? "…" : c.n ?? 0}</div>
          </Link>
        ))}
      </div>
    </div>
  )
}
