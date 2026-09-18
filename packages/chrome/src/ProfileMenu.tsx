"use client"

/**
 * Me, my settings, and the way out.
 *
 * The founder asked for these three together — "profile icon, logout and
 * profile settings as in the mobile" — and together is where they belong: a
 * bar with a loose "Sign out" in it is a bar with a destructive action one
 * mis-aimed click away, and the mobile client does not have one either.
 *
 * ── Sign-out is the real thing, and that was checked ──────────────────────
 * `useSession().signOut()` calls `@atpost/api-client`'s `signOut`, which is
 * `POST /v1/auth/logout` and NOT a local state reset:
 *
 *   · auth-service's `Logout` reads the refresh_token COOKIE (the browser
 *     cannot send it in a body — it is HttpOnly) and revokes the session
 *     server-side, then `clearAuthCookies` expires all three cookies with
 *     `MaxAge: -1`.
 *   · The zone's own proxy forwards those Set-Cookie headers back verbatim —
 *     `forwardSetCookies` in packages/api-client/src/proxy.ts, and it does so
 *     on non-2xx responses too, precisely for this path.
 *   · Cookies ignore the port, so the browser loses the session for :3000,
 *     :3001, :3002, :3004 and :3010 in one response. This is the same
 *     mechanism that made the sign-in cross zones in the first place.
 *   · `notifySessionChanged()` then writes the broadcast key, so every other
 *     open tab re-reads the cookie and agrees within a frame rather than at
 *     its next focus.
 *
 * The CSRF double-submit is satisfied without anything here doing it: the
 * client's request interceptor echoes the `csrf_token` cookie into
 * `X-CSRF-Token` on every write.
 *
 * ── Then a full page load, deliberately ───────────────────────────────────
 * Not `router.push`. /login is served by the SHELL, a different Next app
 * behind a rewrite, so a client transition would ask this zone for a route it
 * does not have. `?redirect=<basePath>` brings the person back to the zone
 * they signed out OF — the feed from /social, Reels from /reels — and it
 * survives the shell's allowlist by construction: `moduleHomes` in
 * apps/shell/src/lib/moduleRedirect.ts is the same five prefixes the rewrite
 * table carries, so a zone that can be reached at all is on it.
 *
 * ── Profile and Settings are not links ────────────────────────────────────
 * There is no /me and no /settings zone — the shell's rewrite table has five
 * entries and neither is among them. Same treatment, same reason, same prior
 * art as every other web-less destination here: present, named, focusable,
 * `aria-disabled`, and honest about why.
 *
 * ── Why they are NOT --mo-muted-lg, unlike the rail's disabled rows ───────
 * This panel sits on --mo-overlay, and in the DARK scope that is #332F55,
 * where #6B658A measures 2.30 — worse than the 2.61 tokens.css already rules
 * out on --mo-raised. That colour's whole contract is "large text and
 * non-text, on --mo-bg", and a popover is not --mo-bg. WCAG 1.4.3 does exempt
 * the label of a disabled control, but the exemption is a licence rather than
 * an instruction, and 2.30 is unreadable rather than merely quiet.
 *
 * Under `.mo-light` the same argument reaches the same answer by a different
 * route. --mo-overlay is #FFFFFF there, so --mo-muted-lg would be 3.93 — not
 * unreadable, and still not 4.5 at any size. One rule for both scopes, and it
 * is the stricter one, because a component in this package is rendered in both
 * on the same day.
 *
 * So the recession is carried by WEIGHT and by the reason underneath rather
 * than by a colour that cannot survive the ground:
 *
 *   dark   --mo-body #A19CB9 on #332F55 overlay ...  4.74  AA
 *          --mo-ink  #F1EEF8 on #332F55 overlay ... 10.91  AAA
 *   light  --mo-body #46554D on #FFFFFF overlay ...  7.87  AAA
 *          --mo-ink  #0F1A14 on #FFFFFF overlay ... 17.82  AAA
 *
 * The live "Sign out" row keeps --mo-ink in both, so the difference between a
 * row that works and a row that does not is obvious at a glance either way.
 * (The old note said 4.75 and 10.92 for the dark pair; the figures above came
 * out of the same script that produced tokens.css, which truncates.)
 *
 * ── The panel needs its border in a light zone, not merely likes it ───────
 * `bg-mo-overlay` is #FFFFFF under `.mo-light` and so is the page behind it.
 * The `border border-mo` and `shadow-mo-lift` on the panel below are what make
 * it a popover rather than a column of text floating over the header; the rule
 * is tokens.css's, and this is one of the places it bites.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react"
import { CircleUser, LogOut, Settings } from "lucide-react"
import { useSession } from "@atpost/api-client/session"
import { Avatar, avatarSrc } from "@momentum/content"
import { APP_ONLY_REASON } from "./destinations"
import { signInHref } from "./zone"

export function ProfileMenu({
  basePath,
  displayName,
  avatarMediaId,
}: {
  /**
   * The zone this menu is drawn in.
   *
   * Where a signed-out browser is sent, and how it gets back. This used to be
   * a frozen `/login?redirect=%2Fsocial`, which was correct while the chrome
   * existed in one zone only; signing out of Reels and being returned to the
   * feed is a small lie about where somebody was.
   */
  basePath: string
  displayName?: string | null
  /** The viewer's avatar asset id, from `/v1/profiles/me`. Not a URL. */
  avatarMediaId?: string | null
}) {
  const { user, signOut } = useSession()
  const baseId = useId()
  const menuId = `${baseId}-menu`
  const triggerId = `${baseId}-trigger`
  const profileReasonId = `${baseId}-profile-why`
  const settingsReasonId = `${baseId}-settings-why`

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
      // Unconditional. `signOut` swallows a transport failure on purpose —
      // the local cookie and the broadcast happen either way — so there is no
      // outcome in which staying on a feed this browser can no longer load is
      // the right answer.
      window.location.assign(signInHref(basePath))
    }
  }, [basePath, signOut, signingOut])

  const name = displayName || user?.email || "Your account"
  const row =
    "flex min-h-[44px] w-full items-center gap-3 rounded-mo-sm px-3 py-2.5 text-left text-sm transition-colors duration-150 ease-mo"

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
        // `hover:bg-mo-raised`, not `--mo-surface`: a surface is the page's own
        // white inside `.mo-light`, so the hover state did not exist there.
        // --mo-raised is 1.36 against the dark ground and 1.10 against the
        // white one — faint on purpose, and present in both.
        //
        // 44px, because this is the account menu's only trigger.
        className="grid h-11 w-11 shrink-0 place-items-center rounded-mo-pill text-mo-body transition-colors duration-150 ease-mo hover:bg-mo-raised hover:text-mo-ink"
      >
        {/* The same Avatar the cards use, and now the same picture. The note
            that stood here said `avatar_media_id` could not become a usable
            URL; `/v1/media/{id}/serve/avatar` is the one it missed. Initials
            remain the fallback for an account with no photograph. */}
        <Avatar
          name={displayName ?? undefined}
          id={user?.id}
          src={avatarSrc({ mediaId: avatarMediaId }, basePath)}
          size="sm"
        />
      </button>

      {/* Closed with `hidden` rather than unmounted: out of the a11y tree, out
          of the focus order, out of find-in-page — and the markup stays
          stable, which is what keeps the whole control renderable. */}
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
          {user?.email && (
            <p className="truncate text-xs text-mo-body">{user.email}</p>
          )}
        </div>

        <div id={menuId} role="menu" aria-labelledby={triggerId} className="pt-1">
          <div
            ref={firstItemRef as React.Ref<HTMLDivElement>}
            role="menuitem"
            aria-disabled="true"
            tabIndex={0}
            aria-describedby={profileReasonId}
            className={`${row} cursor-default focus-visible:bg-mo-raised focus-visible:outline-none`}
          >
            <CircleUser aria-hidden="true" className="h-4 w-4 shrink-0 text-mo-body" />
            <span className="min-w-0">
              <span className="block font-semibold text-mo-body">Your profile</span>
              <span id={profileReasonId} className="block text-xs leading-snug text-mo-body">
                {APP_ONLY_REASON}
              </span>
            </span>
          </div>

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
                {APP_ONLY_REASON}
              </span>
            </span>
          </div>

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
