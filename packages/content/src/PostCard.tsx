"use client"

/**
 * One post.
 *
 * ── What this card is responsible for ─────────────────────────────────────
 * Layout and honesty. It renders what the post says about itself and nothing
 * it does not: no invented captions, no controls the author switched off, no
 * reasons of its own for why something is here. Everything that needs a
 * network — liking, saving, refetching a stale page — arrives as a handler.
 *
 * ── content_type is authoritative ─────────────────────────────────────────
 * A `long_video` with no `media` array is a real thing the live feed returns
 * (three of the six in the current corpus). Inferring the kind from whether a
 * video attachment happens to be present would render those as plain text
 * posts and quietly lose the title and the channel. So the kind comes from
 * `content_type` and the media is treated as an attachment that may be absent.
 *
 * ── Several attachments are a carousel, not a column ──────────────────────
 * A post with five photographs used to render five stacked frames: five
 * screens of scrolling for one post, the caption and the action bar pushed
 * below the fold, and the last picture given the same weight as the first.
 * Two or more attachments now go to `PostCarousel`, which is also where the
 * question of WHICH page may play is answered — see its header, and the note
 * on `active` at the call site.
 *
 * ── reason_text is already written ────────────────────────────────────────
 * "Suggested for you" comes from the server. The card shows it rather than
 * composing its own sentence, because the ranking service is the only thing
 * that knows why an item was chosen and a client-side guess would eventually
 * be a lie. It is rendered in `text-mo-body` — 6.22 on a card, small text,
 * which rules out `--mo-muted-lg` (3.01) however much it looks like the right
 * shade of quiet.
 */

import { Radio, Video } from "lucide-react"
import type { FeedItem } from "@atpost/types/feed"
import type { WatchEvent, WatchSessionInfo } from "@momentum/player"
import { primaryVideo } from "@momentum/player"
import { ActionBar } from "@momentum/interactions"
import type { ToggleResult } from "@momentum/interactions"
import { Avatar } from "./Avatar"
import { PostCarousel } from "./PostCarousel"
import { PostMedia } from "./PostMedia"
import { absoluteTime, formatDuration, relativeTime } from "./relativeTime"

export interface PostCardHandlers {
  onLike: (item: FeedItem, next: boolean) => Promise<ToggleResult>
  onSave: (item: FeedItem, next: boolean) => Promise<ToggleResult>
  onRepost?: (item: FeedItem, next: boolean) => Promise<ToggleResult>
  onComment?: (item: FeedItem) => void
  onShare?: (item: FeedItem) => void
  onStale?: (postId: string) => void
}

export interface PostCardProps extends PostCardHandlers {
  item: FeedItem
  /** From the coordinator's `register(item.id)`. Bound to the id, never an index. */
  containerRef?: (el: HTMLElement | null) => void
  active: boolean
  muted: boolean
  onToggleMuted?: () => void
  session?: WatchSessionInfo
  onWatchEvent?: (event: WatchEvent) => void
  /** Playlist url resolution, owned by the zone. Passed to the player. */
  resolveUrl?: (url: string) => string
}

export function PostCard({
  item,
  containerRef,
  active,
  muted,
  onToggleMuted,
  session,
  onWatchEvent,
  resolveUrl,
  onLike,
  onSave,
  onRepost,
  onComment,
  onShare,
  onStale,
}: PostCardProps) {
  const author = item.author
  const name = item.channel?.name || author?.display_name || "Someone"
  const handle = item.channel?.handle ? `@${item.channel.handle}` : undefined
  const video = primaryVideo(item)
  // Position order, so a carousel is shown the way it was uploaded.
  const attachments = [...(item.media ?? [])].sort((a, b) => a.position - b.position)
  const duration = formatDuration(video?.duration_ms)

  return (
    <article
      ref={containerRef}
      // The surface sits only 1.19:1 above the ground, so the hairline and the
      // shadow are what make it a card at all — not decoration. See tokens.css.
      className="rounded-mo border border-mo bg-mo-surface shadow-mo"
      aria-labelledby={`post-${item.id}-author`}
    >
      <header className="flex items-start gap-3 p-4 pb-3">
        <Avatar name={name} id={item.author_id} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span id={`post-${item.id}-author`} className="truncate font-semibold text-mo-ink">
              {name}
            </span>
            {handle && <span className="truncate text-sm text-mo-body">{handle}</span>}
            <span aria-hidden="true" className="text-mo-body">
              ·
            </span>
            <time
              dateTime={item.created_at}
              title={absoluteTime(item.created_at)}
              className="text-sm text-mo-body"
            >
              {relativeTime(item.created_at)}
            </time>
          </div>

          {item.reason_text && (
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-mo-body">
              {/* Purple is the presence colour and this is a non-text mark —
                  3.87 on a card, which clears the 3.0 bar for exactly this. */}
              <Radio aria-hidden="true" className="h-3 w-3 text-mo-purple" />
              {item.reason_text}
            </p>
          )}
        </div>
      </header>

      <div className="space-y-3 px-4 pb-3">
        {/* A long video's title is its headline, not a caption. */}
        {item.title && (
          <h2 className="font-mo-display text-lg font-semibold leading-snug tracking-mo-display text-mo-ink">
            {item.title}
          </h2>
        )}

        {item.text && (
          <p className="whitespace-pre-wrap break-words leading-relaxed text-mo-ink">{item.text}</p>
        )}

        {item.hashtags && item.hashtags.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label="Tags">
            {item.hashtags.map((tag) => (
              <li key={tag} className="text-sm text-mo-cyan">
                #{tag}
              </li>
            ))}
          </ul>
        )}

        {/*
          Two or more attachments are ONE frame you swipe through, not a
          column. PostCarousel owns which page is in view and therefore which
          page may play; the single-attachment branch below is untouched by it.

          The single branch stays for the same reason it stays on Android: not
          every attachment is a carousel, and rewriting the one-picture path to
          go through a scroller would put a scroll container, a pill and a row
          of pips around every photograph on the platform to no purpose.
        */}
        {attachments.length > 1 && (
          <PostCarousel
            item={item}
            media={attachments}
            // The POST's activeness. The carousel intersects it with the page
            // in view before any media is told it may play.
            active={active}
            muted={muted}
            onToggleMuted={onToggleMuted}
            session={session}
            onWatchEvent={onWatchEvent}
            sessionPageId={video?.media_id}
            onStale={onStale}
            resolveUrl={resolveUrl}
          />
        )}

        {attachments.length === 1 && (
          <div className="relative">
            <PostMedia
              item={item}
              media={attachments[0]}
              // Only a video plays, and only on an active card.
              active={active && attachments[0].media_id === video?.media_id}
              muted={muted}
              onToggleMuted={onToggleMuted}
              session={attachments[0].media_id === video?.media_id ? session : undefined}
              onWatchEvent={attachments[0].media_id === video?.media_id ? onWatchEvent : undefined}
              onStale={onStale}
              resolveUrl={resolveUrl}
            />
            {duration && (
              <span className="pointer-events-none absolute bottom-2 right-2 rounded-mo-sm bg-mo-bg/80 px-1.5 py-0.5 text-xs tabular-nums text-mo-ink">
                {duration}
              </span>
            )}
          </div>
        )}

        {/* A long_video that arrived without media. It is not a text post and
            must not be dressed as one. */}
        {item.content_type === "long_video" && attachments.length === 0 && (
          <div className="flex items-center gap-2 rounded-mo border border-mo bg-mo-raised px-3 py-2 text-sm text-mo-body">
            <Video aria-hidden="true" className="h-4 w-4" />
            Video unavailable
          </div>
        )}

        {item.poll && <PollSummary poll={item.poll} />}
      </div>

      <div className="border-t border-mo px-2 py-1">
        <ActionBar
          likes={item.counts?.likes ?? 0}
          comments={item.counts?.comments ?? 0}
          reposts={item.repost_count ?? 0}
          hasLiked={Boolean(item.has_reacted)}
          isSaved={Boolean(item.is_bookmarked)}
          hasReposted={Boolean(item.has_reposted)}
          noComments={Boolean(item.no_comments)}
          hideShare={Boolean(item.hide_share)}
          isRepostable={item.is_repostable !== false}
          label={`${name}'s post`}
          onLike={(next) => onLike(item, next)}
          onSave={(next) => onSave(item, next)}
          onRepost={onRepost ? (next) => onRepost(item, next) : undefined}
          onComment={onComment ? () => onComment(item) : undefined}
          onShare={onShare ? () => onShare(item) : undefined}
        />
      </div>
    </article>
  )
}

/**
 * A poll, read-only.
 *
 * Voting is `POST /v1/posts/{id}/vote` and belongs in a later pass — showing
 * the options and the totals is honest; showing a button that does nothing is
 * not, so there is no button here.
 */
function PollSummary({ poll }: { poll: NonNullable<FeedItem["poll"]> }) {
  const total = poll.total_votes ?? 0
  return (
    <div className="space-y-2 rounded-mo border border-mo bg-mo-raised p-3">
      {poll.question && <p className="font-semibold text-mo-ink">{poll.question}</p>}
      <ul className="space-y-1.5">
        {(poll.options ?? []).map((option) => {
          const votes = option.votes ?? 0
          const share = total > 0 ? Math.round((votes / total) * 100) : 0
          return (
            <li key={option.id} className="relative overflow-hidden rounded-mo-sm bg-mo-sunken">
              <div
                aria-hidden="true"
                className="absolute inset-y-0 left-0 bg-mo-cyan/20"
                style={{ width: `${share}%` }}
              />
              <div className="relative flex justify-between px-3 py-1.5 text-sm text-mo-ink">
                <span>{option.text}</span>
                <span className="tabular-nums text-mo-body">{share}%</span>
              </div>
            </li>
          )
        })}
      </ul>
      <p className="text-xs text-mo-body">
        {total} {total === 1 ? "vote" : "votes"}
      </p>
    </div>
  )
}
