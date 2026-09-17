"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Bookmark, Hash, Home, Settings } from "lucide-react"
import { useSession } from "@atpost/api-client/session"

/**
 * Ask's own section strip, under the shared frame's header: Home, Topics,
 * Mine and Settings. `usePathname()` is basePath-relative, and `next/link`
 * adds the basePath, so every href here is zone-relative.
 */
const ITEMS = [
  { href: "/", label: "Home", icon: Home, match: (p: string) => p === "/" || p.startsWith("/questions") || p.startsWith("/search") },
  { href: "/topics", label: "Topics", icon: Hash, match: (p: string) => p.startsWith("/topics") },
  { href: "/me", label: "Mine", icon: Bookmark, match: (p: string) => p.startsWith("/me"), session: true },
  { href: "/settings", label: "Settings", icon: Settings, match: (p: string) => p.startsWith("/settings"), session: true },
] as const

export function AskNav() {
  const pathname = usePathname() ?? "/"
  const { signedOut } = useSession()

  return (
    <nav aria-label="Ask" className="mb-5">
      <p className="mb-2 font-mo-display text-2xl font-semibold tracking-mo-display text-mo-ink">Ask</p>
      <ul className="flex gap-1 overflow-x-auto border-b border-mo">
        {ITEMS.filter((item) => !("session" in item && item.session && signedOut)).map((item) => {
          const active = item.match(pathname)
          const Icon = item.icon
          return (
            <li key={item.href} className="shrink-0">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={[
                  "-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-semibold transition-colors duration-150 ease-mo",
                  active ? "border-mo-cyan text-mo-ink" : "border-transparent text-mo-body hover:text-mo-ink",
                ].join(" ")}
              >
                <Icon aria-hidden="true" className="h-4 w-4" />
                {item.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
