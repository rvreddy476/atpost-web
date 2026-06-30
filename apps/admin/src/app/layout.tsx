import type { Metadata } from "next"
import "./globals.css"
import { Providers } from "./providers"
import { AdminNav } from "@/components/AdminNav"

export const metadata: Metadata = {
  title: "atPost — Admin",
  description: "atPost admin zone",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50">
        <Providers>
          <AdminNav />
          <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
        </Providers>
      </body>
    </html>
  )
}
