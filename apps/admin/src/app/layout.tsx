import type { Metadata } from "next"
import localFont from "next/font/local"
import "./globals.css"
import "./admin-theme.css"
import { cookies } from "next/headers"
import { Providers } from "./providers"
import { AdminShell } from "@/components/shell/AdminShell"

/**
 * Outfit and Figtree, the Momentum pairing. Keep the existing self-hosted
 * Latin assets locally so deployments do not depend on Google Fonts responses.
 * Both are served from this origin and `font-src 'self'` holds.
 */
const outfit = localFont({ src: "./fonts/outfit-latin.woff2", weight: "100 900", variable: "--font-outfit", display: "swap" })
const figtree = localFont({ src: "./fonts/figtree-latin.woff2", weight: "300 900", variable: "--font-figtree", display: "swap" })

export const metadata: Metadata = {
  title: "Cleestudio Admin Portal",
  description: "Cleestudio administration and operations",
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
