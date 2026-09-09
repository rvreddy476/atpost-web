import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { ChannelScreen } from "@/channel/ChannelScreen"
// `parseTab` comes from ./tabs.ts and NOT from ChannelScreen: that file is
// `"use client"`, and a function exported from a client module reaches a
// server component as a client reference that throws when called.
import { parseTab } from "@/channel/tabs"
import { bareHandle } from "@/tube/channels"

/**
 * The channel page. Reached at `/tube/@{handle}`, served from here.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THE URL AND THE ROUTE ARE DIFFERENT, AND WHY THAT IS NOT A WORKAROUND
 *
 * The founder asked for YouTube's address, `/tube/@{handle}`, and the App
 * Router cannot serve that shape directly. Two hard rules collide:
 *
 *   · A directory named `@something` in `app/` is a PARALLEL ROUTE SLOT, not
 *     a URL segment. `app/@handle/` would never appear in a path at all.
 *   · Two different dynamic slugs cannot share one level. `app/[postId]` is
 *     the watch page and already occupies the root of this zone, so
 *     `app/[handle]` is a build error — "You cannot use different slug names
 *     for the same dynamic path" — and reusing `[postId]` to branch on
 *     whether the segment starts with "@" would put the channel page inside
 *     the watch page's file, which belongs to another author and is a
 *     different feature.
 *
 * So the route is `/channel/{handle}` and `next.config.ts` rewrites
 * `/@:handle` onto it in `beforeFiles` — before the filesystem is consulted,
 * which is the part that matters. An `afterFiles` rewrite would be too late:
 * `/tube/@ada` would have already matched `[postId]`, and the watch page
 * would 404 on a malformed UUID before the rewrite was ever tried.
 *
 * The URL a person sees, links to and bookmarks is `/tube/@{handle}` — the
 * rewrite is internal and does not redirect — and `channelHref` in
 * ../../../tube/channels.ts is the one place that shape is built.
 *
 * ── The tab is in the URL, and read here ─────────────────────────────────
 * Server-side, from `searchParams`, and handed down as a prop. The
 * alternative — `useSearchParams()` in the client component — would make the
 * whole page dynamic and need its own Suspense boundary, for a value the
 * server already has in its hand.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>
}): Promise<Metadata> {
  const { handle } = await params
  const bare = bareHandle(decodeURIComponent(handle))
  // The channel's real NAME would be better and is deliberately not fetched:
  // it would be a blocking request on every render of this page to change a
  // browser tab. The handle is the thing in the URL and is what somebody
  // recognises in a tab strip.
  return { title: bare ? `@${bare}` : "Channel" }
}

export default async function ChannelPage({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const [{ handle }, { tab }] = await Promise.all([params, searchParams])
  // The segment arrives without its "@" (the rewrite captures what follows
  // it), but `bareHandle` is applied anyway: somebody hitting the underlying
  // `/tube/channel/@ada` by hand should reach the same page rather than ask
  // the server for a channel called "@ada", which is a 404.
  const ref = bareHandle(decodeURIComponent(handle))
  // An empty handle is a malformed link, not a missing channel. 404 here and
  // now, with no request and no skeleton — the same discipline the watch page
  // applies to an id that is not a UUID.
  if (!ref) notFound()
  return <ChannelScreen channelRef={ref} tab={parseTab(tab)} />
}
