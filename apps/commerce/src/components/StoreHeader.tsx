"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useCallback, useEffect, useId, useRef, useState } from "react"
import {
  Search, ShoppingBag, Heart, Store, LayoutGrid, ShieldCheck, Package, MapPin, CreditCard,
  History, Settings, ChevronDown, Smartphone, User,
} from "lucide-react"
import { BRAND } from "@momentum/brand"
import { useCart, useFavourites, useSession } from "@/hooks/useCommerce"
import { favouriteCount } from "@/lib/favourites"
import { useCapabilities } from "@atpost/api-client/capabilities"
import { RoleSwitcher } from "@atpost/ui"
import { Wordmark } from "@/components/commerce/Wordmark"

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
        placeholder={`Search ${BRAND.store}`}
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

/**
 * The profile menu, matching the phone's entry for entry.
 *
 * Kept mounted and closed with `hidden`, the way @atpost/ui's RoleSwitcher
 * is, so the whole thing is in the markup and can be asserted on without a
 * browser. Addresses, orders, favourites and purchase history are pages in
 * this zone; Payments and Settings are not on the web yet, and a row that
 * says so honestly beats a link to a 404, the same rule the RoleSwitcher
 * applies to app-only roles.
 *
 * "Sell on MStore" is the bridge to the seller side. It reads "Seller
 * dashboard" when identity says this person already has the seller hat, and
 * "Start selling" when they do not; both go to the same place, which sorts
 * out which of the two it is.
 */
function AccountMenu({ initial, isSeller }: { initial: string; isSeller: boolean }) {
  const baseId = useId()
  const menuId = `${baseId}-menu`
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) close()
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close()
    }
    document.addEventListener("mousedown", onPointerDown)
    document.addEventListener("touchstart", onPointerDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onPointerDown)
      document.removeEventListener("touchstart", onPointerDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open, close])

  const appOnly = `In the ${BRAND.store} app`

  return (
    <div className="account-menu" ref={wrapperRef}>
      <button
        type="button"
        className="account-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label="Your account"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="account-avatar" aria-hidden="true">{initial || <User size={16} />}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      <div id={menuId} className="account-panel" role="menu" hidden={!open} onClick={close}>
        <Link href="/orders" role="menuitem"><Package size={16} aria-hidden="true" /> My orders</Link>
        <Link href="/favourites" role="menuitem"><Heart size={16} aria-hidden="true" /> Favourites</Link>
        <Link href="/addresses" role="menuitem"><MapPin size={16} aria-hidden="true" /> Addresses</Link>
        <span className="is-app-only" role="menuitem" aria-disabled="true" title={appOnly}>
          <CreditCard size={16} aria-hidden="true" /> Payments <small><Smartphone size={11} aria-hidden="true" /> app</small>
        </span>
        <Link href="/orders?history=true" role="menuitem"><History size={16} aria-hidden="true" /> Purchase history</Link>
        <span className="is-app-only" role="menuitem" aria-disabled="true" title={appOnly}>
          <Settings size={16} aria-hidden="true" /> Settings <small><Smartphone size={11} aria-hidden="true" /> app</small>
        </span>
        <hr />
        <Link href="/sell" role="menuitem" className="sell-row">
          <Store size={16} aria-hidden="true" />
          <span>Sell on {BRAND.store}<small>{isSeller ? "Seller dashboard" : "Start selling"}</small></span>
        </Link>
      </div>
    </div>
  )
}

export function StoreHeader({ categories = [] }: { categories?: Category[] }) {
  // Right on the FIRST paint, not one effect later. The zone's layout seeds
  // the session from the request's own cookies, so a signed-in shopper never
  // watches "Sign in" flash in their own header before it corrects itself.
  const { signedIn, user } = useSession()
  const { data: cart } = useCart()
  const { data: favourites } = useFavourites()
  // Renders nothing at all for a shopper with no other hat, which is almost
  // everyone — and nothing while signed out, because the query never runs.
  const { destinations } = useCapabilities()
  const isSeller = destinations.some((d) => d.id === "seller")
  // `item_count`, the field the payload actually carries. The badge read
  // `ItemCount`, which nothing sends, so it was silently always 0 — a shopper
  // with a full bag saw an empty one.
  const count = cart?.item_count ?? 0
  const saved = favouriteCount(favourites)
  const rail = categories.length ? categories.slice(0, 10) : FALLBACK_CATEGORIES
  // The avatar shows the first letter of the address until identity gives
  // the web a display name; the phone does the same.
  const initial = (user?.email ?? "").trim().charAt(0).toUpperCase()

  return (
    <header className="marketplace-header">
      <div className="market-note">
        <ShieldCheck size={13} aria-hidden="true" /> Verified sellers · Protected payments · Easy returns
      </div>
      <div className="header-main">
        {/* The lockup, LEFT of the bar as the founder decided and as the
            phone draws it: the ember M, then "Store". One component, one
            constant, so the two apps and every surface agree. */}
        <Link href="/" className="store-brand" aria-label={`${BRAND.store} home`}>
          <Wordmark app="store" />
        </Link>
        <Suspense fallback={<SearchForm initialQuery="" />}>
          <LiveSearchForm />
        </Suspense>
        <nav className="header-actions" aria-label="Account and shopping">
          <RoleSwitcher destinations={destinations} label="Switch" className="mr-1" />
          <Link
            href="/favourites"
            className="header-icon"
            aria-label={saved > 0 ? `Favourites, ${saved} saved` : "Favourites"}
          >
            <Heart size={20} aria-hidden="true" />
            {saved > 0 ? <b>{saved}</b> : null}
          </Link>
          <Link href="/bag" className="bag-action" aria-label={`Bag with ${count} ${count === 1 ? "item" : "items"}`}>
            <span><ShoppingBag size={20} aria-hidden="true" />{count > 0 && <b>{count}</b>}</span>
            <strong>Bag</strong>
          </Link>
          {signedIn ? (
            <AccountMenu initial={initial} isSeller={isSeller} />
          ) : (
            <a href="/login?redirect=%2Fshop" className="header-action" aria-label="Sign in">
              <User size={19} aria-hidden="true" /><span>Sign in</span>
            </a>
          )}
        </nav>
      </div>
      <Suspense fallback={<CategoryRailView categories={rail} />}>
        <CategoryRail categories={rail} />
      </Suspense>
    </header>
  )
}
