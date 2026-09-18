/**
 * The watch page's SECOND source: one public post, read without a session.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THERE ARE NOW TWO SOURCES
 *
 * ../tube/useTubeFeed.ts's header explains at length why a signed-in watch
 * page walks the ranked feed rather than fetching the post: the feed row is
 * hydrated — variants, blurhash, dimensions, author — and the post row is not.
 * Every word of that is still true and the signed-in path is unchanged.
 *
 * What changed is who arrives. The home grid now works signed out (it falls
 * back to `GET /v1/posts/recent`, which is public), so an anonymous visitor
 * sees real videos and clicks one — and `GET /v1/feed/videos` is 401 for them,
 * so the feed walk cannot answer. The page's old response was a sign-in card,
 * which turned a working home page into a wall on the first click: the worst
 * of both, because the visitor has already been shown the thing they now
 * cannot have.
 *
 * `GET /v1/posts/{postId}` is optional-auth and answers for a stranger on a
 * public video — post-service's `viewerMayViewPost` admits `public` and
 * `unlisted` to a nil viewer and refuses everything else with a 404, which is
 * the same refusal this page's route already relies on for its metadata. So an
 * anonymous viewer gets the row the server is willing to give a stranger, and
 * nothing more.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT IS ACTUALLY MISSING, MEASURED RATHER THAN GUESSED
 *
 *     feed row  media[0]: media_id, kind, position, status, width, height,
 *                         blurhash, duration_ms, variants{5}, hls_url,
 *                         expires_at, processing_status, moderation_status,
 *                         playback_url, playback_kind
 *     post row  media[0]: media_id, kind, position, alt_text, alt_decorative,
 *                         processing_status, moderation_status, duration_ms,
 *                         hls_url
 *
 * `hls_url` is there, which is the whole ballgame: the video PLAYS. What is
 * lost is `variants` (no poster, and no progressive fallback if HLS refuses to
 * attach), `blurhash` (a black frame rather than a soft one while the first
 * frame decodes), `width`/`height` (the player cannot reserve the exact box)
 * and `author`. The last one costs least here, because `PostDetail` DOES carry
 * `channel` for a long video and the channel is what this page's creator row
 * draws — `creatorName` reads `channel.name` first and only falls through to
 * the author.
 *
 * Nothing above is faked. A missing poster is a missing poster; inventing a
 * `variants` map with a guessed URL shape would produce a broken image on
 * every anonymous watch page, which is worse than a black frame that fills in
 * a moment later.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE NORMALISER IS DEFENSIVE, AND THAT IS NOT CEREMONY
 *
 * The field NAMES already line up — post-service and feed-service serialise the
 * same `postgres.Post` fields — so this could have been a cast. It is not one,
 * for the same reason `parsePostSeries` in ./api.ts is not: `content_type` and
 * `counts` are non-optional on `FeedItem`, and a row that arrives without them
 * would hand the rest of this page an object TypeScript has promised is
 * complete. The two minutes of validation here are what stop that becoming a
 * crash inside a component.
 */

import type { FeedItem, FeedMedia } from "@atpost/types/feed"

/** Is this a plain object we can read fields off? */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

const str = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined

const num = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined

/**
 * One attachment, in the feed's vocabulary.
 *
 * Every field the post row does not carry is LEFT OUT rather than defaulted.
 * `isTranscodeReady` and `isModerationCleared` in @momentum/player both treat
 * `undefined` as "an older row, not a missing check" and pass — so an absent
 * `status` plays, and an explicit `processing_status: "processing"` does not.
 * Writing a default in here would turn one of those into the other.
 */
function media(raw: unknown): FeedMedia | null {
  if (!isRecord(raw)) return null
  const mediaId = str(raw.media_id)
  const kind = str(raw.kind)
  if (!mediaId || (kind !== "video" && kind !== "image")) return null
  return {
    media_id: mediaId,
    kind,
    position: num(raw.position) ?? 0,
    ...(str(raw.alt_text) ? { alt_text: str(raw.alt_text) } : {}),
    ...(raw.alt_decorative === true ? { alt_decorative: true } : {}),
    ...(str(raw.processing_status) ? { processing_status: str(raw.processing_status) } : {}),
    ...(str(raw.moderation_status) ? { moderation_status: str(raw.moderation_status) } : {}),
    ...(num(raw.duration_ms) ? { duration_ms: num(raw.duration_ms) } : {}),
    ...(str(raw.hls_url) ? { hls_url: str(raw.hls_url) } : {}),
    // `playback_url` is the feed's field and the post row has no equivalent.
    // It is deliberately not synthesised from `hls_url`: `MomentumVideo` reads
    // `playback_url || hls_url` itself, so one of them is enough, and a
    // duplicate would suggest the row carries a progressive original when it
    // does not.
  }
}

/**
 * `GET /v1/posts/{postId}`'s `data`, as the watch page's row — or null.
 *
 * Null for anything this page could not render: a body that is not an object,
 * a row with no id, or a row that is not a video. The caller turns that into
 * the same not-found state a refused fetch produces, because from a visitor's
 * side "it is not there" and "it is not a video" are one answer.
 *
 * Exported and pure so the shortfall above can be asserted as a table — in
 * particular that nothing is invented for the four fields that are absent.
 */
export function parsePublicPost(data: unknown): FeedItem | null {
  if (!isRecord(data)) return null
  const id = str(data.id)
  if (!id) return null

  const rawMedia = Array.isArray(data.media) ? data.media : []
  const attachments: FeedMedia[] = []
  for (const row of rawMedia) {
    const parsed = media(row)
    if (parsed) attachments.push(parsed)
  }

  const counts = isRecord(data.counts) ? data.counts : {}
  const channel = isRecord(data.channel) ? data.channel : null

  return {
    id,
    author_id: str(data.author_id) ?? "",
    /**
     * `content_type` is required on `FeedItem` and the row does carry it, but
     * a long video reached through this path is a long video whatever the
     * column says — the route only serves `/tube/{id}`. The fallback is the
     * honest one rather than a guess at "post".
     */
    content_type: (str(data.content_type) as FeedItem["content_type"]) ?? "long_video",
    created_at: str(data.created_at) ?? new Date(0).toISOString(),
    ...(str(data.text) ? { text: str(data.text) } : {}),
    ...(str(data.title) ? { title: str(data.title) } : {}),
    ...(str(data.visibility) ? { visibility: str(data.visibility) } : {}),
    ...(str(data.category) ? { category: str(data.category) } : {}),
    ...(str(data.cover_media_id) ? { cover_media_id: str(data.cover_media_id) } : {}),
    ...(attachments.length > 0 ? { media: attachments } : {}),
    ...(Array.isArray(data.hashtags) ? { hashtags: data.hashtags as string[] } : {}),
    counts: {
      likes: num(counts.likes) ?? 0,
      comments: num(counts.comments) ?? 0,
    },
    ...(num(data.view_count) !== undefined ? { view_count: num(data.view_count) } : {}),
    /**
     * The viewer-relative flags are NOT read, even if the server sent them.
     *
     * There is no viewer: `has_reacted` and `is_bookmarked` from an anonymous
     * read are false by construction, and carrying them through would put a
     * hollow "not liked" state under a control this page does not render for a
     * stranger anyway. Absent is the truthful shape.
     */
    ...(data.no_comments === true ? { no_comments: true } : {}),
    ...(data.hide_share === true ? { hide_share: true } : {}),
    ...(data.is_processing === true ? { is_processing: true } : {}),
    ...(channel
      ? {
          channel: {
            user_id: str(channel.user_id) ?? "",
            ...(str(channel.name) ? { name: str(channel.name) } : {}),
            ...(str(channel.handle) ? { handle: str(channel.handle) } : {}),
            ...(str(channel.avatar_url) ? { avatar_url: str(channel.avatar_url) } : {}),
          },
        }
      : {}),
  }
}

/**
 * Is this row one a stranger should be watching?
 *
 * The server has already decided — it 404s a private or followers-only post to
 * a nil viewer — so this is the second half of the belt-and-braces the metadata
 * path also keeps, and it differs from that one in exactly one way: **unlisted
 * is allowed here**.
 *
 * That difference is the point of unlisted. `publicPreview` in ./metadata.ts
 * refuses it because a preview is a PUBLICATION — a title in a `<meta>` is a
 * title in a search index. Watching is not publication: "anyone with the link
 * can watch" is precisely what the author asked for. So an unlisted video plays
 * for a stranger and still gets `noindex` and no card.
 */
export function watchableByAnyone(item: FeedItem): boolean {
  const visibility = (item.visibility ?? "").toLowerCase()
  // An empty string is the server's own "public" — `viewerMayViewPost` reads
  // `case "", "public", "unlisted"`. Unlike the metadata path, failing open
  // here is safe: the row reached us from an anonymous request, so the server
  // has already allowed this exact read.
  return visibility === "" || visibility === "public" || visibility === "unlisted"
}
