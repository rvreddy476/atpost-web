"use client"

/**
 * You, inside Tube: your channel, your settings, the way back, and the way out.
 *
 * Modelled on @momentum/chrome's ProfileMenu rather than importing it, for the
 * reason the whole of this directory exists: that one is the social chrome's,
 * its rows are the product's, and the founder asked for Tube to stop wearing
 * the product's chrome. The DECISIONS in it are carried over intact, and they
 * are worth restating because each was paid for:
 *
 *   · Sign-out is the real thing. `useSession().signOut()` is
 *     `POST /v1/auth/logout`, which revokes the refresh token server-side and
 *     expires all three cookies with `MaxAge: -1`; the zone's proxy forwards
 *     those Set-Cookie headers verbatim, cookies ignore the port, so the
 *     session ends on :3000, :3001, :3004, :3011 and :3012 in one response.
 *   · Then a full page load, deliberately. /login is served by the SHELL, a
 *     different Next app behind a rewrite, so `router.push` would ask this
 *     zone for a route it does not have.
 *   · Closed with `hidden` rather than unmounted: out of the accessibility
 *     tree, out of the focus order, out of find-in-page, markup stable.
 *   · A disabled row is `aria-disabled` and focusable, never `disabled`.
 *   · Disabled rows here are --mo-body and NOT --mo-muted-lg. This panel sits
 *     on --mo-overlay, where muted-lg measures 2.30 — worse than the 2.61
 *     tokens.css already rules out on --mo-raised. The recession is carried
 *     by weight and by the reason underneath instead.
 *
 * ── "Back to Momentum" appears here AND in the rail ───────────────────────
 * A deliberate second copy, and the only duplicated destination in this
 * shell. ./rail.ts argues at length that the rail's last row is the right
 * home for the exit; this copy exists because of where people LOOK. Somebody
 * who has decided they are done with video does not go hunting down a
 * navigation rail — they go to the control that represents "me and my
 * account", which is this one, and it is the control that is in the same
 * place at every window width. One clear control, in the place the founder
 * meant, plus one where the reflex sends people.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react"
import Link from "next/link"
import { ArrowLeft, LogOut, Settings, Tv } from "lucide-react"
import { BRAND } from "@momentum/brand"
import { useSession } from "@atpost/api-client/session"
import { Avatar } from "@momentum/content"
import { channelHref } from "@/tube/channels"
import { HOME_PATH, TUBE_APP_ONLY_REASON } from "./links"

export function TubeProfileMenu({
  displayName,
  ownChannelRef,
  signInHref,
}: {
  displayName?: string | null
  /** The viewer's own channel handle or id, or null when they have none. */
  ownChannelRef: string | null
  signInHref: string
}) {
  const { user, signOut } = useSession()
  const baseId = useId()
  const menuId = `${baseId}-menu`
  const triggerId = `${baseId}-trigger`
  const settingsReasonId = `${baseId}-settings-why`
  const channelReasonId = `${baseId}-channel-why`

  const [open, setOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const firstItemRef = useRef<HTMLElement>(null)

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false)
    if (returnFocus) triggerRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) close(false)
    }
    document.addEventListener("mousedown", onPointerDown)
    document.addEventListener("touchstart", onPointerDown)
    return () => {
      document.removeEventListener("mousedown", onPointerDown)
      document.removeEventListener("touchstart", onPointerDown)
    }
  }, [open, close])

  // Focus lands on the first row when the menu opens, so a keyboard user is
  // inside the thing they just opened. Never while closed: moving focus into a
  // `hidden` subtree is what makes a menu trap someone.
  useEffect(() => {
    if (open) firstItemRef.current?.focus()
  }, [open])

  const onSignOut = useCallback(async () => {
    if (signingOut) return
    setSigningOut(true)
    try {
      await signOut()
    } finally {
      // Unconditional. `signOut` swallows a transport failure on purpose — the
      // local cookie and the broadcast happen either way — so there is no
      // outcome in which staying on a Tube this browser can no longer load is
      // the right answer.
      window.location.assign(signInHref)
    }
  }, [signInHref, signOut, signingOut])

  const name = displayName || user?.email || "Your account"
  const row =
    "flex w-full items-center gap-3 rounded-mo-sm px-3 py-2.5 text-left text-sm transition-colors duration-150 ease-mo"

  return (
    <div ref={wrapperRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        id={triggerId}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label="Your account"
        onClick={() => (open ? close(false) : setOpen(true))}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault()
            setOpen(true)
          } else if (event.key === "Escape" && open) {
            event.preventDefault()
            close(true)
          }
        }}
        className="grid h-10 w-10 place-items-center rounded-mo-pill text-mo-body transition-colors duration-150 ease-mo hover:bg-mo-surface hover:text-mo-ink"
      >
        <Avatar name={displayName ?? undefined} id={user?.id} size="sm" />
      </button>

      <div
        hidden={!open}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault()
            close(true)
          } else if (event.key === "Tab") {
            close(false)
          }
        }}
        className="absolute right-0 z-50 mt-2 w-72 overflow-hidden rounded-mo border border-mo bg-mo-overlay p-1 shadow-mo-lift"
      >
        <div className="border-b border-mo px-3 pb-3 pt-2">
          <p className="truncate font-semibold text-mo-ink">{name}</p>
          {user?.email && <p className="truncate text-xs text-mo-body">{user.email}</p>}
        </div>

        <div id={menuId} role="menu" aria-labelledby={triggerId} className="pt-1">
          {ownChannelRef ? (
            <Link
              ref={firstItemRef as React.Ref<HTMLAnchorElement>}
              role="menuitem"
              href={channelHref(ownChannelRef)}
              onClick={() => close(false)}
              className={`${row} font-semibold text-mo-ink hover:bg-mo-raised focus-visible:bg-mo-raised focus-visible:outline-none`}
            >
              <Tv aria-hidden="true" className="h-4 w-4 shrink-0 text-mo-body" />
              Your channel
            </Link>
          ) : (
            <div
              ref={firstItemRef as React.Ref<HTMLDivElement>}
              role="menuitem"
              aria-disabled="true"
              tabIndex={0}
              aria-describedby={channelReasonId}
              className={`${row} cursor-default focus-visible:bg-mo-raised focus-visible:outline-none`}
            >
              <Tv aria-hidden="true" className="h-4 w-4 shrink-0 text-mo-body" />
              <span className="min-w-0">
                <span className="block font-semibold text-mo-body">Your channel</span>
                <span id={channelReasonId} className="block text-xs leading-snug text-mo-body">
                  A long video is published by a channel. You have not made one yet.
                </span>
              </span>
            </div>
          )}

          <div
            role="menuitem"
            aria-disabled="true"
            tabIndex={0}
            aria-describedby={settingsReasonId}
            className={`${row} cursor-default focus-visible:bg-mo-raised focus-visible:outline-none`}
          >
            <Settings aria-hidden="true" className="h-4 w-4 shrink-0 text-mo-body" />
            <span className="min-w-0">
              <span className="block font-semibold text-mo-body">Settings</span>
              <span id={settingsReasonId} className="block text-xs leading-snug text-mo-body">
                {TUBE_APP_ONLY_REASON}
              </span>
            </span>
          </div>

          {/* A plain <a> and an absolute path: /social is a different Next app
              behind the shell's rewrite table, and next/link would prefix this
              zone's basePath and ask for /tube/social. */}
          <a
            role="menuitem"
            href={HOME_PATH}
            className={`${row} font-semibold text-mo-ink hover:bg-mo-raised focus-visible:bg-mo-raised focus-visible:outline-none`}
          >
            <ArrowLeft aria-hidden="true" className="h-4 w-4 shrink-0 text-mo-body" />
            Back to {BRAND.name}
          </a>

          <button
            type="button"
            role="menuitem"
            onClick={() => void onSignOut()}
            disabled={signingOut}
            className={`${row} mt-1 border-t border-mo pt-3 font-semibold text-mo-ink hover:bg-mo-raised focus-visible:bg-mo-raised focus-visible:outline-none disabled:cursor-wait disabled:text-mo-body`}
          >
            <LogOut aria-hidden="true" className="h-4 w-4 shrink-0 text-mo-body" />
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </div>
    </div>
  )
}
