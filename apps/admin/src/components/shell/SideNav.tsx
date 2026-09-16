"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Banknote,
  Bike,
  CreditCard,
  Film,
  Gauge,
  Heart,
  History,
  Inbox,
  KeyRound,
  LayoutDashboard,
  MessageCircle,
  MessagesSquare,
  Server,
  ShieldAlert,
  ShoppingBag,
  Users,
  UtensilsCrossed,
  Wallet,
  type LucideIcon,
} from "lucide-react"
import type { AdminAppId } from "@/lib/admin/apps"
import type { AdminNavModel } from "@/lib/admin/me"

const APP_ICONS: Record<AdminAppId, LucideIcon> = {
  dating: Heart,
  food: UtensilsCrossed,
  commerce: ShoppingBag,
  monetization: Banknote,
  payments: CreditCard,
  wallet: Wallet,
  social: Users,
  tube: Film,
  qa: MessagesSquare,
  chat: MessageCircle,
  rider: Bike,
  trust_safety: ShieldAlert,
  platform: Server,
}

const CONSOLE_ICONS: Record<string, LucideIcon> = { approvals: Inbox, access: KeyRound, audit: History }

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`)
}

const linkClass = (active: boolean) =>
  [
    "flex items-center gap-2 rounded-mo-sm px-3 py-1.5 text-sm",
    active ? "bg-mo-raised font-semibold text-mo-ink" : "text-mo-body hover:bg-mo-raised/60 hover:text-mo-ink",
  ].join(" ")

/**
 * The left rail. It renders exactly the model it is given — which
 * `buildAdminNav` builds from `/v1/admin/me` and nothing else — so an app the
 * admin holds no permission for has no link here to click.
 */
export function SideNav({ nav, onNavigate }: { nav: AdminNavModel; onNavigate?: () => void }) {
  const pathname = usePathname()

  return (
    <nav aria-label="Admin" className="flex flex-col gap-4 p-3">
      <Link href="/" onClick={onNavigate} className={linkClass(pathname === "/")} aria-current={pathname === "/" ? "page" : undefined}>
        <LayoutDashboard className="h-4 w-4" aria-hidden="true" /> Overview
      </Link>

      {nav.apps.length > 0 ? (
        <div>
          <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-mo-eyebrow text-mo-body">Applications</p>
          <ul className="space-y-0.5">
            {nav.apps.map((group) => {
              const Icon = APP_ICONS[group.app] ?? Gauge
              const groupActive =
                isActive(pathname, group.href) || group.links.some((link) => isActive(pathname, link.href))
              return (
                <li key={group.app}>
                  <Link
                    href={group.href}
                    onClick={onNavigate}
                    className={linkClass(isActive(pathname, group.href) && pathname === group.href)}
                    aria-current={pathname === group.href ? "page" : undefined}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" /> {group.label}
                  </Link>
                  {groupActive && group.links.length > 0 ? (
                    <ul className="ml-6 mt-0.5 space-y-0.5 border-l border-mo pl-2">
                      {group.links.map((link) => (
                        <li key={link.id}>
                          <Link
                            href={link.href}
                            onClick={onNavigate}
                            className={linkClass(isActive(pathname, link.href))}
                            aria-current={isActive(pathname, link.href) ? "page" : undefined}
                          >
                            {link.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}

      {nav.console.length > 0 ? (
        <div>
          <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-mo-eyebrow text-mo-body">Console</p>
          <ul className="space-y-0.5">
            {nav.console.map((link) => {
              const Icon = CONSOLE_ICONS[link.id] ?? Gauge
              return (
                <li key={link.id}>
                  <Link
                    href={link.href}
                    onClick={onNavigate}
                    className={linkClass(isActive(pathname, link.href))}
                    aria-current={isActive(pathname, link.href) ? "page" : undefined}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" /> {link.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
    </nav>
  )
}
