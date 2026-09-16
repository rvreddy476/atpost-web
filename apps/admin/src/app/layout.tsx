import type { Metadata } from "next"
import { Figtree, Outfit } from "next/font/google"
import "./globals.css"
import { BRAND, zoneTitle } from "@momentum/brand"
import { cookies } from "next/headers"
import { Providers } from "./providers"
import { AdminShell } from "@/components/shell/AdminShell"

/**
 * Outfit and Figtree, the Momentum pairing. next/font self-hosts both, so the
 * files are served from this origin and `font-src 'self'` holds.
 */
const outfit = Outfit({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-outfit", display: "swap" })
const figtree = Figtree({ subsets: ["latin"], weight: ["400", "600", "700"], variable: "--font-figtree", display: "swap" })

export const metadata: Metadata = {
  title: zoneTitle("Admin"),
  description: `${BRAND.name} admin console`,
  robots: { index: false, follow: false },
  referrer: "no-referrer",
}

/**
 * Async, and therefore dynamically rendered: middleware.ts issues a fresh CSP
 * nonce per request, which only a dynamic render can carry (reading the
 * request's cookies below keeps it dynamic explicitly).
 *
 * `mo-root` brings the ground, ink, font stack, focus ring and dark
 * color-scheme. AdminShell is a real component boundary: nothing below it
 * renders until `/v1/admin/me` has said who this admin is and what they may see.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await cookies()
  return (
    <html lang="en" className={`${outfit.variable} ${figtree.variable}`}>
      <body className="mo-root">
        <Providers>
          <AdminShell>{children}</AdminShell>
        </Providers>
      </body>
    </html>
  )
}
