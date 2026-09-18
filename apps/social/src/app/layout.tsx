import type { Metadata } from "next"
import { Figtree, Outfit } from "next/font/google"
import { BRAND, zoneTitle } from "@momentum/brand"
import { readServerSession } from "@atpost/api-client/server"
import { SessionProvider } from "@atpost/api-client/session"
import { AppFrame } from "@momentum/chrome"
import "./globals.css"

/**
 * Outfit for display, Figtree for text — the Momentum pairing, matching the
 * Android app and apps/shell. `next/font` self-hosts both, so the files come
 * from this origin: no runtime request to Google, no third-party read of a
 * visitor's IP, and no flash of fallback text.
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
  title: zoneTitle(),
  description: `What is happening now, across ${BRAND.name}.`,
}

/**
 * Async, and therefore dynamically rendered, on purpose.
 *
 * `readServerSession()` reads this request's own session cookie, so the server
 * already knows whether anyone is signed in and the first HTML is the right
 * one. `GET /v1/feed/home` is 401 for an anonymous browser, so without this
 * the front door would render a feed shell and then replace it with a sign-in
 * prompt a beat later — exactly the flash the session provider exists to
 * remove.
 *
 * The chrome lives here rather than on the page for the same reason: the
 * header and the two rails are the same on every route this zone will ever
 * serve, and a layout that already knows whether anyone is signed in is
 * exactly where a header that renders differently for the two should be
 * mounted. `AppFrame` is the one client component in the tree; the page under
 * it stays a mount point.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { signedIn } = await readServerSession()

  return (
    <html lang="en" className={`${outfit.variable} ${figtree.variable}`}>
      {/*
        Two classes, on ONE element, in this order — the first of the three
        orders tokens.css documents, and the one it calls the usual case.

        `mo-root` is the theme's machinery: ground, ink, font, the one focus
        treatment, and `color-scheme`. `mo-light` is the vocabulary those
        resolve through — a white page, GREEN for anything pressable, ORANGE
        for unread marks, "new"/"live" pills, count bubbles and the active
        tab's rule.

        Both on the same element matters for one declaration that is NOT a
        custom property. `.mo-root` sets `color-scheme: dark` literally, and a
        literal does not follow the tokens: without `mo-light` here this zone
        would render a perfect white page and then hand the reader a black
        scrollbar, black autofill and a black date picker. tokens.css's
        `.mo-root.mo-light` selector is 0-2-0 and beats `.mo-root` from
        anywhere in the file, which is what makes this order safe.

        It is a SCOPE, not a mode. :root is untouched and the package has no
        prefers-color-scheme query anywhere, so MShorts, MTube, Kwit and the
        shell keep the violet-black ground because they do not carry this
        class. The consequence for everything under it: @momentum/chrome,
        /content, /interactions and /player are rendered in BOTH themes on the
        same day and may not assume either one.
      */}
      <body className="mo-root mo-light">
        <SessionProvider initialSignedIn={signedIn}>
          <AppFrame basePath="/social">{children}</AppFrame>
        </SessionProvider>
      </body>
    </html>
  )
}
