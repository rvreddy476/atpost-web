"use client"

/**
 * What the video will look like, before it exists.
 *
 * Two previews, because a long video is met in two places and they crop
 * differently: the CARD on the browse grid and on a channel, where the cover
 * is 16:9 and the title is two lines and then gone; and the WATCH HEADER,
 * where the title is whole and the channel and the counts sit under it.
 *
 * ── Drawn here rather than by importing the real card ─────────────────────
 * `../browse` and `../watch` own those components and this agent does not, so
 * importing one and feeding it a half-built post would couple this file to a
 * shape somebody else is changing this week. What matters for a review step is
 * not that the markup is the same file — it is that the CROP and the TRUNCATION
 * are the same, because those are the two things that surprise people. A
 * `aspect-video` box with `object-cover` and a two-line clamp is the whole of
 * that, and it is four lines of CSS that cannot drift silently.
 *
 * ── Deliberately not interactive ──────────────────────────────────────────
 * No links, no buttons, nothing focusable. It is a picture of a thing that
 * does not exist yet, and a tab stop that goes nowhere on the last step before
 * Publish is a tab stop somebody will press Enter on.
 */

import { VISIBILITY_OPTIONS, type VideoDraft } from "./fields"

interface Props {
  draft: VideoDraft
  /** The local blob/data URL from the cover picker, or null for the auto one. */
  coverUrl: string | null
  channelName: string
  /** `@handle`, or null when the channel has none. */
  channelRef: string | null
}

export function ReviewPreview({ draft, coverUrl, channelName, channelRef }: Props) {
  const title = draft.title.trim() || "Untitled"
  const audience = VISIBILITY_OPTIONS.find((o) => o.value === draft.visibility)

  return (
    <div className="space-y-6">
      <section aria-labelledby="preview-card-heading">
        <h4
          id="preview-card-heading"
          className="text-xs uppercase tracking-mo-eyebrow text-mo-body"
        >
          On the grid
        </h4>
        <div className="mt-2 max-w-xs">
          <CoverBox url={coverUrl} />
          <div className="mt-2 flex gap-3">
            <span
              aria-hidden
              className="mt-0.5 h-8 w-8 shrink-0 rounded-mo-pill bg-mo-raised"
            />
            <div className="min-w-0">
              {/*
                Two lines and then an ellipsis, which is what the grid does.
                Somebody whose title reads "How I Rebuilt My Entire…" on the
                card wants to know that here, not after publishing.
              */}
              <p className="line-clamp-2 text-sm font-semibold leading-snug text-mo-ink">
                {title}
              </p>
              <p className="mt-1 truncate text-xs text-mo-body">
                {channelName}
                {channelRef ? ` · @${channelRef}` : null}
              </p>
              <p className="text-xs text-mo-body">No views · just now</p>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="preview-watch-heading">
        <h4
          id="preview-watch-heading"
          className="text-xs uppercase tracking-mo-eyebrow text-mo-body"
        >
          On the watch page
        </h4>
        <div className="mt-2 rounded-mo border border-mo bg-mo-sunken p-4">
          <p className="font-mo-display text-lg leading-tight tracking-mo-display text-mo-ink">
            {title}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-mo-body">
            <span>{channelName}</span>
            {draft.category ? <span>· {draft.category}</span> : null}
            {/*
              The audience is a WORD and not a coloured pill, because the
              whole point of restating it here is that somebody reads it.
            */}
            {audience && audience.value !== "public" ? (
              <span className="rounded-mo-pill border border-mo px-2 py-0.5">
                {audience.label}
              </span>
            ) : null}
          </div>
          {draft.hashtags.length > 0 ? (
            <p className="mt-2 truncate text-xs text-mo-body">
              {draft.hashtags.map((tag) => `#${tag}`).join(" ")}
            </p>
          ) : null}
          {draft.description.trim() ? (
            <p className="mt-3 line-clamp-2 whitespace-pre-line text-xs text-mo-body">
              {draft.description.trim()}
            </p>
          ) : (
            <p className="mt-3 text-xs italic text-mo-muted-lg">No description</p>
          )}
        </div>
      </section>
    </div>
  )
}

/**
 * The 16:9 box, cropped exactly as the card crops it.
 *
 * `object-cover` on an `aspect-video` box: a portrait cover loses its top and
 * bottom here in precisely the way it will lose them on the grid. Showing it
 * letterboxed would be a kinder picture of a worse outcome.
 */
function CoverBox({ url }: { url: string | null }) {
  if (!url) {
    return (
      <div className="flex aspect-video w-full items-center justify-center rounded-mo bg-mo-sunken text-xs text-mo-body">
        Cover made from the video
      </div>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      className="aspect-video w-full rounded-mo bg-mo-sunken object-cover"
    />
  )
}
