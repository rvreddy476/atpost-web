"use client"

/**
 * Fetch this video's caption tracks and hand the player something it can load.
 *
 * The decisions are all in ./captions.ts — this is the effect, the same-origin
 * check and the one fallback that check exists for.
 *
 * ── Why a fallback at all, when same-origin is the normal case ────────────
 * `resolveUrl` puts this zone's basePath on a gateway path, so a track URL is
 * `/tube/v1/subtitles/…` and is served by this app's own proxy route, which
 * forwards the session cookie upstream. That is same-origin and it is what
 * ships. But the prefix comes from `NEXT_PUBLIC_API_BASE_URL`, which is an
 * environment variable, and a build that ever points it at an absolute API
 * origin would produce a cross-origin `<track src>` — which fails SILENTLY:
 * the element is created, the fetch goes out without the cookie, the gateway
 * refuses it, and the CC button appears and turns on nothing.
 *
 * Silent is the reason this is here. When the URL is not same-origin the VTT is
 * fetched through the api-client (which does carry credentials) and handed to
 * the player as a `blob:`, which has no origin problem because it is a handle
 * to bytes this document already holds. It costs one request per track and only
 * in the configuration that would otherwise be broken.
 *
 * ── The object URLs are revoked, and that is not tidiness ─────────────────
 * Every `createObjectURL` pins its Blob in memory until it is revoked or the
 * document goes away, and this hook re-runs on every video the rail navigates
 * to. Unrevoked, a session of watching would accumulate one transcript per
 * track per video for as long as the tab is open.
 */

import { useEffect, useMemo, useState } from "react"
import api from "@atpost/api-client"
import type { CaptionSource } from "@momentum/player"
import { resolveUrl } from "@/tube/resolveUrl"
import { fetchSubtitleTracks } from "./api"
import { sameOriginVtt, toCaptionSources } from "./captions"

export interface WatchCaptions {
  /** Ready for `<MomentumVideo captions={…}>`. Empty until they have landed. */
  tracks: CaptionSource[]
  /** The list request is in the air. Nothing on screen depends on it. */
  loading: boolean
}

const EMPTY: CaptionSource[] = []

/**
 * Fetch the VTT body ourselves, for the cross-origin case only.
 *
 * `responseType: "text"` because axios would otherwise try to parse a WebVTT
 * body as JSON, fail, and hand back a string it had already mangled. The Blob
 * is typed `text/vtt` — a Blob with no type produces an object URL the media
 * element refuses to treat as a text track.
 */
async function vttBlobUrl(src: string): Promise<string> {
  const res = await api.get<string>(src, { responseType: "text" })
  return URL.createObjectURL(new Blob([res.data ?? ""], { type: "text/vtt" }))
}

export function useCaptions(mediaId: string | undefined): WatchCaptions {
  const [rows, setRows] = useState<CaptionSource[]>(EMPTY)
  const [loading, setLoading] = useState(false)

  /**
   * The gateway-relative sources, resolved to this zone's prefix.
   *
   * Kept as its own state rather than folded into the effect below so the
   * blob pass has something stable to compare against, and so the normal case
   * — same-origin, no second request — is one `setState` and no extra work.
   */
  const [resolved, setResolved] = useState<CaptionSource[]>(EMPTY)

  useEffect(() => {
    setResolved(EMPTY)
    setRows(EMPTY)
    if (!mediaId) return

    let live = true
    setLoading(true)
    fetchSubtitleTracks(mediaId)
      .then((tracks) => {
        if (!live) return
        setResolved(toCaptionSources(mediaId, tracks, resolveUrl))
      })
      .catch(() => {
        /* A video whose transcript this viewer may not read, or a service that
           did not answer. Either way there are no captions to offer, which is
           a state the player draws as "no CC button" and not as an error. */
        if (live) setResolved(EMPTY)
      })
      .finally(() => {
        if (live) setLoading(false)
      })

    return () => {
      live = false
    }
  }, [mediaId])

  /**
   * Which of them, if any, the browser cannot load as they stand.
   *
   * Recomputed from `resolved` rather than remembered, so the answer cannot
   * outlive the list it was computed from.
   */
  const crossOrigin = useMemo(
    () =>
      typeof window === "undefined"
        ? []
        : resolved.filter((row) => !sameOriginVtt(row.src, window.location.href)),
    [resolved]
  )

  useEffect(() => {
    if (crossOrigin.length === 0) {
      setRows(resolved)
      return
    }

    let live = true
    const made: string[] = []

    Promise.all(
      resolved.map(async (row) => {
        if (sameOriginVtt(row.src, window.location.href)) return row
        try {
          const url = await vttBlobUrl(row.src)
          made.push(url)
          return { ...row, src: url }
        } catch {
          // One track that could not be fetched is one language missing from
          // the menu, not a video without captions.
          return null
        }
      })
    )
      .then((built) => {
        if (!live) return
        setRows(built.filter((row): row is CaptionSource => row !== null))
      })
      .catch(() => {
        if (live) setRows(EMPTY)
      })

    return () => {
      live = false
      for (const url of made) URL.revokeObjectURL(url)
    }
  }, [crossOrigin, resolved])

  return { tracks: rows, loading }
}
