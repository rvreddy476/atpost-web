import type { Metadata } from "next"
import { Figtree, Outfit } from "next/font/google"
import { BRAND, zoneTitle } from "@momentum/brand"
import { readServerSession } from "@atpost/api-client/server"
import { SessionProvider } from "@atpost/api-client/session"
import "./globals.css"

/**
 * Outfit for display, Figtree for text — the Momentum pairing, matching the
 * Android app, apps/shell and apps/social. `next/font` self-hosts both, so the
 * files come from this origin: no runtime request to Google, no third-party
 * read of a visitor's IP, and no flash of fallback text.
 *
 * Each exposes a CSS variable rather than a class because globals.css hands
 * them to --mo-font-display / --mo-font-sans. That indirection is what keeps
 * @momentum/tokens a plain stylesheet with no knowledge of how fonts arrive.
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
  title: zoneTitle("Reels"),
  description: `Short video on ${BRAND.name}.`,
}

/**
 * Async, and therefore dynamically rendered, on purpose.
 *
 * `readServerSession()` reads this request's own session cookie, so the server
 * already knows whether anyone is signed in and the first HTML is the right
 * one. `GET /v1/feed/reels` is 401 for an anonymous browser, so without this
 * the zone would paint a black full-screen scroller and then replace it with a
 * sign-in prompt a beat later — worse here than on a feed, because the thing
 * it paints first is an empty black rectangle.
 *
 * ── No AppFrame HERE, and that is the point of the split ──────────────────
 * apps/social mounts the header and both rails in its ROOT layout, because
 * every route it serves has them. This zone serves two surfaces that do not
 * agree about that:
 *
 *   /reels        the browse page, which wears the ordinary frame — mounted in
 *                 src/app/(browse)/layout.tsx, a route GROUP, so it gains a
 *                 layout without gaining a path segment.
 *   /reels/{id}   the immersive viewer, whose entire chrome is 48 pixels of
 *                 translucent bar drawn OVER the reel, because a full-screen
 *                 video surface whose chrome takes layout is not full-screen.
 *
 * So this file holds only what both need and neither should have twice: the
 * document, the fonts, and the session.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { signedIn } = await readServerSession()

  return (
    <html lang="en" className={`${outfit.variable} ${figtree.variable}`}>
      {/* mo-root is the whole theme: ground, ink, font, the one focus ring,
          and color-scheme: dark so native controls and the scrollbar follow. */}
      <body className="mo-root">
        <SessionProvider initialSignedIn={signedIn}>{children}</SessionProvider>
      </body>
    </html>
  )
}
