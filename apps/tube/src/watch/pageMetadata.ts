/**
 * `generateMetadata` for the watch page, written once for its two addresses.
 *
 * `/tube/{postId}` and `/tube/watch/{postId}` are the same page — see the head
 * of app/watch/[postId]/page.tsx for why both exist — so the tags they emit
 * must be identical, including the canonical URL, which both point at the FIRST
 * address. Two copies of this would be two chances for a notification's deep
 * link to unfurl differently from a copied one.
 *
 * Server-only: it reads `headers()`. It has no "use client" and must not get
 * one.
 *
 * ── Where the absolute origin comes from ──────────────────────────────────
 * An Open Graph URL has to be absolute, and this app is deployed behind a
 * multi-zone shell, so it cannot know its own public address from a constant.
 * `NEXT_PUBLIC_SITE_URL` is honoured when it is set — a deployment that knows
 * its canonical host should say so, once — and otherwise the request's own
 * `host` is used, with `x-forwarded-proto` deciding the scheme, because behind
 * a proxy the connection this process sees is plain HTTP while the public URL
 * is HTTPS. Getting that backwards emits `http://` canonicals for an HTTPS
 * site, which search engines treat as a different site.
 */

import { headers } from "next/headers"
import type { Metadata } from "next"
import { BRAND } from "@momentum/brand"
import { ZONE } from "@/zone"
import { watchMetadata } from "./metadata"
import { fetchPublicPost } from "./serverPost"

/** The site-level description, and the fallback for a video that has none. */
const SITE_DESCRIPTION = `Long video on ${BRAND.name}.`

/**
 * Scheme and host, no trailing slash.
 *
 * Localhost is the last resort rather than an error: a preview with a wrong
 * origin is a cosmetic defect in development, and throwing here would take the
 * whole page down for it.
 */
export async function siteOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (configured) return configured.replace(/\/+$/, "")

  const list = await headers()
  const host = list.get("x-forwarded-host") || list.get("host")
  if (!host) return "http://localhost:3012"
  const proto = list.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https")
  return `${proto}://${host}`
}

/**
 * The tags for one video.
 *
 * Never throws and never blocks the page: `fetchPublicPost` answers null for
 * every failure, and `watchMetadata` turns null into the site's own card with
 * `noindex`. A malformed id does not even get that far — the route 404s on it
 * before this is called.
 */
export async function watchPageMetadata(postId: string): Promise<Metadata> {
  const [origin, post] = await Promise.all([siteOrigin(), fetchPublicPost(postId)])
  return watchMetadata({
    post,
    postId,
    origin,
    basePath: ZONE,
    siteName: `${BRAND.name} Tube`,
    fallbackDescription: SITE_DESCRIPTION,
  })
}
