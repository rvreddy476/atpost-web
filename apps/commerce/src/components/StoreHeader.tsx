"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useState } from "react"
import { Search, ShoppingBag, Package, User, Store, LayoutGrid, ShieldCheck } from "lucide-react"
import { useCart, useSession } from "@/hooks/useCommerce"
import { useCapabilities } from "@atpost/api-client/capabilities"
import { RoleSwitcher } from "@atpost/ui"

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
      <Search size={18} aria-hidden="true" />
      <input
        id="market-search-input"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search the store"
      />
      <button type="submit" aria-label="Search"><Search size={18} /></button>
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

function CategoryRailView({ categories, active }: { categories: Category[]; active?: string | null }) {
  return (
    <nav className="category-menu" aria-label="Product categories">
      <Link href="/?stock=true" className="all-categories">
        <LayoutGrid size={16} aria-hidden="true" /> All products
      </Link>
      {categories.map((category) => (
        <Link
          key={category.id}
          href={`/?category=${encodeURIComponent(category.id)}`}
          aria-current={active === category.id ? "true" : undefined}
        >
          {category.name}
        </Link>
      ))}
      <Link href="/sell" className="sell-link">
        <Store size={15} aria-hidden="true" /> Sell on atPost
      </Link>
    </nav>
  )
}

// Same reasoning as the search box: reading `category` from the URL to mark the
// active chip must not drag the header out of the prerender.
function CategoryRail({ categories }: { categories: Category[] }) {
  const params = useSearchParams()
  return <CategoryRailView categories={categories} active={params.get("category")} />
}

/** Shown until the live categories arrive, so the rail never collapses. */
const FALLBACK_CATEGORIES: Category[] = [
  { id: "electronics", name: "Electronics" },
  { id: "fashion", name: "Fashion" },
  { id: "home", name: "Home & Kitchen" },
  { id: "beauty", name: "Beauty & Personal Care" },
  { id: "books", name: "Books & Stationery" },
  { id: "sports", name: "Sports & Fitness" },
]

export function StoreHeader({ categories = [] }: { categories?: Category[] }) {
  // Right on the FIRST paint, not one effect later. The zone's layout seeds
  // the session from the request's own cookies, so a signed-in shopper never
  // watches "Sign in" flash in their own header before it corrects itself.
  const { signedIn } = useSession()
  const { data: cart } = useCart()
  // Renders nothing at all for a shopper with no other hat, which is almost
  // everyone — and nothing while signed out, because the query never runs.
  const { destinations } = useCapabilities()
  const count = cart?.ItemCount ?? 0
  const rail = categories.length ? categories.slice(0, 10) : FALLBACK_CATEGORIES

  return (
    <header className="marketplace-header">
      <div className="market-note">
        <ShieldCheck size={13} aria-hidden="true" /> Verified sellers · Protected payments · Easy returns
      </div>
      <div className="header-main">
        <Link href="/" className="shop-brand" aria-label="atPost Shop home">
          <span aria-hidden="true">a</span><strong>atPost</strong><small>SHOP</small>
        </Link>
        <Suspense fallback={<SearchForm initialQuery="" />}>
          <LiveSearchForm />
        </Suspense>
        <nav className="header-actions" aria-label="Account and shopping">
          <RoleSwitcher destinations={destinations} label="Switch" className="mr-1" />
          <a href={signedIn ? "/shop/orders" : "/login?redirect=%2Fshop"} className="header-action" aria-label={signedIn ? "Account" : "Sign in"}>
            <User size={19} aria-hidden="true" /><span>{signedIn ? "Account" : "Sign in"}</span>
          </a>
          <Link href="/orders" className="header-action" aria-label="Orders">
            <Package size={19} aria-hidden="true" /><span>Orders</span>
          </Link>
          <Link href="/cart" className="cart-action" aria-label={`Shopping bag with ${count} ${count === 1 ? "item" : "items"}`}>
            <span><ShoppingBag size={20} aria-hidden="true" />{count > 0 && <b>{count}</b>}</span>
            <strong>Bag</strong>
          </Link>
        </nav>
      </div>
      <Suspense fallback={<CategoryRailView categories={rail} />}>
        <CategoryRail categories={rail} />
      </Suspense>
    </header>
  )
}
