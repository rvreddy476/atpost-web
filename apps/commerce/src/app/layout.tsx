import type { Metadata } from "next"
import { Figtree, Outfit } from "next/font/google"
import "./globals.css"
import { BRAND, zoneTitle } from "@momentum/brand"
import { readServerSession } from "@atpost/api-client/server"
import { Providers } from "./providers"

/**
 * Outfit for display, Figtree for text — the Momentum pairing, matching
 * apps/shell, apps/social and the Android app. `next/font` self-hosts both, so
 * the files come from this origin: no runtime request to Google, no
 * third-party read of a shopper's IP, and no flash of fallback text.
 *
 * The shop used to set display type in a system serif ("Iowan Old Style",
 * Palatino) chosen to make navy-and-gold read as a store. It was also the
 * loudest remaining signal that this zone was a different product — a shopper
 * moving from the feed into the shop changed typeface family mid-session.
 *
 * Each font exposes a CSS variable rather than a class, because globals.css
 * hands them to --mo-font-display / --mo-font-sans. That indirection is what
 * keeps @momentum/tokens a plain stylesheet with no knowledge of how a zone
 * loaded its fonts.
 */
const outfit = Outfit({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-outfit",
  display: "swap",
})

const figtree = Figtree({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-figtree",
  display: "swap",
})

export const metadata: Metadata = {
  title: zoneTitle("Shop"),
  description: `${BRAND.name} commerce zone`,
}

/**
 * Async, and therefore dynamically rendered, on purpose.
 *
 * `readServerSession()` reads the request's own cookie so the shop's first
 * paint already knows whether anyone is signed in. Without it the header
 * renders "Sign in", hydrates, finds the cookie and swaps to "Account" — the
 * exact flash the cookie session exists to remove. Reading a cookie opts this
 * subtree out of prerendering; for a storefront whose every page already
 * fetches its catalogue, its bag and its capabilities per request, that costs
 * nothing real.
 *
 * ── The two classes on <body> ─────────────────────────────────────────────
 *
 * `mo-root` carries the ground, the type colour, the font stack, the one focus
 * treatment and `color-scheme: dark` — the last of which is what stops the
 * browser drawing a white scrollbar down the side of a violet-black page, and
 * what makes a native <select>'s dropdown render dark instead of as a white
 * slab.
 *
 * `mo-commerce` is what brings gold into existence. @momentum/tokens declares
 * --mo-gold ONLY inside that class, so gold is available to this whole zone
 * and to nothing else in the product. Putting it on <body> rather than on a
 * checkout panel is deliberate: every page of this app is the shop, and the
 * alternative — remembering the class on each new commerce surface — fails
 * silently, by rendering a price in a colour that does not exist.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { signedIn } = await readServerSession()
  return (
    <html lang="en" className={`${outfit.variable} ${figtree.variable}`}>
      <body className="mo-root mo-commerce">
        <Providers initialSignedIn={signedIn}>{children}</Providers>
      </body>
    </html>
  )
}
