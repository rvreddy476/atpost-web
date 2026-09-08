import { HomeFeed } from "@/feed/HomeFeed"

/**
 * The Momentum home feed — the platform's front door.
 *
 * A server component that renders one client component and nothing else. That
 * is deliberate rather than lazy: the feed is a session-scoped, cursor-paged,
 * autoplaying surface, so there is nothing here that could usefully be
 * rendered on the server that the layout has not already done. The layout
 * reads the session cookie and seeds the provider, so the first HTML already
 * knows whether anyone is signed in; this page is the mount point.
 */
export default function Home() {
  return <HomeFeed />
}
