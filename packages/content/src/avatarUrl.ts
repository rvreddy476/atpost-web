/**
 * Where a person's picture actually is — the one rule, as arithmetic.
 *
 * ── The API sends avatars THREE different ways, and this reconciles them ──
 * Checked field by field against the running services rather than inferred:
 *
 *   · `GET /v1/feed/home` — the item's `author` carries `avatar_media_id` and
 *     NOTHING else. feed-service's own decode struct (`publicProfile` in
 *     internal/service/hydration.go) drops profile-service's `avatar_url` on
 *     the floor, so a media id is all a feed card is ever given.
 *   · the same item's `channel` carries `avatar_url` and NO id — a signed,
 *     absolute media-host URL that post-service resolved per request and that
 *     expires in five minutes.
 *   · `POST /v1/profiles/batch` and `GET /v1/profiles/:userId` carry BOTH, and
 *     their `avatar_url` is the gateway-relative `/v1/media/{id}/serve/avatar`
 *     — stable, unsigned, and the same string this file builds from an id.
 *
 * So a caller may hold an id, a relative path, an absolute URL, or nothing,
 * and every surface in the product would otherwise decide for itself. It
 * decides here instead, and it is pure: no React, no DOM, no network, no
 * `process.env`.
 *
 * ── Why `avatar` and never `thumb_150` ────────────────────────────────────
 * `avatar` is a server-resolved ALIAS, not a stored rendition. media-service
 * tries `thumb_150 → small_480 → medium_1080` and falls through to the
 * original (`avatarRenditionLadder`, internal/service/media.go), because the
 * image pipeline SKIPS a rendition larger than the source — so a URL that
 * named `thumb_150` itself would 404 for every avatar uploaded smaller than
 * 150px, and for every asset whose processing never finished. A caller that
 * names a real variant gets that variant or an error, never a substitute.
 * The alias is the only name that is safe to write down.
 *
 * ── Anonymous readers get one, and that is deliberate ─────────────────────
 * `GET /v1/media/{id}/serve/{variant}` is registered with no auth middleware,
 * and media-service's profile authority sets `allowAnonymous` (delivery/authz
 * `NewHTTPProfileAuthorizer`) precisely so a public profile photo renders for
 * a signed-out reader. The owner's `who_can_see_profile_photo` still decides;
 * a refusal is a 404 and the caller falls back to initials. Post and chat
 * media keep their authenticated-only rule — this widening is profile-only.
 *
 * ── The base ──────────────────────────────────────────────────────────────
 * A zone is served under a basePath and the `/v1/:path*` rewrite lives under
 * it too, so a root-relative `/v1/media/…` misses the zone entirely and 404s.
 * That is not hypothetical: it is the bug apps/commerce's `lib/media.ts` was
 * written to fix, with every product photograph in the shop broken. The base
 * is therefore an ARGUMENT and never read from the environment here — see the
 * same argument in @momentum/chrome's zone.ts, which this follows.
 */

/** The rendition alias. Never a real variant name — see the note above. */
export const AVATAR_VARIANT = "avatar"

/** `/v1/media/{id}/serve/avatar`, unprefixed. The shape profile-service sends. */
export function avatarMediaPath(mediaId: string): string {
  return `/v1/media/${encodeURIComponent(mediaId)}/serve/${AVATAR_VARIANT}`
}

export interface AvatarSource {
  /**
   * A URL the server already resolved, wherever it came from. Absolute
   * (a signed media-host URL, as `channel.avatar_url` is) or root-relative
   * (`/v1/media/…`, as profile-service's is) — both are handled.
   */
  url?: string | null
  /** An avatar asset id, when a URL was not sent. */
  mediaId?: string | null
}

/**
 * The `src` to put on an `<img>`, or null when there is genuinely no picture.
 *
 * Null rather than a placeholder path: a component that receives null draws
 * initials, and a component handed a URL that will 404 draws a broken image
 * for one paint and then draws initials. Null is the same answer, sooner.
 *
 * A server-sent URL wins over an id. The two disagree only where the server
 * picked a rendition for us (a channel's signed `small_480`), and its choice
 * is better informed than ours — it knows what that asset actually has.
 */
export function avatarSrc(source: AvatarSource, base = ""): string | null {
  const prefix = base.replace(/\/$/, "")
  const url = (source.url ?? "").trim()
  if (url) {
    // Root-relative means "on this origin, under this zone". Anything else is
    // already absolute — a media-host URL, signed and complete — and prefixing
    // one would break a link that works.
    return url.startsWith("/") ? `${prefix}${url}` : url
  }
  const mediaId = (source.mediaId ?? "").trim()
  if (!mediaId) return null
  return `${prefix}${avatarMediaPath(mediaId)}`
}
