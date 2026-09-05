"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useEffect, useState } from "react"
import { Search, ShoppingBag, Package, User, Store, Menu, Sparkles } from "lucide-react"
import { useCart } from "@/hooks/useCommerce"
import { getCurrentUserId } from "@atpost/api-client"

type Category = { id: string; name: string }

// The search box is the only part of this header that reads the URL, and
// `useSearchParams` opts its whole tree out of prerendering. Left inline it
// took the entire commerce zone's build down — every page that renders the
// header failed to export, so the app could not be built or deployed at all.
//
// Isolating it means the header still prerenders: the fallback below emits the
// same markup with an empty box, and the real one swaps in on hydration with
// the query filled. Search is a client action either way, so nothing is lost.
function SearchForm({ initialQuery, onSubmit }: {
  initialQuery: string
  onSubmit?: (query: string) => void
}) {
  const [q, setQ] = useState(initialQuery)
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit?.(q)
      }}
      className="market-search"
      role="search"
    >
      <label className="sr-only" htmlFor="market-search-input">Search products</label>
      <Search size={19} />
      <input
        id="market-search-input"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="What are you looking for today?"
      />
      <button type="submit" aria-label="Search"><Search size={22} /></button>
    </form>
  )
}

function LiveSearchForm() {
  const router = useRouter()
  const params = useSearchParams()
  return (
    <SearchForm
      initialQuery={params.get("q") ?? ""}
      onSubmit={(q) => router.push(q.trim() ? `/?q=${encodeURIComponent(q.trim())}` : "/")}
    />
  )
}

export function StoreHeader({ categories = [] }: { categories?: Category[] }) {
  const [userId, setUserId] = useState<string | null>(null)
  const { data: cart } = useCart()
  const count = cart?.ItemCount ?? 0

  useEffect(() => setUserId(getCurrentUserId()), [])

  return (
    <header className="marketplace-header">
      <div className="market-note"><Sparkles size={14} /> Curated finds, independent sellers, one VChat experience</div>
      <div className="header-main">
        <Link href="/" className="shop-brand" aria-label="VChat Shop home">
          <span>V</span><strong>VChat</strong><small>MARKET</small>
        </Link>
        <Suspense fallback={<SearchForm initialQuery="" />}>
          <LiveSearchForm />
        </Suspense>
        <nav className="header-actions" aria-label="Account and shopping">
          <a href={userId ? "/shop/orders" : "/login?redirect=%2Fshop"} className="header-action" aria-label={userId ? "Account" : "Sign in"}>
            <User size={20} /><span>{userId ? "Account" : "Sign in"}</span>
          </a>
          <Link href="/orders" className="header-action" aria-label="Orders"><Package size={20} /><span>Orders</span></Link>
          <Link href="/cart" className="cart-action" aria-label={`Shopping bag with ${count} items`}><span><ShoppingBag size={22} />{count > 0 && <b>{count}</b>}</span><strong>Bag</strong></Link>
        </nav>
      </div>
      <nav className="category-menu" aria-label="Product categories">
        <Link href="/?stock=true" className="all-categories"><Menu size={18} /> Explore all</Link>
        {(categories.length ? categories.slice(0, 9) : [
          { id: "fashion", name: "Fashion" }, { id: "electronics", name: "Electronics" }, { id: "grocery", name: "Grocery & Food" },
          { id: "home", name: "Home & Kitchen" }, { id: "books", name: "Books" }, { id: "beauty", name: "Beauty" }, { id: "sports", name: "Sports" },
        ]).map((category) => <Link key={category.id} href={`/?category=${encodeURIComponent(category.id)}`}>{category.name}</Link>)}
        <Link href="/sell" className="sell-link"><Store size={17} /> Open your shop</Link>
      </nav>
    </header>
  )
}
