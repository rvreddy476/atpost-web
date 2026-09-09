"use client"

/**
 * The selected section, kept in the address bar.
 *
 * A tab that lives only in React state is a tab that vanishes on refresh and
 * cannot be sent to anybody. Both matter here: "look at #momentum" is a link,
 * and a reader who reloads the page while reading Following expects Following.
 *
 * ── Why `window.history` and not `useSearchParams` ────────────────────────
 * `useSearchParams()` is the framework's answer and it is the wrong one for
 * this page. A client component that calls it must sit under a `<Suspense>`
 * boundary or it opts its whole route out of static rendering — which would
 * mean editing `app/page.tsx` to wrap the feed, and turning the product's
 * front door into a client-side bail-out to hold a three-value enum. The
 * native History API is officially supported by the app router (Next patches
 * `pushState`/`replaceState` to keep its own state in sync), costs nothing,
 * and touches no file outside this feature.
 *
 * The price is one frame: the server renders For You, and a link to
 * `?tab=following` corrects itself in the mount effect. That is the same
 * bargain `reducedMotion` and the chrome inset in HomeFeed.tsx already make —
 * read nothing during render that the server cannot also read, or the front
 * page throws a hydration error.
 *
 * ── replace for a tab, push for a tag ─────────────────────────────────────
 * Switching sections uses `replaceState`, so Back still means "leave the
 * feed" rather than "walk back through the tabs I flicked past". Opening a
 * tag from the trending list uses `pushState`, because that IS a navigation —
 * the reader went somewhere and Back should bring them to the list they came
 * from. The rule is the one a reader already holds: changing how you are
 * looking at a thing is not the same as going to a different thing.
 */

import { useCallback, useEffect, useState } from "react"
import { HOME_ROUTE, readRoute, sameRoute, writeRoute, type FeedRoute } from "./tabs"

export type NavKind = "replace" | "push"

export function useFeedRoute(): [FeedRoute, (next: FeedRoute, how?: NavKind) => void] {
  // The same value the server rendered. Corrected on mount; see above.
  const [route, setRoute] = useState<FeedRoute>(HOME_ROUTE)

  useEffect(() => {
    if (typeof window === "undefined") return

    const sync = () => setRoute((prev) => {
      const next = readRoute(window.location.search)
      // Identity is load-bearing: `route` reaches the list key and the fetch
      // effect, and a new object for an unchanged place would refetch.
      return sameRoute(prev, next) ? prev : next
    })

    sync()

    /*
      Canonicalise what arrived.

      `?tab=friends` shows For You, and `?tab=following&tag=x` shows Following
      with no tag — both correct, and both leave the address bar describing a
      screen that is not the one on it. That gap is not cosmetic: the URL is
      the only durable record of where the reader is, so a URL that disagrees
      with the page is a link that will not reproduce it. Rewritten in place
      rather than pushed, because arriving somewhere is not a navigation the
      reader made.

      A URL that is already canonical produces the identical string and this
      does nothing.
    */
    const canonical = writeRoute(window.location.search, readRoute(window.location.search))
    if (canonical !== window.location.search) {
      window.history.replaceState(
        window.history.state,
        "",
        `${window.location.pathname}${canonical}${window.location.hash}`
      )
    }
    // Back and Forward, including the ones that walk out of a tag's posts.
    window.addEventListener("popstate", sync)
    return () => window.removeEventListener("popstate", sync)
  }, [])

  const go = useCallback((next: FeedRoute, how: NavKind = "replace") => {
    setRoute((prev) => (sameRoute(prev, next) ? prev : next))
    if (typeof window === "undefined") return

    const url = `${window.location.pathname}${writeRoute(window.location.search, next)}${window.location.hash}`
    // The existing state object is passed through rather than replaced with
    // null: the app router keeps its own bookkeeping in there, and dropping it
    // is how a later Back ends up on a page the router cannot reconstruct.
    if (how === "push") window.history.pushState(window.history.state, "", url)
    else window.history.replaceState(window.history.state, "", url)
  }, [])

  return [route, go]
}
