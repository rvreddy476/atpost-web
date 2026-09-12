"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

const ITEMS = [
  { href: "/sell", label: "Products", match: (p: string) => p === "/sell" || p.startsWith("/sell/products") },
  { href: "/sell/orders", label: "Orders", match: (p: string) => p.startsWith("/sell/orders") },
  { href: "/sell/returns", label: "Returns", match: (p: string) => p.startsWith("/sell/returns") },
  { href: "/sell/earnings", label: "Earnings", match: (p: string) => p.startsWith("/sell/earnings") },
] as const

/**
 * MSeller's sections. A row of the zone's outline buttons rather than a new
 * tab component: the active one borrows the interactive colour, because
 * moving between sections is navigation, not money, and gold in this zone is
 * reserved for the latter. `usePathname` answers without the `/shop` basePath,
 * which is why the matchers compare against `/sell/...`.
 */
export function SellerNav() {
  const pathname = usePathname() ?? ""
  return (
    <nav aria-label="MSeller sections" className="mb-6 flex flex-wrap gap-2">
      {ITEMS.map((item) => {
        const active = item.match(pathname)
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`btn btn-outline btn-sm ${
              active ? "border-shop-interactive bg-shop-interactive/10 text-shop-interactive" : ""
            }`}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
