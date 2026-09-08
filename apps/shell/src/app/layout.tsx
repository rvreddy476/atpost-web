import type { Metadata } from "next"
import { Figtree, Outfit } from "next/font/google"
import { BRAND, zoneTitle } from "@momentum/brand"
import { readServerSession } from "@atpost/api-client/server"
import { SessionProvider } from "@atpost/api-client/session"
import "./globals.css"

/**
 * Outfit for display, Figtree for text — the Momentum pairing, matching the
 * Android app. `next/font` self-hosts both: the files are served from this
 * origin, so there is no request to Google at runtime, no third-party read of
 * a visitor's IP on the sign-in page, and no flash of fallback text.
 *
 * Each exposes a CSS variable rather than a class, because the token sheet
 * consumes them by variable (`--mo-font-display` / `--mo-font-sans`, remapped
 * at the top of globals.css). That seam is what lets @momentum/tokens stay a
 * plain stylesheet with no idea how a zone loaded its fonts.
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
  description: `${BRAND.name} — ${BRAND.tagline}`,
}

/**
 * Async, and therefore dynamically rendered, on purpose.
 *
 * `readServerSession()` reads the request's own session cookie, so the shell
 * knows on the SERVER whether this browser is signed in and the first HTML it
 * sends is already the right one. That is what removes the signed-out flash:
 * someone who signed in on the shop five minutes ago opens the home page and
 * it says "Continue", not "Sign in" for a frame first.
 */
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { signedIn } = await readServerSession()
  return (
    <html lang="en" className={`${outfit.variable} ${figtree.variable}`}>
      <body>
        <SessionProvider initialSignedIn={signedIn}>{children}</SessionProvider>
      </body>
    </html>
  )
}
