"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"
import { Search, ShoppingCart, Package, User, Store, Menu, MapPin, ChevronDown } from "lucide-react"
import { useCart } from "@/hooks/useCommerce"
import { getCurrentUserId } from "@atpost/api-client"

type Category = { id: string; name: string }

export function StoreHeader({ categories = [] }: { categories?: Category[] }) {
  const router = useRouter()
  const params = useSearchParams()
  const [q, setQ] = useState(params.get("q") ?? "")
  const [userId, setUserId] = useState<string | null>(null)
  const { data: cart } = useCart()
  const count = cart?.ItemCount ?? 0

  useEffect(() => setUserId(getCurrentUserId()), [])

  function onSearch(e: React.FormEvent) {
    e.preventDefault()
    router.push(q.trim() ? `/?q=${encodeURIComponent(q.trim())}` : "/")
  }

  return (
    <header className="marketplace-header">
      <div className="header-main">
        <Link href="/" className="shop-brand" aria-label="VChat Shop home">
          <span>V</span><strong>Chat</strong><small>shop</small>
        </Link>
        <button className="delivery-location" type="button" aria-label="Choose delivery location">
          <MapPin size={18} /><span><small>Deliver to</small><strong>Select location</strong></span>
        </button>
        <form onSubmit={onSearch} className="market-search" role="search">
          <label className="sr-only" htmlFor="market-search-input">Search products</label>
          <select aria-label="Search category" defaultValue="all">
            <option value="all">All</option>
            {categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}
          </select>
          <input id="market-search-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search VChat Shop" />
          <button type="submit" aria-label="Search"><Search size={22} /></button>
        </form>
        <nav className="header-actions" aria-label="Account and shopping">
          <a href={userId ? "/shop/orders" : "/login?redirect=%2Fshop"} className="header-action">
            <User size={20} /><span><small>{userId ? "Welcome back" : "Hello, sign in"}</small><strong>Account <ChevronDown size={12} /></strong></span>
          </a>
          <Link href="/orders" className="header-action"><Package size={20} /><span><small>Returns</small><strong>& Orders</strong></span></Link>
          <Link href="/cart" className="cart-action"><span><ShoppingCart size={27} />{count > 0 && <b>{count}</b>}</span><strong>Cart</strong></Link>
        </nav>
      </div>
      <nav className="category-menu" aria-label="Product categories">
        <Link href="/?stock=true" className="all-categories"><Menu size={20} /> All categories</Link>
        {(categories.length ? categories.slice(0, 9) : [
          { id: "fashion", name: "Fashion" }, { id: "electronics", name: "Electronics" }, { id: "grocery", name: "Grocery & Food" },
          { id: "home", name: "Home & Kitchen" }, { id: "books", name: "Books" }, { id: "beauty", name: "Beauty" }, { id: "sports", name: "Sports" },
        ]).map((category) => <Link key={category.id} href={`/?category=${encodeURIComponent(category.id)}`}>{category.name}</Link>)}
        <Link href="/sell" className="sell-link"><Store size={17} /> Sell on VChat</Link>
      </nav>
    </header>
  )
}
