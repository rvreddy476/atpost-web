"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { LogOut, Menu, ShieldCheck, ShieldAlert, Timer } from "lucide-react"
import { BRAND } from "@momentum/brand"
import { adminSignOut, withBasePath } from "@/lib/admin/api"
import { useAdminIdentity } from "@/hooks/useAdminMe"
import type { AdminMe } from "@/lib/admin/me"
import { formatCountdown, stepUpSecondsLeft } from "@/lib/admin/stepUp"

/**
 * The product mark, as apps/shell's header draws it: the initial on the ember
 * tile at the 19px bold floor ember requires, with the red end as the solid
 * fallback under the gradient. Replaces the old "VC" square.
 */
export function ProductMark() {
  return (
    <Link href="/" aria-label={`${BRAND.name} admin overview`} className="flex shrink-0 items-center gap-2">
      <span
        aria-hidden="true"
        className="grid h-9 w-9 place-items-center rounded-mo-sm bg-mo-primary bg-mo-ember text-mo-ember-label font-bold text-mo-on-primary shadow-mo-ember"
      >
        {BRAND.initial}
      </span>
      <span className="font-mo-display text-lg font-semibold tracking-mo-display text-mo-ink">
        {BRAND.name} <span className="text-mo-body">Admin</span>
      </span>
    </Link>
  )
}

/** Ticks once a second while a step-up window is open; renders nothing otherwise. */
export function StepUpCountdown({ validUntil }: { validUntil: number | null }) {
  const [now, setNow] = useState(() => Date.now())
  const left = stepUpSecondsLeft(validUntil, now)

  useEffect(() => {
    if (validUntil === null) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [validUntil])

  if (left <= 0) return null
  return (
    <span
      role="timer"
      aria-label={`Step-up confirmed for ${formatCountdown(left)} more`}
      className="inline-flex items-center gap-1 rounded-mo-pill border border-mo-strong px-2.5 py-1 font-mo-mono text-xs text-mo-good"
    >
      <Timer className="h-3.5 w-3.5" aria-hidden="true" />
      Step-up {formatCountdown(left)}
    </span>
  )
}

export function TopBar({ me, onToggleNav }: { me: AdminMe; onToggleNav: () => void }) {
  const { data: email } = useAdminIdentity()
  const identity = email ?? me.userId

  return (
    <header className="sticky top-0 z-40 border-b border-mo bg-mo-bg/95 backdrop-blur">
      <div className="flex h-14 items-center gap-3 px-4">
        <button
          type="button"
          onClick={onToggleNav}
          aria-label="Toggle navigation"
          className="rounded-mo-sm p-2 text-mo-body hover:bg-mo-raised hover:text-mo-ink lg:hidden"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>
        <ProductMark />
        <div className="ml-auto flex items-center gap-2 text-sm">
          <StepUpCountdown validUntil={me.stepUpValidUntil} />
          {me.mfa.verified ? (
            <span className="hidden items-center gap-1 rounded-mo-pill border border-mo px-2.5 py-1 text-xs text-mo-good sm:inline-flex">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> 2FA verified
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-mo-pill border border-mo px-2.5 py-1 text-xs text-mo-warn">
              <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" /> 2FA required
            </span>
          )}
          <span className="hidden max-w-[16rem] truncate text-mo-body md:inline" title={identity} data-testid="admin-identity">
            {identity}
          </span>
          <button
            type="button"
            onClick={() => void adminSignOut().then(() => window.location.assign(withBasePath("/login")))}
            className="inline-flex items-center gap-1 rounded-mo-sm px-2 py-1.5 text-mo-body hover:bg-mo-raised hover:text-mo-ink"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </div>
    </header>
  )
}
