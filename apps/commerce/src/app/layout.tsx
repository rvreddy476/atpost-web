import type { Metadata } from "next"
import "./globals.css"
import { readServerSession } from "@atpost/api-client/server"
import { Providers } from "./providers"

export const metadata: Metadata = {
  title: "atPost — Shop",
  description: "atPost commerce zone",
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
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { signedIn } = await readServerSession()
  return (
    <html lang="en">
      <body>
        <Providers initialSignedIn={signedIn}>{children}</Providers>
      </body>
    </html>
  )
}
