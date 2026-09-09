import type { Metadata } from "next"
import { Figtree, Outfit } from "next/font/google"
import { BRAND, zoneTitle } from "@momentum/brand"
import { AppFrame } from "@momentum/chrome"
import { readServerSession } from "@atpost/api-client/server"
import { SessionProvider } from "@atpost/api-client/session"
import { ZONE } from "@/zone"
import "./globals.css"

/**
 * Outfit for display, Figtree for text — the Momentum pairing, matching the
 * Android app, apps/shell, apps/social and apps/reels. `next/font` self-hosts
 * both, so the files come from this origin: no runtime request to Google, no
 * third-party read of a visitor's IP, and no flash of fallback text.
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
  title: zoneTitle("Tube"),
  description: `Long video on ${BRAND.name}.`,
}

/**
 * Async, and therefore dynamically rendered, on purpose.
 *
 * `readServerSession()` reads this request's own session cookie, so the server
 * already knows whether anyone is signed in and the first HTML is the right
 * one. `GET /v1/feed/videos` is 401 for an anonymous browser — there is no
 * anonymous long-video feed at all — so without this the zone would paint a
 * grid of skeletons and replace them with a sign-in prompt a beat later.
 *
 * ── The frame is HERE, and that is the difference from apps/reels ─────────
 * apps/reels splits its chrome into a `(browse)` route group, because its two
 * surfaces disagree about wearing it: `/reels` is an ordinary page and
 * `/reels/{id}` is a full-screen takeover whose only chrome is 48px of
 * translucent bar drawn OVER the video.
 *
 * Tube has no such disagreement, and that IS the founder's distinction:
 *
 *     "When user click on expand button for reels, it plays full page as it
 *      is now. When user click on Full video expand, it ill play full video."
 *
 * A reel is watched by taking over the screen. A long video is watched in a
 * PAGE — with a title, a channel, a description and the action row under the
 * picture — and it is the expand control on that page, not the route, that
 * makes the picture fill the screen. So both `/tube` and `/tube/{postId}`
 * wear the ordinary frame, this is the only place it is mounted, and there is
 * no route group.
 *
 * `basePath` is a required prop rather than an environment read. It is what
 * marks Tube as the current destination in the strip, what makes "Sign in"
 * come back HERE rather than to the feed, and what tells the search box that
 * its results page is in another zone and must be a document navigation. See
 * @momentum/chrome's zone.ts.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { signedIn } = await readServerSession()

  return (
    <html lang="en" className={`${outfit.variable} ${figtree.variable}`}>
      {/* mo-root is the whole theme: ground, ink, font, the one focus ring,
          and color-scheme: dark so native controls and the scrollbar follow. */}
      <body className="mo-root">
        <SessionProvider initialSignedIn={signedIn}>
          <AppFrame basePath={ZONE}>{children}</AppFrame>
        </SessionProvider>
      </body>
    </html>
  )
}
