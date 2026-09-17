import type { Metadata } from "next"
import { Figtree, Outfit } from "next/font/google"
import { BRAND, zoneTitle } from "@momentum/brand"
import { readServerSession } from "@atpost/api-client/server"
import { AppFrame } from "@momentum/chrome"
import { ZONE } from "@/zone"
import { AskNav } from "@/chrome/AskNav"
import { Providers } from "./providers"
import "./globals.css"

/** Outfit for display, Figtree for text — the Momentum pairing, self-hosted by next/font. */
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
  title: {
    default: zoneTitle("Ask"),
    template: `%s — ${zoneTitle("Ask")}`,
  },
  description: `Questions and answers on ${BRAND.name}.`,
}

/**
 * Async so `readServerSession()` can read this request's session cookie: the
 * first HTML already knows whether the reader is signed in, which decides the
 * home tabs and whether composers or sign-in prompts are drawn.
 *
 * Every qa-service read happens in the browser (React Query in client
 * components), never during server rendering — the proxy, the session refresh
 * and the gateway's dormant gate all behave the same for every call that way.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { signedIn } = await readServerSession()

  return (
    <html lang="en" className={`${outfit.variable} ${figtree.variable}`}>
      <body className="mo-root">
        <Providers initialSignedIn={signedIn}>
          <AppFrame basePath={ZONE}>
            <AskNav />
            {children}
          </AppFrame>
        </Providers>
      </body>
    </html>
  )
}
