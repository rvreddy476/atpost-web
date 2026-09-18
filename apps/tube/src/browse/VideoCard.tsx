"use client"

/**
 * One cell of the browse grid: a poster, a title, and the way in.
 *
 * ── One anchor per DESTINATION, and never one inside another ──────────────
 * This card used to be a single anchor wrapping everything, and the note here
 * said the channel name "will want to be its own link on the day there is a
 * channel page to send it to. `GET /v1/channels/{handle}` exists; the page
 * does not." The page exists now — `/tube/@{handle}` — so the name is a link,
 * and the structure changed to make that legal rather than the link being
 * nested into the existing anchor.
 *
 * What has NOT changed is the rule that produced the old shape: a control
 * inside a control is invalid, browsers disagree about what a click on the
 * inner one does, and screen readers disagree about how to announce it. So
 * the card is now two SIBLING anchors and no nesting:
 *
 *   · the poster and the title, one anchor, going to the video. Everything
 *     inside it is `aria-hidden` and `cardLabel` in ../tube/video.ts is what
 *     a screen reader announces.
 *   · the channel name, a second anchor, going to the channel.
 *
 * Two tab stops, because there are genuinely two places to go. That is the
 * opposite of the three-stops-for-one-act the old note was avoiding. The
 * counts and the age stay outside both anchors, as text.
 *
 * ── Zero video elements mount here, and that is the design ────────────────
 * A poster is one image request. A 720p long-video segment set is tens of
 * megabytes, and these are 3-minute videos rather than 30-second ones — the
 * whole point of the "expand for the full video" split is that the grid is the
 * cheap surface. If each card were a player, twelve cards would attach hls.js,
 * fetch a master playlist, fetch a child playlist and start buffering, for
 * content nobody has chosen. That is measured behaviour rather than a worry:
 * apps/reels' Reel.tsx records "a page of twelve was observed with four reels
 * all at readyState 4 before anybody had swiped once."
 *
 * Which is also why this page needs no `viewportInset`. The inset exists so
 * the autoplay coordinator and the dwell tracker do not credit pixels hidden
 * behind sticky chrome — and with no coordinator and no watch measurement on
 * this surface there is no number for a wrong inset to corrupt.
 *
 * The alternative considered and rejected: play the hovered card. It is one
 * player rather than twelve, but it costs a real inset, a keyboard story for
 * what "focused" means on a grid, and a video that starts on a mouse passing
 * over it — and it buys a preview of something one click away from playing
 * properly anyway.
 *
 * ── The link is `next/link`, and this is the one place that is safe ───────
 * Everything the chrome links to is another ZONE and must be a plain `<a>`
 * (see @momentum/chrome's NavItem.tsx and zone.ts). This is the opposite case:
 * `/tube/{id}` is served by this very app, so a client-side transition is both
 * correct and the reason opening a video feels instant — the browse page's
 * layout, the chrome and the session all stay mounted.
 *
 * `videoHref` returns "/{id}" and NOT "/tube/{id}" because Next adds the
 * basePath itself. ../tube/video.ts has the note and a test.
 */

import { useState } from "react"
import Link from "next/link"
import { Heart, MessageCircle, VideoOff } from "lucide-react"
import type { FeedItem } from "@atpost/types/feed"
import { Avatar, BlurhashCanvas, relativeTime } from "@momentum/content"
import { VideoCardMenu } from "@/menu/VideoCardMenu"
import type { CardActions } from "@/menu/useCardActions"
import {
  cardLabel,
  commentsLabel,
  creatorName,
  isWatchable,
  likesLabel,
  videoBlurhash,
  videoDuration,
  videoHref,
  videoMedia,
  videoPoster,
  videoTitle,
  viewsLabel,
} from "@/tube/video"
import { itemChannelHref } from "@/tube/channels"

export function VideoCard({
  item,
  position,
  total,
  hideCreator = false,
  footer,
  actions,
  onFeedback,
}: {
  item: FeedItem
  /** 1-based rank, for the accessible name only. */
  position: number
  total: number
  /**
   * Drop the channel line — for a grid that is already ABOUT one channel.
   *
   * The channel page passes this, and it is not merely tidiness there: the
   * rows that page renders come from `/v1/posts/by-author`, which sends bare
   * `PostDetail` with no `channel` object on it at all. `creatorName` would
   * therefore fall through to "Someone" under every card on a page whose
   * heading is the creator's name. Saying nothing is better than saying that.
   */
  hideCreator?: boolean
  /**
   * A row's own line under the counts: the history page's resume line and
   * Remove, the saved page's Remove from saved.
   *
   * A slot rather than a second card component, and a slot INSIDE the `<li>`
   * rather than a sibling of it: this card IS the list item, so a page that
   * wanted to draw something under it had two bad choices, a nested list per
   * row or a copy of this file. The slot sits outside both anchors with the
   * counts, so a button in it is never a control inside a control, which is
   * the rule the header is about.
   */
  footer?: React.ReactNode
  /**
   * The grid's shared menu handlers, or absent for no menu at all.
   *
   * Absent is a real and correct state, not a shortcut: a signed-out visitor
   * has no Watch later, no playlists, no bookmarks and no ranker to steer, so
   * every row the menu could draw would be a control that could not work. The
   * page passes nothing and `VideoCardMenu` renders nothing — the same rule
   * @momentum/content's menu follows, which the header of ../menu/cardMenu.ts
   * restates: a row whose action the surface did not wire is not shown.
   *
   * One object for a whole grid rather than per-card state. ../menu/
   * useCardActions.ts has the argument; the short version is that twelve cards
   * each holding their own copy of "is this in Watch later" is twelve caches
   * that disagree the moment one of them writes.
   */
  actions?: CardActions
  /**
   * "Not interested" / "Don't recommend this channel" was pressed.
   *
   * Handed to the PAGE and not done here, because the honest response is to
   * take the row out of the list — and the list belongs to the page. The page
   * removes it, calls `actions.feedback`, says what happened, and puts the row
   * back if the server refused. ../menu/useCardActions.ts records the split;
   * a card that hid itself would leave the page's item count disagreeing with
   * what is on screen, which is a grid nobody can debug.
   *
   * Absent means the two rows are not offered at all.
   */
  onFeedback?: (target: "post" | "author") => void
}) {
  const media = videoMedia(item)
  const blurhash = videoBlurhash(media)
  const [posterFailed, setPosterFailed] = useState(false)

  // Read once per render rather than held in state: a signature that expires
  // while the page is open turns this null on the next render, and the
  // blurhash underneath is already the right thing to be looking at.
  const poster = posterFailed ? null : videoPoster(media)

  const duration = videoDuration(media)
  const likes = likesLabel(item)
  const comments = commentsLabel(item)
  const watchable = isWatchable(item)
  const channelLink = itemChannelHref(item)
  const title = videoTitle(item)

  /**
   * The three-dot menu, or nothing.
   *
   * Built here rather than passed in as a node so that every grid in the zone
   * gets the SAME menu from the same handlers: a page that assembled its own
   * would be the place the rows quietly diverge. A page that wants no menu
   * passes no `actions`, which is the correct state for a signed-out visitor —
   * every row it could draw needs a session.
   *
   * The two list rows are dropped when the page could not identify the viewer:
   * `signedIn` is false for an anonymous browser, and the bookmark, the
   * playlists and the ranker all key on an account.
   */
  const menu = actions?.signedIn ? (
    <VideoCardMenu
      label={title}
      isOwn={actions.isOwn(item)}
      inWatchLater={actions.watchLater.has(item.id)}
      isSaved={actions.saved.has(item.id) || item.is_bookmarked === true}
      playlists={actions.playlists}
      playlistsLoading={actions.playlistsLoading}
      onOpen={actions.prime}
      onWatchLater={() => actions.toggleWatchLater(item.id)}
      onSaveToPlaylist={(playlistId) => actions.saveToPlaylist(playlistId, item.id)}
      onCreatePlaylist={(name) => actions.createAndSave(name, item.id)}
      onSaveBookmark={() => actions.toggleBookmark(item)}
      onShare={() => actions.share(item, title)}
      // Absent when the page did not wire it, which drops the two rows rather
      // than rendering controls that would do nothing. See the prop's note.
      onFeedback={onFeedback ? (target) => onFeedback(target) : undefined}
      onReport={(reason, details) => void actions.report(item.id, reason, details)}
    />
  ) : null

  return (
    <li>
      <Link
        href={videoHref(item)}
        aria-label={cardLabel(item, position, total)}
        className={[
          "group block rounded-mo",
          "outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-mo",
        ].join(" ")}
      >
        {/* 16:9 whatever the source is, and that is a real decision rather
            than a default. `postclassify.Classify` sends every LANDSCAPE clip
            to long_video regardless of length, and lets an author mark a
            portrait one long_video explicitly — so this feed genuinely mixes
            1080x1920 and 1920x1080. `object-cover` crops both to one shape so
            a row of cards is a row, not a staircase. */}
        <div className="relative aspect-video w-full overflow-hidden rounded-mo bg-mo-sunken">
          {blurhash && <BlurhashCanvas hash={blurhash} className="h-full w-full" />}

          {poster && (
            /* A signed, 300-second, already-sized URL is exactly the case
               next/image is wrong for: the optimizer caches the URL
               server-side, the cached copy outlives the credential inside it,
               and it then serves an error for a picture it can no longer
               re-fetch. @momentum/content's PostMedia has the full argument. */
            // eslint-disable-next-line @next/next/no-img-element -- see above.
            <img
              src={poster}
              // Decoration. The link's own `aria-label` is the accessible name
              // for this whole cell, and an alt here would be announced twice.
              alt=""
              loading="lazy"
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-200 ease-mo group-hover:scale-[1.02]"
              // The commonest cause is a signature that expired between the
              // fetch and the paint. There is nothing to repair — the next
              // page carries fresh URLs — so it falls back to the blurhash
              // rather than leaving a broken-image glyph in the grid.
              onError={() => setPosterFailed(true)}
            />
          )}

          {/* A long_video with no media at all is a real row on this feed —
              two of the six the dev stack returns. It is NOT dropped from the
              grid: somebody's own video vanishing with nothing on screen to
              say why is worse than a plate that says so. The card still opens,
              because the watch page has room for the sentence and this does
              not. ../tube/video.ts has the whole argument. */}
          {!watchable && (
            <span
              aria-hidden
              className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-mo-sunken/80 text-mo-body"
            >
              <VideoOff className="h-6 w-6" />
              <span className="text-[11px] font-semibold">No video attached</span>
            </span>
          )}

          {duration && (
            <span
              aria-hidden
              className="absolute bottom-1.5 right-1.5 rounded-mo-sm bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white"
            >
              {duration}
            </span>
          )}
        </div>

        {/* The title block sits UNDER the picture rather than in a scrim over
            it, which is the one real difference from the reels tile. A reel's
            caption is incidental to a 9:16 frame; a long video's title is the
            thing being chosen between, it is up to 100 characters, and two
            lines of it over somebody's video frame is unreadable however dark
            the scrim. Text on the page's own ground also means the palette's
            contrast measurements actually apply to it. */}
        <div aria-hidden className="mt-2">
          <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug text-mo-ink">
            {title}
          </h3>
        </div>
      </Link>

      {/* ── Outside the video's anchor ─────────────────────────────────────
          Everything below is a sibling of the link above, never a child of
          it: the channel name is its own destination, the menu is a button,
          and a control inside a control is invalid. See the header.

          ── The avatar sits beside the CHANNEL NAME, not beside the title ──
          YouTube puts it beside the title, which needs the title to be its
          own anchor so the picture can sit in a column next to it. That would
          make the card two anchors to ONE destination — two tab stops for one
          act, which is exactly what the header's rule is against. Beside the
          name it is the same 40px picture doing the same job (whose channel is
          this) with one tab stop, and the poster-plus-title anchor stays the
          big target it is.

          `size="md"` is 40px where the brief said 36. @momentum/content's
          Avatar offers 32 and 40, and getting 36 means overriding the
          component's own box with a class that only wins by stylesheet order —
          a silent, order-dependent 8px. 40 is a token; 36 would be a guess
          that breaks the day Tailwind sorts differently. */}
      <div className="mt-2 flex items-start gap-3">
        {!hideCreator && (
          <Avatar
            // Decoration: the channel link beside it is the accessible name,
            // and `Avatar` renders an empty alt for exactly this reason.
            name={creatorName(item)}
            id={item.channel?.user_id ?? item.author_id}
            // A real signed URL when the channel has one. An author's
            // `avatar_media_id` is NOT a URL and the one derivable from it is
            // unsigned and 403s, so there is nothing to fall back to — the
            // initial is the fallback. ../chrome/TubeRail.tsx has the same note.
            src={item.channel?.avatar_url ?? undefined}
            size="md"
          />
        )}

        <div className="min-w-0 flex-1">
          {!hideCreator &&
            (channelLink ? (
              <Link
                href={channelLink}
                className="block truncate rounded-mo-sm text-sm text-mo-body transition-colors duration-150 ease-mo hover:text-mo-ink outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-mo"
              >
                {creatorName(item)}
              </Link>
            ) : (
              /* No channel on the row, so no address to link to. A name that
                 is not a link is better than a link to "/@" — see `channelRef`
                 in ../tube/channels.ts, which is where that null comes from. */
              <p className="truncate text-sm text-mo-body">{creatorName(item)}</p>
            ))}
          <p aria-hidden className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-mo-body">
            <span>{viewsLabel(item)}</span>
            <span>·</span>
            <span>{relativeTime(item.created_at)}</span>
            {/* Counts and NOT buttons. Like and follow live one click away on
                the watch page, where the state machines, the optimistic
                rollbacks and the analytics already are. A second set here
                would be a second implementation of each. Save, Watch later,
                playlists, Share and the negative signals are on the MENU,
                which is a different thing from a row of toggles: one control,
                opened deliberately, with a label on every act. */}
            {likes && (
              <span className="inline-flex items-center gap-1">
                <Heart className="h-3 w-3" />
                <span className="tabular-nums">{likes}</span>
              </span>
            )}
            {comments && (
              <span className="inline-flex items-center gap-1">
                <MessageCircle className="h-3 w-3" />
                <span className="tabular-nums">{comments}</span>
              </span>
            )}
          </p>
        </div>

        {menu}
      </div>

      {footer}
    </li>
  )
}
