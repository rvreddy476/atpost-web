/**
 * What a shared channel link should unfurl into.
 *
 * ── Pure, and separated from the route for exactly one reason ─────────────
 * `app/channel/[handle]/page.tsx` is a server component that awaits params,
 * awaits a fetch and then builds an object. Only the last of those three is
 * interesting and only the last can be wrong in a way nobody notices — a
 * missing `og:url`, a description that leaks a newline, a title that says
 * "undefined" for a channel with no name. So the object-building is here,
 * with no I/O in it, and ./metadata.test.ts asserts every field.
 *
 * ── The zone prefix is put back on BY HAND, and it has to be ──────────────
 * `channelHref` in ../tube/channels.ts returns "/@ada" and not "/tube/@ada",
 * because `next/link` adds this zone's basePath itself. A canonical URL and an
 * `og:url` have no Next in front of them: they are read by a crawler, a chat
 * client, a search index. "/@ada" would be a link to the wrong app or to
 * nothing. This is the same trap ../menu/useCardActions.ts records from the
 * share side, and the same correction.
 */

import type { Metadata } from "next"
import { BRAND } from "@momentum/brand"
import { ZONE } from "@/zone"
import { atHandle, bareHandle, type TubeChannel } from "@/tube/channels"

/**
 * The origin this app is served from, for absolute metadata URLs.
 *
 * ── Why this is an env var with a localhost default ───────────────────────
 * Nothing in this repository declares a public origin — there is no
 * `metadataBase`, no `SITE_URL`, no canonical host in any config — because
 * every zone is composed behind the shell and has never needed to know its own
 * address. Metadata is the first thing that does: a crawler cannot resolve
 * "/tube/@ada" against nothing.
 *
 * `NEXT_PUBLIC_SITE_URL` is read where a deployment can set it, and the
 * fallback is `http://localhost:3000` — which is the value Next itself uses
 * for an unset `metadataBase`, so an unconfigured deployment is no worse off
 * than it was, and a configured one is right. It belongs in apps/tube/.env
 * .example beside `API_GATEWAY_URL`; that file is another agent's to edit, so
 * this note is the handoff.
 */
export function siteOrigin(): string {
  const raw = (process.env.NEXT_PUBLIC_SITE_URL || "").trim()
  // A trailing slash would produce "https://host//tube/@ada".
  return (raw || "http://localhost:3000").replace(/\/+$/, "")
}

/**
 * The absolute, shareable address of a channel.
 *
 * The origin is re-normalised here rather than trusted to have come from
 * `siteOrigin`: a caller passing one in — a test, or a deployment that
 * resolves its host some other way — should not be able to produce
 * "https://host//tube/@ada" by ending it with a slash.
 */
export function channelUrl(ref: string, origin = siteOrigin()): string {
  return `${origin.replace(/\/+$/, "")}${ZONE}/@${encodeURIComponent(bareHandle(ref) ?? ref)}`
}

/**
 * The longest description worth emitting.
 *
 * Roughly what Open Graph consumers show before they truncate for you, and
 * truncating here means the cut lands on a word boundary with an ellipsis
 * rather than mid-syllable wherever the reader's client decided.
 */
const DESCRIPTION_MAX = 200

/**
 * An about turned into one line of description, or null.
 *
 * Newlines and runs of whitespace are collapsed because a description is a
 * single-line attribute in the markup: a raw newline inside one is at best
 * ignored and at worst truncates the tag. Null rather than an empty string
 * for a channel with nothing to say, so the caller can fall back to a
 * sentence rather than emitting `description=""`.
 */
export function channelDescription(channel: TubeChannel): string | null {
  const flat = (channel.about ?? "").replace(/\s+/g, " ").trim()
  if (!flat) return null
  if (flat.length <= DESCRIPTION_MAX) return flat
  const cut = flat.slice(0, DESCRIPTION_MAX)
  const lastSpace = cut.lastIndexOf(" ")
  // A word boundary if there is a sensible one, a hard cut if the text is one
  // very long token.
  return `${(lastSpace > DESCRIPTION_MAX * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}

/** The title a tab, a bookmark and a link preview all show. */
export function channelTitle(channel: TubeChannel): string {
  return channel.name?.trim() || atHandle(channel.handle) || "Channel"
}

/**
 * The full metadata for a channel that exists.
 *
 * ── `og:type` is `profile`, not `website` ─────────────────────────────────
 * A channel IS a person's presence, and `profile` is the Open Graph type that
 * carries `profile:username` — which is the handle, the one identifier this
 * platform addresses a channel by. Consumers that do not understand `profile`
 * fall back to treating it as a page, so nothing is lost by being accurate.
 *
 * ── The image is the avatar, and the card is `summary` because of that ────
 * There is no banner to use (see ./ChannelHeader.tsx for the whole finding),
 * and `summary_large_image` on a square avatar produces a wide card with a
 * small picture floating in the middle of it. `summary` is the card shape a
 * square image is FOR. When the profile row grows a real cover URL, this is
 * one branch: large card, cover first, avatar as the fallback.
 *
 * A channel with no avatar emits no image at all rather than a placeholder —
 * a preview with no picture is a clean preview; a preview of a grey square is
 * a broken-looking one.
 */
export function channelMetadata(channel: TubeChannel, origin = siteOrigin()): Metadata {
  const title = channelTitle(channel)
  const handle = atHandle(channel.handle)
  const url = channelUrl(channel.handle || channel.user_id, origin)
  const description =
    channelDescription(channel) ??
    // Not a generic sentence: this one is TRUE and specific, built from the
    // two facts every channel row carries.
    `${title}${handle ? ` (${handle})` : ""} on ${BRAND.name} Tube.`
  const image = channel.avatar_url?.trim() || null

  return {
    // `title` here is a plain string, so the root layout's
    // "%s — Momentum Tube" template applies and a channel tab reads
    // "Ada — Momentum Tube".
    title,
    description,
    // Set so any relative URL below resolves, and so Next stops warning about
    // metadata it cannot make absolute.
    metadataBase: new URL(origin),
    alternates: { canonical: url },
    openGraph: {
      type: "profile",
      // The OG title is the FULL one, because a preview card has no tab strip
      // to give it context — "Ada" alone in a chat window says nothing.
      title: `${title} — ${BRAND.name} Tube`,
      description,
      url,
      siteName: `${BRAND.name} Tube`,
      ...(bareHandle(channel.handle) ? { username: bareHandle(channel.handle)! } : {}),
      ...(image ? { images: [{ url: image, alt: title }] } : {}),
    },
    twitter: {
      card: "summary",
      title: `${title} — ${BRAND.name} Tube`,
      description,
      ...(image ? { images: [image] } : {}),
    },
  }
}

/**
 * The metadata for a handle we could not resolve — a 404, or a gateway that
 * did not answer.
 *
 * Both get the SAME page-level fallback, and that is not a shrug: a link
 * preview is not the place to distinguish them. What differs is what the page
 * does next — `notFound()` for a real 404, a rendered page for a failure —
 * and that decision belongs to the route, not to its `<head>`.
 *
 * The handle is still in the title, because it is the one true thing known
 * about the address, and a tab reading "@ada — Momentum Tube" is more use than
 * one reading "Channel".
 */
export function unknownChannelMetadata(ref: string, origin = siteOrigin()): Metadata {
  const handle = atHandle(ref)
  return {
    title: handle ?? "Channel",
    description: `A channel on ${BRAND.name} Tube.`,
    metadataBase: new URL(origin),
    alternates: { canonical: channelUrl(ref, origin) },
    // No Open Graph and no Twitter card. Emitting a rich preview for a channel
    // that may not exist would unfurl a confident card for a dead link.
  }
}
