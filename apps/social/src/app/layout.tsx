import type { Metadata } from "next"
import { Figtree, Outfit } from "next/font/google"
import { readServerSession } from "@atpost/api-client/server"
import { SessionProvider } from "@atpost/api-client/session"
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
  title: "Momentum",
  description: "What is happening now, across Momentum.",
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
