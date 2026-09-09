"use client"

/**
 * Who made this, and the control that follows them.
 *
 * ── The name is a LINK now, and it was plain text ─────────────────────────
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
 * ── The subscriber count comes from the profile, not from the channel ─────
 * `FeedChannel` on a feed row is `{user_id, name, handle, avatar_url}` and
 * carries no count at all. `fetchSubscriberCount` in ../tube/channelApi.ts is
 * the zone's own answer to that, and the reason it reads a PROFILE is worth
 * knowing: subscribing IS following on this platform — there is no
 * `/v1/channels/{id}/subscribe` route, the Android client's Subscriptions page is
 * `following_only=true` over the video feed, and the subscribe control is
 * `POST /v1/graph/follow` — so `follower_count` is the honest number rather
 * than a proxy for one.
 *
 * It is fetched rather than blocked on: the row draws immediately with the name
 * and the handle, and the count appears when it arrives. A count that failed to
 * load is drawn as nothing at all, never as "0" — a wrong number under a
 * creator's name is worse than no number, because it is a claim about their
 * audience.
 *
 * ── The control says "Subscribe", and the edge underneath is a follow ─────
 * It is `FollowButton` from @momentum/interactions — the real one, with the
 * optimistic update, the rollback, and the honest third state a private account
 * produces ("Requested", which is not "Subscribed", and telling somebody it is
 * would be telling them they can see videos they cannot). Only the WORDS are
 * overridden, through that component's own `labels` prop, and they are the same
 * three the channel page passes: Tube calls this act subscribing, the count
 * beside it says "subscribers", and a control reading "Follow" under that
 * would be two names for one thing on one screen.
 *
 * "Requested" is deliberately left alone. There is no natural subscription
 * word for a request that is waiting on someone else's approval, and inventing
 * one ("Requested to subscribe"?) would be worse than the honest one.
 */

import { useEffect, useState } from "react"
import Link from "next/link"
import type { FeedItem } from "@atpost/types/feed"
import { Avatar } from "@momentum/content"
import { FollowButton, type FollowState } from "@momentum/interactions"
import { fetchSubscriberCount } from "@/tube/channelApi"
import { itemChannelHref, subscribersLabel } from "@/tube/channels"
import { creatorHandle, creatorName, showsFollow } from "@/tube/video"

/**
 * Tube's words for the follow edge. The same pair `src/channel/ChannelScreen`
 * passes, and they must stay the same pair: the two surfaces are one click
 * apart and a control that renames itself on the way is a control people stop
 * trusting.
 */
export const SUBSCRIBE_LABELS = { none: "Subscribe", following: "Subscribed" } as const

export interface ChannelRowProps {
  item: FeedItem
  viewerId: string | null
  followState: FollowState | undefined
  onFollow: (next: "follow" | "unfollow") => Promise<FollowState>
}

export function ChannelRow({ item, viewerId, followState, onFollow }: ChannelRowProps) {
  const name = creatorName(item)
  const handle = creatorHandle(item)
  const href = itemChannelHref(item)
  const ownerId = item.channel?.user_id ?? item.author_id

  const [subscribers, setSubscribers] = useState<number | null>(null)
  useEffect(() => {
    setSubscribers(null)
    if (!ownerId) return
    let live = true
    fetchSubscriberCount(ownerId)
      .then((count) => {
        if (live) setSubscribers(count)
      })
      // A count that did not load is a missing NUMBER, not a missing channel.
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [ownerId])

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

      {showsFollow(viewerId, item.author_id, followState) && (
        <FollowButton
          // Remounted when the edge changes: FollowButton seeds its state from
          // the prop with `useState` and never re-reads it, so without the key
          // it keeps saying "Follow" after the real edge arrives from the batch
          // lookup.
          key={`${item.author_id}:${followState ?? "unknown"}`}
          state={followState ?? "none"}
          displayName={name}
          onToggle={onFollow}
          labels={SUBSCRIBE_LABELS}
          className="shrink-0"
        />
      )}
    </div>
  )
}
