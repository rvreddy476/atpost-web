import type { Metadata } from "next"
import "./globals.css"
import { BRAND, zoneTitle } from "@momentum/brand"

export const metadata: Metadata = {
  title: zoneTitle("Miniapps"),
  description: `${BRAND.name} miniapps zone`,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
