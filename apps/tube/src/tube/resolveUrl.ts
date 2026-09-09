/**
 * Put this zone's prefix on a gateway path.
 *
 * The same function apps/social and apps/reels hand their players, for the
 * same reason, and it is worth stating again because getting it wrong produces
 * a symptom that points nowhere: the feed hands out `hls_url` /
 * `playback_url` as `/v1/media/{id}/hls/master.m3u8`, and the master
 * playlist's children are origin-absolute paths of the same shape. Both
 * resolve against the ORIGIN, so under `basePath: "/tube"` they land on
 * `/v1/...` — a path this zone does not serve. The video then fetches its
 * master playlist, reports no error, and shows a black frame for ever.
 *
 * ── It must handle an ALREADY-ABSOLUTE url ────────────────────────────────
 * The obvious implementation is `url.startsWith("/v1/")`, and it silently does
 * nothing for the case that matters. hls.js resolves each child playlist
 * against the master's url while PARSING the manifest, so by the time a loader
 * sees one it is `http://localhost:3012/v1/media/...` — a full url that starts
 * with "http", not with "/v1/". Every child request then goes to the origin
 * unprefixed and 404s.
 *
 * So this works on the parsed pathname, and only for this origin. The segment
 * urls inside a child playlist are absolute links to the MEDIA host, already
 * signed, and prefixing one would break it — which is why the player applies
 * this to playlist requests only.
 */
export function resolveUrl(url: string): string {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL || ""
  if (!base) return url
  try {
    const parsed = new URL(url, window.location.href)
    if (parsed.origin !== window.location.origin) return url
    if (!parsed.pathname.startsWith("/v1/")) return url
    parsed.pathname = `${base}${parsed.pathname}`
    return parsed.toString()
  } catch {
    return url
  }
}
