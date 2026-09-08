import type { Metadata } from "next"
import "./globals.css"
import { readServerSession } from "@atpost/api-client/server"
import { Providers } from "./providers"
import { AdminNav } from "@/components/AdminNav"
import { AdminGate } from "@/components/AdminGate"

export const metadata: Metadata = {
  title: "atPost — Admin",
  description: "atPost admin zone",
}

/**
 * Async, and therefore dynamically rendered: it reads the request's session
 * cookie so the gate below starts from the right verdict. An admin console has
 * no public pages to prerender anyway.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { signedIn } = await readServerSession()
  return (
    <html lang="en">
      <body className="bg-gray-50">
        {/* Providers also mounts ToastProvider: until now an admin mutation
            that failed did so in silence, which a taxonomy editor cannot
            afford. AdminGate is a real component boundary — the nav and every
            screen are simply not rendered for a caller the API refuses, rather
            than hidden with a class. */}
        <Providers initialSignedIn={signedIn}>
          <AdminGate>
            <AdminNav />
            <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
          </AdminGate>
        </Providers>
      </body>
    </html>
  )
}
