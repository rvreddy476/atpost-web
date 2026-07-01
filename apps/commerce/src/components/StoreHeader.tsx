"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { Search, ShoppingCart, Package, User, Store } from "lucide-react"
import { useCart } from "@/hooks/useCommerce"
import { getCurrentUserId } from "@atpost/api-client"

// Amazon/eBay-style storefront header: brand, big search, orders, cart, account.
export function StoreHeader() {
  const router = useRouter()
  const [q, setQ] = useState("")
  const [userId, setUserId] = useState<string | null>(null)
  const { data: cart } = useCart()
  const count = cart?.ItemCount ?? 0

  useEffect(() => setUserId(getCurrentUserId()), [])

  function onSearch(e: React.FormEvent) {
    e.preventDefault()
    router.push(q.trim() ? `/?q=${encodeURIComponent(q.trim())}` : "/")
  }

  return (
    <header className="sticky top-0 z-30 border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-gray-900 text-sm font-bold text-white">
            VC
          </span>
          <span className="hidden text-lg font-semibold sm:block">Shop</span>
        </Link>

        <form onSubmit={onSearch} className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-md">
            <div className="flex items-center rounded-lg border border-gray-300 focus-within:border-gray-900">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search products"
                className="w-full bg-transparent px-4 py-2 text-sm outline-none"
              />
              <button type="submit" className="px-3 text-gray-500 hover:text-gray-900" aria-label="Search">
                <Search size={18} />
              </button>
            </div>
          </div>
        </form>

        <Link href="/sell" className="hidden items-center gap-1 text-sm text-gray-700 hover:text-gray-900 sm:flex">
          <Store size={18} /> Sell
        </Link>

        <Link href="/orders" className="hidden items-center gap-1 text-sm text-gray-700 hover:text-gray-900 sm:flex">
          <Package size={18} /> Orders
        </Link>

        <Link href="/cart" className="relative flex items-center gap-1 text-sm text-gray-700 hover:text-gray-900">
          <ShoppingCart size={20} />
          {count > 0 && (
            <span className="absolute -right-2 -top-2 grid h-5 min-w-[1.25rem] place-items-center rounded-full bg-gray-900 px-1 text-[11px] font-semibold text-white">
              {count}
            </span>
          )}
        </Link>

        <a
          href={userId ? "/shop/orders" : "/login?redirect=%2Fshop"}
          className="flex items-center gap-1 text-sm text-gray-700 hover:text-gray-900"
        >
          <User size={18} /> {userId ? "Account" : "Sign in"}
        </a>
      </div>
    </header>
  )
}
