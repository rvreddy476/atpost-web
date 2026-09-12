"use client"

/**
 * Who made this, and the control that subscribes to them.
 *
 * ── The name is a LINK, and it was plain text ─────────────────────────────
 * That was the gap: a long video is published by a channel, the channel has a
 * handle, and the one place somebody looks for "everything else by this person"
 * is their name under the video. It goes to `/tube/@{handle}`.
 *
 * The URL is not built here. `itemChannelHref` in ../tube/channels.ts is the
 * one definition of a channel's address in this zone — it normalises the "@",
 * falls back to the user id for a channel with no handle, and answers null when
 * there is neither, which is what stops a name becoming a link to "/@undefined".
 * A second implementation of that in this file is exactly the drift that made
 * `videoHref` need a test, so there is not one.
 *
 * ── The subscriber count comes from the edge, which got it from the row ───
 * `FeedChannel` on a feed row is `{user_id, name, handle, avatar_url}` and
 * carries no count, so the watch page fetches the channel's own row for its
 * `subscriber_count` and seeds `useSubscription` with it. What this row prints
 * is the EDGE's count: the same number until the viewer presses Subscribe,
 * and from then on the one that moved with the press and was replaced by the
 * server's answer. It is fetched rather than blocked on: the row draws
 * immediately with the name and the handle, and the count appears when it
 * arrives. A count that failed to load is drawn as nothing at all, never as
 * "0": a wrong number under a creator's name is a claim about their
 * audience.
 *
 * ── The control is the channel page's control ─────────────────────────────
 * `SubscribeControls` from ../channel/SubscribeControls.tsx, the same button
 * and the same bell the channel page draws, from the same hook. The two
 * surfaces are one click apart and a control that renames itself or loses
 * its bell on the way is a control people stop trusting. It renders nothing
 * while the edge is unknown, for the viewer's own video and while signed out,
 * which is the whole of the old `showsFollow` rule, now inside the hook.
 */

import Link from "next/link"
import type { FeedItem } from "@atpost/types/feed"
import { Avatar } from "@momentum/content"
import { SubscribeControls } from "@/channel/SubscribeControls"
import { itemChannelHref, subscribersLabel } from "@/tube/channels"
import type { SubscriptionEdge } from "@/tube/useSubscription"
import { creatorHandle, creatorName } from "@/tube/video"

export interface ChannelRowProps {
  item: FeedItem
  subscription: SubscriptionEdge
}

export function ChannelRow({ item, subscription }: ChannelRowProps) {
  const name = creatorName(item)
  const handle = creatorHandle(item)
  const href = itemChannelHref(item)
  const ownerId = item.channel?.user_id ?? item.author_id
  const subscribers = subscription.subscriberCount

  return (
    <div className="mt-5 flex items-center gap-3 border-t border-mo pt-5">
      {/* The avatar is initials unless the channel carries a real URL.
          `author.avatar_media_id` is an id rather than a URL and there is no
          signed way to resolve it — @momentum/content's Avatar carries that
          whole argument and takes a `src` the day the API can produce one. */}
      <Avatar name={name} id={ownerId} src={item.channel?.avatar_url ?? undefined} />

      <div className="min-w-0 flex-1">
        {href ? (
          <Link
            href={href}
            className="block truncate text-[15px] font-semibold text-mo-ink underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-mo-cyan"
          >
            {name}
          </Link>
        ) : (
          <p className="truncate text-[15px] font-semibold text-mo-ink">{name}</p>
        )}
        <p className="flex min-w-0 flex-wrap items-center gap-x-2 truncate text-sm text-mo-body">
          {handle && <span>{handle}</span>}
          {subscribers !== null && (
            <>
              {handle && <span aria-hidden>·</span>}
              <span>{subscribersLabel(subscribers)}</span>
            </>
          )}
        </p>
      </div>

      <SubscribeControls edge={subscription} name={name} className="shrink-0" />
    </div>
  )
}
