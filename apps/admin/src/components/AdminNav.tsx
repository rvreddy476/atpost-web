"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { LayoutDashboard, Store, Package, Banknote } from "lucide-react"

const links = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/sellers", label: "Sellers", icon: Store },
  { href: "/products", label: "Products", icon: Package },
  { href: "/payouts", label: "Payouts", icon: Banknote },
]

export function AdminNav() {
  const pathname = usePathname()
  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
        <span className="flex items-center gap-2 font-semibold">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-gray-900 text-xs font-bold text-white">VC</span>
          Admin
        </span>
        <nav className="flex items-center gap-1">
          {links.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                className={[
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm",
                  active ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-100",
                ].join(" ")}
              >
                <Icon size={16} /> {label}
              </Link>
            )
          })}
        </nav>
      </div>
    </header>
  )
}
