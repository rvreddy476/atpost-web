import type { Metadata } from "next"
import { Figtree, Outfit } from "next/font/google"
import { BRAND } from "@momentum/brand"
import { readServerSession } from "@atpost/api-client/server"
import { SessionProvider } from "@atpost/api-client/session"
import { TubeFrame } from "@/chrome/TubeFrame"
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

/**
 * The title is the APP's name, not "Tube — Momentum".
 *
 * `zoneTitle("Tube")` produced the latter, which is the right shape for a
 * SURFACE of a product — it is what /shop and /social and /reels use, and it
 * reads as "one of Momentum's pages". This app is not one of those:
 *
 *     "it's a completely isolated application from the feed. It's Momentum
 *      Tube."
 *
 * So the browser tab says the app's own name. It is also what somebody
 * bookmarking a channel or a video should find in their bookmark bar a week
 * later.
 */
export const metadata: Metadata = {
  title: {
    default: `${BRAND.name} Tube`,
    template: `%s — ${BRAND.name} Tube`,
  },
  description: `Long video on ${BRAND.name}.`,
}

/**
 * Async, and therefore dynamically rendered, on purpose.
 *
 * `readServerSession()` reads this request's own session cookie, so the server
 * already knows whether anyone is signed in and the first HTML is the right
 * one. It matters more here than it looks: the two feeds this app can read are
 * DIFFERENT ENDPOINTS depending on the answer — `GET /v1/feed/videos` is 401
 * for an anonymous browser, and the public shelf behind
 * `GET /v1/posts/recent?content_type=long_video` is what a signed-out visitor
 * sees instead. Without the cookie read the home page would fetch the wrong
 * one, get a 401, and then fetch the other.
 *
 * ── The frame is HERE, and it is TUBE'S OWN ──────────────────────────────
 * What stood here was `<AppFrame basePath={ZONE}>` — @momentum/chrome, the
 * frame /social and /reels wear. This one line is the whole of what the
 * founder rejected: Tube shipped looking like a tab of the feed.
 *
 *     "it's a completely isolated application from the feed. It's Momentum
 *      Tube. So it should be completely isolated. It did open like in YouTube
 *      completely — channel, subscriptions, settings at the left side, and
 *      videos."
 *
 * `TubeFrame` is that shell: Tube's own top bar, Tube's own left rail with
 * the viewer's subscribed channels in it, and one wide content track instead
 * of the shared frame's 600px centre column. ../chrome/TubeFrame.tsx has the
 * argument in full, including why the shared frame could not simply be
 * parameterised — its 600px centre is a promise it keeps for the two zones
 * that do want it.
 *
 * It takes no `basePath`. @momentum/chrome needs one because it draws links
 * into five zones and has to be TOLD which it is in; this shell's links are
 * either its own routes (where `next/link` adds the basePath itself) or the
 * three absolute paths in ../chrome/links.ts. There is nothing left for a
 * prop to disambiguate.
 *
 * Tube still has no route group, and that part is unchanged: apps/reels needs
 * one because `/reels/{id}` is a full-screen takeover that refuses the frame,
 * while every surface here — the grid, subscriptions, a channel, the watch
 * page — is an ordinary page inside the shell. The expand control on the
 * watch page, not the route, is what makes a picture fill the screen.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { signedIn } = await readServerSession()

  return (
    <html lang="en" className={`${outfit.variable} ${figtree.variable}`}>
      {/* mo-root is the whole theme: ground, ink, font, the one focus ring,
          and color-scheme: dark so native controls and the scrollbar follow. */}
      <body className="mo-root">
        <SessionProvider initialSignedIn={signedIn}>
          <TubeFrame>{children}</TubeFrame>
        </SessionProvider>
      </body>
    </html>
  )
}
