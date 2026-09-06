import Link from "next/link"

/**
 * The quiet end of every shop page. A store that just stops after the last
 * product card reads unfinished; a sunken navy band with a hairline gives the
 * page a floor and somewhere to put the secondary links.
 */
export function StoreFooter() {
  return (
    <footer className="shop-footer">
      <div className="shop-footer-inner">
        <small>© {new Date().getFullYear()} atPost Shop · Prices include applicable taxes</small>
        <nav aria-label="Store links">
          <Link href="/">All products</Link>
          <Link href="/orders">Your orders</Link>
          <Link href="/cart">Your bag</Link>
          <Link href="/sell">Sell on atPost</Link>
        </nav>
      </div>
    </footer>
  )
}
