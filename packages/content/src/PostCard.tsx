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
 *
 * ── Absent, not disabled — now applied to handlers too ────────────────────
 * The rule the action bar has always held: a control the server WILL refuse is
 * not rendered, because a disabled button says "not yet" where the truth is
 * "not here". `no_comments` and `hide_share` are that kind of switch and the
 * bar drops those controls entirely.
 *
 * The overflow menu and the comment sheet extend the same rule one step: a row
 * whose handler the zone did not wire is also absent. A Report that files
 * nothing and a 403 are the same broken promise; one of them just fails later.
 * So every new handler below is optional, and every one of them being absent
 * is a card that renders correctly with less on it.
 */

import { useState } from "react"
import { BadgeCheck, Radio, Video } from "lucide-react"
import type { FeedItem, FeedPoll } from "@atpost/types/feed"
import type { WatchEvent, WatchSessionInfo } from "@momentum/player"
import { primaryVideo } from "@momentum/player"
import { ActionBar } from "@momentum/interactions"
import type { ToggleResult } from "@momentum/interactions"
import { Avatar } from "./Avatar"
import { avatarSrc } from "./avatarUrl"
import { authorLabel, authorRole } from "./byline"
import { CommentSheet } from "./CommentSheet"
import type { CommentApi, CommentRow } from "./comments"
import { PostCarousel } from "./PostCarousel"
import { PostMedia } from "./PostMedia"
import { PostOverflowMenu } from "./PostOverflowMenu"
import { PostPoll } from "./PostPoll"
import type { ReportReason } from "./postMenu"
import { absoluteTime, formatDuration, relativeTime } from "./relativeTime"

export interface PostCardHandlers {
  onLike: (item: FeedItem, next: boolean) => Promise<ToggleResult>
  onSave: (item: FeedItem, next: boolean) => Promise<ToggleResult>
  onRepost?: (item: FeedItem, next: boolean) => Promise<ToggleResult>
  /**
   * Opening the comment surface.
   *
   * Optional, and it is NOT what opens the sheet: supply `comments` below and
   * the card opens its own. This stays for a surface that wants to navigate
   * somewhere instead — a post detail route, say — and takes precedence when
   * both are given, because a caller that asked to handle it should handle it.
   */
  onComment?: (item: FeedItem) => void
  onShare?: (item: FeedItem) => void
  onStale?: (postId: string) => void
  /**
   * Cast one poll vote, answering with the poll AS THE SERVER NOW HAS IT.
   *
   * `POST /v1/posts/{id}/poll/vote` answers `{"ok":true}` and nothing else, so
   * the totals have to be read back — and reading them back is a second URL,
   * which is the zone's business and not this package's. Absent means the
   * options are shown but not pressable; see the render site.
   */
  onVote?: (item: FeedItem, optionId: string) => Promise<FeedPoll>
  /** Turns a rejected vote into a sentence. Pairs with `commentError` above. */
  pollError?: (error: unknown) => string

  /* ── The overflow menu's actions. Every one optional; see the header. ──── */

  /** The post's own URL, for "Copy link". No prop, no row — never a guess. */
  permalink?: (item: FeedItem) => string
  /**
   * `POST /v1/feed/feedback`, which takes EXACTLY ONE of a post or an author.
   * `target: "author"` is "don't recommend this account".
   */
  onFeedback?: (
    item: FeedItem,
    signal: "interested" | "not_interested",
    target: "post" | "author"
  ) => void
  /** `POST /v1/reports`, `entity_type: "post"`. `details` is "" unless asked for. */
  onReport?: (item: FeedItem, reason: ReportReason, details: string) => void
  /** Whether the viewer wrote this. Only the zone knows who is signed in. */
  isOwnPost?: (item: FeedItem) => boolean
}

export interface PostCardProps extends PostCardHandlers {
  item: FeedItem
  /** From the coordinator's `register(item.id)`. Bound to the id, never an index. */
  containerRef?: (el: HTMLElement | null) => void
  active: boolean
  /**
   * The DEFAULT sound state for this card's videos, not a shared one.
   *
   * Mute is per PLAYER now. It lives on the video, the player owns it, and
   * once a person has used it their choice wins — so this is only the value a
   * player starts from and nothing here can change a video's sound.
   */
  muted: boolean
  session?: WatchSessionInfo
  onWatchEvent?: (event: WatchEvent) => void
  /** Playlist url resolution, owned by the zone. Passed to the player. */
  resolveUrl?: (url: string) => string
  /**
   * The gateway prefix this zone is served under — "/social", "/reels".
   *
   * Needed only to put a face on the card. An author arrives with an
   * `avatar_media_id` and no URL, the URL that serves it is
   * `/v1/media/{id}/serve/avatar`, and a root-relative path misses a zone
   * that has a basePath — which is exactly how every product photograph in
   * the shop came to be a broken image once. It is a PROP and not
   * `process.env.NEXT_PUBLIC_API_BASE_URL` for the reason @momentum/chrome's
   * zone.ts sets out at length: a component rendered in four zones has to be
   * told which one it is in. Absent means root-relative, which is correct for
   * a zone mounted at "/".
   */
  apiBase?: string
  /**
   * List and create, already pointed at a gateway by the zone.
   *
   * Absent means no comment surface, and the bar's comment control opens
   * nothing — which is why the control is dropped in that case rather than
   * left as the dead glyph it has been since the bar was written.
   */
  comments?: CommentApi
  /**
   * The signed-in account's id, when there is one.
   *
   * Separate from `isOwnPost` on purpose, though the zone derives both from
   * the same session. `isOwnPost` answers a question about the POST and is a
   * predicate because a surface may know the answer without knowing the id;
   * this is the id itself, needed one level down by the comment sheet to name
   * a row the server did not name. Neither is derivable from the other.
   */
  viewerId?: string
  /** Fired after the server accepted one. This is where `comment_create` goes. */
  onCommentCreated?: (item: FeedItem, row: CommentRow) => void
  /** Turns a rejected comment request into a sentence. The zone owns transport. */
  commentError?: (error: unknown) => string
}

export function PostCard({
  item,
  containerRef,
  active,
  muted,
  session,
  onWatchEvent,
  resolveUrl,
  apiBase,
  onLike,
  onSave,
  onRepost,
  onComment,
  onShare,
  onStale,
  onVote,
  pollError,
  permalink,
  onFeedback,
  onReport,
  isOwnPost,
  comments,
  viewerId,
  onCommentCreated,
  commentError,
}: PostCardProps) {
  const [commentsOpen, setCommentsOpen] = useState(false)
  const author = item.author
  // The naming rule — including what to say when nothing named them — is in
  // ./byline.ts, where it can be a table test. It used to be the literal
  // "Someone" on this line, and on the hashtag tab that was the normal path.
  const { name, handle } = authorLabel(item)
  /**
   * What goes after the handle on the second line — the reference's "role or
   * bio". Undefined on every home-feed row, because feed-service's author
   * block carries neither field; see ./byline.ts and @atpost/types.
   */
  const role = authorRole(item)
  /**
   * The face. Two shapes on one row, reconciled by `avatarSrc`.
   *
   * A channel-published post carries `channel.avatar_url` — absolute, signed,
   * five minutes — and an author carries `avatar_media_id` and no URL at all.
   * The channel's is preferred where both exist for the same reason its NAME
   * is: the post is by the channel. Neither is required, and a card with
   * neither draws initials exactly as it always has.
   */
  const avatar = avatarSrc(
    { url: item.channel?.avatar_url, mediaId: author?.avatar_media_id },
    apiBase
  )
  const video = primaryVideo(item)
  // Position order, so a carousel is shown the way it was uploaded.
  const attachments = [...(item.media ?? [])].sort((a, b) => a.position - b.position)
  const duration = formatDuration(video?.duration_ms)

  return (
    <article
      ref={containerRef}
      // The surface sits only 1.19:1 above the ground — and in a light zone it
      // is the page's own white, 1.00:1 — so the hairline and the shadow are
      // what make it a card at all, not decoration. See tokens.css.
      //
      // `rounded-mo-lg` (22px), not `rounded-mo` (14px): the reference rounds a
      // card generously and 22 is the nearest thing the palette has. A third
      // radius between the two would be a new token, and @momentum/tokens is
      // not this change's to edit.
      className="rounded-mo-lg border border-mo bg-mo-surface shadow-mo"
      aria-labelledby={`post-${item.id}-author`}
    >
      {/*
        ── The byline is TWO lines now, which is the reference's shape ───────
        Line one is the name, the tick and the time; line two is the handle and
        what this person does. It used to be one wrapping row of four things,
        and at 360px that row broke into three lines whose order nobody could
        predict — the time could end up above the handle.

        `items-start` with the avatar, so a two-line byline does not push the
        face off centre.
      */}
      <header className="flex items-start gap-3 p-4 pb-3">
        <Avatar name={name} id={item.author_id} src={avatar} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <span id={`post-${item.id}-author`} className="truncate font-semibold text-mo-ink">
              {name}
            </span>
            {/*
              The tick, drawn ONLY when the wire said so.

              `is_verified` is on user-service's public profile card and is NOT
              on feed-service's `Author`, so today it arrives on hashtag rows
              (which this zone re-hydrates from `/v1/profiles/batch`) and never
              on a home-feed row. That asymmetry is the honest one: a tick on
              every card would be a claim about who is verified, and a tick on
              none would throw away a fact the server did send. See the note on
              the fields in @atpost/types.

              --brand-accent, which is the interactive colour of the scope —
              and a verification tick is not pressable, so the reason it takes
              that token rather than orange is narrower: it is the product's
              own mark, and --mo-accent is reserved for attention. As a
              non-text mark it needs 3.0; it measures 6.61 light and 6.74 dark
              on a card.
            */}
            {item.author?.is_verified && (
              <>
                <BadgeCheck
                  aria-hidden="true"
                  className="h-4 w-4 shrink-0 text-brand-accent"
                />
                <span className="sr-only">Verified account</span>
              </>
            )}
            <span aria-hidden="true" className="shrink-0 text-mo-body">
              ·
            </span>
            <time
              dateTime={item.created_at}
              title={absoluteTime(item.created_at)}
              className="shrink-0 text-sm text-mo-body"
            >
              {relativeTime(item.created_at)}
            </time>
          </div>

          {/* The handle, and the role or bio after a middle dot — absent, both
              of them, on a row that carried neither. `authorRole` is the rule
              and it is a table test; see ./byline.ts. */}
          {(handle || role) && (
            <p className="flex min-w-0 items-center gap-1.5 text-sm text-mo-body">
              {handle && <span className="shrink-0 truncate">{handle}</span>}
              {handle && role && (
                <span aria-hidden="true" className="shrink-0">
                  ·
                </span>
              )}
              {role && <span className="truncate">{role}</span>}
            </p>
          )}

          {item.reason_text && (
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-mo-body">
              {/* Purple is the presence colour and this is a non-text mark —
                  3.87 on a card, which clears the 3.0 bar for exactly this. */}
              <Radio aria-hidden="true" className="h-3 w-3 text-mo-purple" />
              {item.reason_text}
            </p>
          )}
        </div>

        {/*
          The overflow, at the right end of the header row — the place it sits
          on the phone (`post_more` in PostCard.kt) and the place a card puts
          it everywhere else on the web.

          It renders NOTHING when it would have nothing to offer. That is the
          same `onMore = null` the phone uses, arrived at from the other
          direction: instead of the caller deciding, the menu computes its own
          rows from the post and the wired handlers and disappears when the
          list comes back empty.
        */}
        <PostOverflowMenu
          label={`${name}'s post`}
          isOwn={isOwnPost?.(item) ?? false}
          hideShare={Boolean(item.hide_share)}
          hasReason={Boolean(item.reason_text)}
          reasonText={item.reason_text}
          isSaved={Boolean(item.is_bookmarked)}
          onSave={() => void onSave(item, !item.is_bookmarked)}
          onCopyLink={
            permalink
              ? () => {
                  void navigator.clipboard?.writeText(permalink(item))
                }
              : undefined
          }
          onShare={onShare ? () => onShare(item) : undefined}
          onFeedback={onFeedback ? (signal, target) => onFeedback(item, signal, target) : undefined}
          onReport={onReport ? (reason, details) => onReport(item, reason, details) : undefined}
        />
      </header>

      <div className="space-y-3 px-4 pb-3">
        {/* A long video's title is its headline, not a caption — and
            `text-base` rather than `text-lg` is enough to say so. At 18px it
            was competing with the page's own heading; at 16px semibold over
            16px regular body copy the hierarchy is still unambiguous. */}
        {item.title && (
          <h2 className="font-mo-display text-base font-semibold leading-snug tracking-mo-display text-mo-ink">
            {item.title}
          </h2>
        )}

        {item.text && (
          <p className="whitespace-pre-wrap break-words leading-relaxed text-mo-ink">{item.text}</p>
        )}

        {/* Cyan and NOT --brand-accent, deliberately. A hashtag here is not a
            link — nothing in this card navigates on one — and --brand-accent is
            the colour this product uses for things that are. Under `.mo-light`
            cyan is --mo-info (#0C6E86, 5.84 on a white card; #06B6D4 is 6.74 on
            a dark one), which is the honest reading: a tag is a fact about the
            post. The day these become links they take --brand-accent with the
            anchor. */}
        {item.hashtags && item.hashtags.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label="Tags">
            {item.hashtags.map((tag) => (
              <li key={tag} className="text-sm text-mo-cyan">
                #{tag}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/*
        ── The media is the full width of the card now ───────────────────────
        The reference puts it edge to edge under the header with its own
        rounded corners, and that is not only a look: an image inset by 16px on
        each side loses 32 of the 600px the column has, which on a 4:3
        photograph is 24px of height as well. It sat inside the text block's
        `px-4` before, so it was inset on both.

        `px-3` rather than 0: a card with a 20px radius and a picture flush to
        its edges has the picture's square corners poking through the card's
        round ones on the two sides. Three pixels of ground is enough to keep
        the card's corner and is a quarter of what it was giving up.
      */}
      {attachments.length > 0 && (
        <div className="px-3 pb-3">
          {/*
            Two or more attachments are ONE frame you swipe through, not a
            column. PostCarousel owns which page is in view and therefore which
            page may play; the single-attachment branch below is untouched by
            it — including the counter, which the carousel draws for itself
            because only it knows which page you are on.

            The single branch stays for the same reason it stays on Android:
            not every attachment is a carousel, and rewriting the one-picture
            path to go through a scroller would put a scroll container, a pill
            and a row of pips around every photograph on the platform to no
            purpose.
          */}
          {attachments.length > 1 && (
            <PostCarousel
              item={item}
              media={attachments}
              // The POST's activeness. The carousel intersects it with the page
              // in view before any media is told it may play.
              active={active}
              // The starting value only. Every player owns its own sound.
              muted={muted}
              session={session}
              onWatchEvent={onWatchEvent}
              sessionPageId={video?.media_id}
              onStale={onStale}
              resolveUrl={resolveUrl}
            />
          )}

          {attachments.length === 1 && (
            // `overflow-hidden` with the card's own radius: this is what makes
            // the picture's corners round rather than the box around it.
            <div className="relative overflow-hidden rounded-mo">
              <PostMedia
                item={item}
                media={attachments[0]}
                // Only a video plays, and only on an active card.
                active={active && attachments[0].media_id === video?.media_id}
                muted={muted}
                session={attachments[0].media_id === video?.media_id ? session : undefined}
                onWatchEvent={
                  attachments[0].media_id === video?.media_id ? onWatchEvent : undefined
                }
                onStale={onStale}
                resolveUrl={resolveUrl}
              />
              {/* On the scrim, not on the page: a duration sits over a video
                  frame, and --mo-bg / --mo-ink both flip with the scope while a
                  photograph does not. --mo-on-scrim on scrim @ .80 is 10.02 over
                  pure white media and better over everything darker. */}
              {duration && (
                <span className="pointer-events-none absolute bottom-2 right-2 rounded-mo-sm bg-mo-scrim/80 px-1.5 py-0.5 text-xs tabular-nums text-mo-on-scrim">
                  {duration}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      <div className="space-y-3 px-4 pb-3">
        {/* A long_video that arrived without media. It is not a text post and
            must not be dressed as one. */}
        {item.content_type === "long_video" && attachments.length === 0 && (
          <div className="flex items-center gap-2 rounded-mo border border-mo bg-mo-raised px-3 py-2 text-sm text-mo-body">
            <Video aria-hidden="true" className="h-4 w-4" />
            Video unavailable
          </div>
        )}

        {/*
          The poll, which takes a vote now.

          `signedIn` is `viewerId`, which the card already has for the comment
          sheet — a viewer who has not voted and a viewer who is not there send
          the same empty `viewer_votes`, and the two want different cards. And
          `onVote` being absent is what makes the options unpressable, the same
          absent-not-disabled rule the comment control and the overflow rows
          follow: a card with nothing wired renders correct, readable results
          and no promise it cannot keep.
        */}
        {item.poll && (
          <PostPoll
            poll={item.poll}
            label={name}
            signedIn={Boolean(viewerId)}
            onVote={onVote ? (optionId) => onVote(item, optionId) : undefined}
            errorMessage={pollError}
            /*
              The one poll in the live corpus has the SAME string for the
              post's text and the poll's question, so the card printed
              "Which_color_wins" twice, one line apart. The post's body stays
              and the box's heading goes: the text belongs to the card, and a
              poll whose question really is different still shows it.
            */
            showQuestion={(item.poll.question ?? "").trim() !== (item.text ?? "").trim()}
          />
        )}
      </div>

      <div className="border-t border-mo px-2 py-1">
        <ActionBar
          likes={item.counts?.likes ?? 0}
          comments={item.counts?.comments ?? 0}
          reposts={item.repost_count ?? 0}
          hasLiked={Boolean(item.has_reacted)}
          isSaved={Boolean(item.is_bookmarked)}
          hasReposted={Boolean(item.has_reposted)}
          /*
            Two reasons the comment control is not drawn, held in one prop.

            The author's switch is the first and the one the prop is named
            after. The second is that nothing is wired to open a comment
            surface — no `onComment`, no `comments` — and a control with no
            handler is the dead glyph this feed shipped with: it was pressable,
            it looked live, and it did nothing at all.

            The tidier home for the second half is ActionBar itself, which
            could simply not render a control whose handler is absent; it does
            that for Repost already and does not for Comment or Share. That is
            a change in @momentum/interactions and is flagged in the handover
            rather than made here.
          */
          noComments={Boolean(item.no_comments) || !(onComment || comments)}
          hideShare={Boolean(item.hide_share)}
          isRepostable={item.is_repostable !== false}
          label={`${name}'s post`}
          onLike={(next) => onLike(item, next)}
          onSave={(next) => onSave(item, next)}
          onRepost={onRepost ? (next) => onRepost(item, next) : undefined}
          /*
            The comment control, which used to be a glyph that went nowhere.
            A caller's own `onComment` wins — it asked to handle this — and
            otherwise the card opens its own sheet, but ONLY when the zone
            supplied an api for it. Neither, and the control is not rendered:
            the bar already drops it for `no_comments` and this is the same
            rule for the same reason.
          */
          onComment={
            onComment
              ? () => onComment(item)
              : comments
                ? () => setCommentsOpen(true)
                : undefined
          }
          onShare={onShare ? () => onShare(item) : undefined}
        />
      </div>

      {comments && !item.no_comments && (
        <CommentSheet
          open={commentsOpen}
          onClose={() => setCommentsOpen(false)}
          postId={item.id}
          label={`${name}'s post`}
          api={comments}
          apiBase={apiBase}
          viewerId={viewerId}
          onCreated={(row) => onCommentCreated?.(item, row)}
          errorMessage={commentError}
        />
      )}
    </article>
  )
}

