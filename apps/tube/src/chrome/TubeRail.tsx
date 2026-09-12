"use client"

/**
 * The left rail: where you can go inside Tube, and who you watch.
 *
 * ── The order is YouTube's, because the founder named YouTube ─────────────
 *
 *     Home
 *     Subscriptions
 *     ───────────────
 *     Subscriptions   <- the channels themselves, with their faces
 *     ───────────────
 *     You             <- History, Your videos, Playlists, Saved videos
 *     ───────────────
 *     Settings
 *     Back to Momentum
 *
 * The channel list is the row that makes this a video app rather than a feed
 * with a video tab: it is the only place in the product where the people you
 * watch are a NAVIGATION structure instead of a ranking input. It is
 * `GET /v1/channels/subscriptions` in the server's order, mapped by
 * `subscriptionsToChannels` in ../tube/subscription.ts; until 2026-09-12 it
 * was derived from the Following slice of the video feed because there was
 * no subscriptions endpoint, which is why the empty sentence below used to
 * say "once they post a video" and no longer does.
 *
 * ── Two widths, one list ──────────────────────────────────────────────────
 * `TubeRailContent` is rendered by both the ≥lg column and the <lg drawer, so
 * a row added here appears in both and cannot appear in one. The collapsed
 * icon rail is the same component with `collapsed`, and it drops the channel
 * list rather than shrinking it: a column of faces with no names is a memory
 * test, and YouTube's own mini rail drops it for the same reason.
 *
 * ── Sticky, and scrolling on its own ──────────────────────────────────────
 * `top-14` is the top bar's height, so the rail parks directly under it. Its
 * own `overflow-y-auto` matters more than it looks: without it a rail taller
 * than the window can never reach its own bottom rows — including the way
 * out — because a sticky element stops scrolling once it has stuck.
 */

import { Fragment } from "react"
import Link from "next/link"
import { Avatar } from "@momentum/content"
import type { ChannelRef } from "@/tube/channels"
import { channelHref } from "@/tube/channels"
import { RailRow } from "./RailRow"
import {
  EXIT_ITEM,
  EXPLORE_ITEM,
  PRIMARY_ITEMS,
  currentRailId,
  settingsItem,
  youItems,
  type TubeRailItem,
} from "./rail"

export interface TubeRailProps {
  /** Zone-relative, straight from `usePathname()`. See `currentRailId`. */
  pathname: string | null
  signedIn: boolean
  /** The viewer's own channel handle or id, for "Your videos" and Playlists. */
  ownChannelRef: string | null
  channels: ChannelRef[]
  /** True while the channel list is still in flight, so the gap can be quiet. */
  channelsLoading: boolean
  collapsed?: boolean
  signInHref: string
  onNavigate?: () => void
}

function Divider() {
  return <hr className="my-3 border-0 border-t border-mo" aria-hidden="true" />
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="px-3 pb-1 pt-1 text-xs font-semibold uppercase tracking-wide text-mo-body">
      {children}
    </h2>
  )
}

/** One subscribed channel: a face, a name, and a real link to the page. */
function ChannelRow({ channel, onNavigate }: { channel: ChannelRef; onNavigate?: () => void }) {
  const ref = channel.handle || channel.user_id
  return (
    <li>
      <Link
        href={channelHref(ref)}
        onClick={onNavigate}
        className="flex w-full items-center gap-4 rounded-mo px-3 py-2 text-sm text-mo-ink transition-colors duration-150 ease-mo hover:bg-mo-surface outline-offset-[-2px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-mo"
      >
        {/* `avatar_url` is a real signed URL when the channel has one, which
            is why this passes `src` where the feed's cards cannot: an
            `avatar_media_id` is not a URL and the one derivable from it is
            unsigned and 403s. Every channel on the dev stack has null here,
            so what is actually drawn today is the initial. */}
        <Avatar name={channel.name} id={channel.user_id} src={channel.avatar_url} size="sm" />
        <span className="min-w-0 flex-1 truncate">{channel.name}</span>
      </Link>
    </li>
  )
}

export function TubeRailContent({
  pathname,
  signedIn,
  ownChannelRef,
  channels,
  channelsLoading,
  collapsed = false,
  signInHref,
  onNavigate,
}: TubeRailProps) {
  const you = youItems({ signedIn, ownChannelRef })
  const tail: TubeRailItem[] = [settingsItem({ signedIn }), EXPLORE_ITEM, EXIT_ITEM]
  const all: TubeRailItem[] = [...PRIMARY_ITEMS, ...you, ...tail]
  const currentId = currentRailId(pathname, all)

  const list = (items: readonly TubeRailItem[]) => (
    <ul className={collapsed ? "space-y-1" : "space-y-0.5"}>
      {items.map((item) => (
        <RailRow
          key={item.id}
          item={item}
          current={item.id === currentId}
          collapsed={collapsed}
          onNavigate={onNavigate}
        />
      ))}
    </ul>
  )

  return (
    <nav aria-label="Tube" className={collapsed ? "px-1 py-3" : "px-2 py-3"}>
      {list(PRIMARY_ITEMS)}

      {/* ── The channels ──────────────────────────────────────────────────
          Dropped entirely in the icon rail (see the header) and replaced for
          a signed-out visitor by the one sentence that explains the gap. */}
      {!collapsed && (
        <>
          <Divider />
          {signedIn ? (
            <>
              <SectionLabel>Subscriptions</SectionLabel>
              {channels.length > 0 ? (
                <ul className="space-y-0.5">
                  {channels.map((channel) => (
                    <ChannelRow key={channel.user_id} channel={channel} onNavigate={onNavigate} />
                  ))}
                </ul>
              ) : channelsLoading ? (
                // Three rows of the right height, so the sections below do not
                // jump when the list lands.
                <ul aria-hidden="true" className="space-y-0.5">
                  {[0, 1, 2].map((i) => (
                    <li key={i} className="flex animate-pulse items-center gap-4 px-3 py-2">
                      <span className="h-8 w-8 shrink-0 rounded-mo-pill bg-mo-raised" />
                      <span className="h-3 w-2/3 rounded bg-mo-raised" />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-3 pb-1 text-xs leading-snug text-mo-body">
                  Channels you subscribe to appear here.
                </p>
              )}
            </>
          ) : (
            <div className="rounded-mo border border-mo bg-mo-surface p-3">
              <p className="text-sm font-semibold text-mo-ink">Sign in to subscribe</p>
              <p className="mt-1 text-xs leading-snug text-mo-body">
                Your subscriptions, your history and your own videos all need an account.
              </p>
              {/* A plain <a>: /login is served by the shell, a different Next
                  app behind a rewrite, so next/link would ask for
                  /tube/login. */}
              <a
                href={signInHref}
                className="mt-3 inline-block rounded-mo-pill border border-mo-strong px-4 py-2 text-sm font-semibold text-mo-cyan transition-colors duration-150 ease-mo hover:bg-mo-raised"
              >
                Sign in
              </a>
            </div>
          )}
        </>
      )}

      <Divider />
      {!collapsed && <SectionLabel>You</SectionLabel>}
      {list(you)}

      <Divider />
      {list(tail)}

      {!collapsed && (
        <p className="mt-4 px-3 text-xs leading-snug text-mo-body">
          Momentum Tube is its own app. Your account is the same one.
        </p>
      )}
    </nav>
  )
}

/**
 * The rail as a column — ≥1024px only.
 *
 * 240px expanded, 76px collapsed. 240 is what the longest row ("Back to
 * Momentum" beside a 20px glyph and a 16px gutter) needs without truncating;
 * 76 is the width of a 64px-tall tile whose label is a word like
 * "Subscriptions" at 10px, truncated rather than wrapped so every tile in the
 * rail is the same height.
 */
export function TubeRailColumn(props: TubeRailProps) {
  return (
    <aside
      aria-label="Tube navigation"
      className="sticky top-14 hidden max-h-[calc(100vh-3.5rem)] shrink-0 overflow-y-auto border-r border-mo lg:block"
      style={{ width: props.collapsed ? 76 : 240 }}
    >
      <TubeRailContent {...props} />
    </aside>
  )
}

/**
 * The rail as a drawer — below 1024px, where there is no room for a column.
 *
 * ── Why a drawer and not "the rail disappears" ────────────────────────────
 * @momentum/chrome drops its left rail below `lg` and gets away with it,
 * because its header carries every destination as an icon strip. This top bar
 * does not: Tube's destinations are a list with the viewer's own channels in
 * it, which is not a seven-glyph strip. Dropping the rail on a phone would
 * take Subscriptions, the channel list and — the one that matters most — the
 * way back to Momentum off the screen entirely. See EXIT_ITEM in ./rail.ts.
 *
 * `hidden` rather than unmounted when closed: out of the accessibility tree,
 * out of the focus order and out of find-in-page, with the markup left
 * stable. The same distinction ProfileMenu draws in @momentum/chrome.
 */
export function TubeRailDrawer({
  open,
  onClose,
  ...props
}: TubeRailProps & { open: boolean; onClose: () => void }) {
  return (
    <Fragment>
      <div
        hidden={!open}
        onClick={onClose}
        aria-hidden="true"
        className="fixed inset-0 z-40 bg-black/60 lg:hidden"
      />
      <aside
        hidden={!open}
        aria-label="Tube navigation"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault()
            onClose()
          }
        }}
        className="fixed left-0 top-0 z-50 h-full w-[264px] overflow-y-auto border-r border-mo bg-mo-bg shadow-mo-lift lg:hidden"
      >
        <div className="flex h-14 items-center px-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-mo-pill px-3 py-1.5 text-sm font-semibold text-mo-cyan hover:bg-mo-surface"
          >
            Close
          </button>
        </div>
        <TubeRailContent {...props} collapsed={false} onNavigate={onClose} />
      </aside>
    </Fragment>
  )
}
