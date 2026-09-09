"use client"

/**
 * The top bar's search box — Tube's own, and pointed at Tube's own results.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THIS DOES NOT SUBMIT TO /social/search
 *
 * @momentum/chrome's SearchBox is emphatic that there is ONE results page on
 * the web and it is in the social zone, because "a second results page would
 * be a second opinion about the same index". That is right for the reels
 * zone, whose search means the same thing the feed's does.
 *
 * It is not right here, and the founder's note is why:
 *
 *     "it's a completely isolated application from the feed. It's Momentum
 *      Tube. So it should be completely isolated."
 *
 * A box in the Tube bar that throws the browser out of Tube and into the feed
 * is the single most visible way to break that. And the search is not the
 * same search: this one is scoped to VIDEO and CHANNELS — the two things this
 * app is about — where /social/search returns posts, people and hashtags. A
 * results page that answered a Tube query with photo posts and hashtags would
 * be a different opinion about a different question.
 *
 * So the results page is `/tube/search`, it runs the two narrowed queries
 * described in ../tube/channelApi.ts, and this box is the only thing that
 * navigates to it.
 *
 * ── One request per submit, never one per keystroke ───────────────────────
 * There is nothing to debounce: this is a `<form>` and the only thing that
 * fetches is a navigation. `/v1/search` has no suggest mode, and
 * `POST /v1/search/click` exists to join a result tap back to a query id,
 * which only makes sense if a query is a deliberate act rather than a side
 * effect of the third letter. Same reasoning, same conclusion, as the chrome
 * package's box.
 *
 * ── It is a real form, so it works without JavaScript ─────────────────────
 * `method="get"` with `name="q"` produces exactly the URL the results page
 * reads. The `action` is ABSOLUTE and carries the basePath — a browser
 * submitting a form has never heard of `next/link` and will not add "/tube"
 * for us, which is the same class of mistake as `videoHref` returning
 * "/{id}". The submit handler intercepts it for a client-side transition when
 * React is running; if the bundle has not arrived, Enter still lands on the
 * right page.
 */

import { Suspense, useCallback } from "react"
import { Search } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
// The paths and the normaliser are in ./search.ts and not here on purpose:
// the results page is a SERVER component and imports the normaliser, and a
// plain function exported from a `"use client"` module arrives at the server
// as a client reference that throws when called. That file says so at length.
import { TUBE_SEARCH_ACTION, normalizeTubeQuery, tubeSearchHref } from "./search"

function SearchForm({ initialQuery }: { initialQuery: string }) {
  const router = useRouter()

  const onSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      const query = normalizeTubeQuery(new FormData(event.currentTarget).get("q")?.toString())
      // An empty box is not a search. Letting the plain form through would
      // navigate to a page whose only content is "type something", which is
      // less useful than the page they are already on.
      event.preventDefault()
      if (!query) return
      // Inside this zone, so a client transition is correct and Next adds the
      // basePath itself. This is the one branch @momentum/chrome's box cannot
      // take from reels, and the whole reason this file exists.
      router.push(tubeSearchHref(query))
    },
    [router]
  )

  return (
    <form
      role="search"
      action={TUBE_SEARCH_ACTION}
      method="get"
      onSubmit={onSubmit}
      className={[
        "flex h-10 min-w-0 flex-1 items-center gap-2 rounded-mo-pill border border-mo bg-mo-sunken px-3.5",
        "max-w-[560px]",
        "focus-within:border-mo-focus focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-mo",
      ].join(" ")}
    >
      {/* --mo-muted-lg over --mo-sunken measures 3.68 — over the 3.0 bar a
          non-text mark is held to, and sunken is one of the two grounds
          tokens.css allows this colour on. */}
      <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-mo-muted-lg" />
      <input
        type="search"
        name="q"
        // Remounted when the URL's query changes, which is what makes an
        // uncontrolled field track navigation — a new search, the back
        // button — without becoming state that can disagree with the URL.
        key={initialQuery}
        defaultValue={initialQuery}
        // The placeholder is not the accessible name: it disappears the
        // moment anyone types, and takes the field's only label with it.
        aria-label="Search videos and channels"
        placeholder="Search videos and channels"
        maxLength={500}
        autoComplete="off"
        className="min-w-0 flex-1 bg-transparent text-sm text-mo-ink outline-none placeholder:text-mo-body"
      />
      {/*
        A real submit control, hidden but not removed.

        A form with one text field is implicitly submitted by Enter — but only
        "if the form has no other field that blocks implicit submission",
        which the next person to add a filter select to this box would
        silently break. `sr-only` rather than `hidden` for the same reason
        `aria-disabled` beats `disabled` everywhere else in this zone: a
        control removed from the accessibility tree is a control announced to
        nobody.
      */}
      <button type="submit" className="sr-only">
        Search
      </button>
    </form>
  )
}

/**
 * The prefill, behind its own boundary.
 *
 * `useSearchParams()` makes any client component that calls it dynamic, and
 * this one is mounted in the layout — on every route in the zone. The
 * Suspense boundary keeps that local: the fallback is the identical form with
 * an empty box, so the only perceptible difference is that the field fills in.
 */
function PrefilledSearchForm() {
  const params = useSearchParams()
  return <SearchForm initialQuery={normalizeTubeQuery(params.get("q"))} />
}

export function TubeSearch() {
  return (
    <Suspense fallback={<SearchForm initialQuery="" />}>
      <PrefilledSearchForm />
    </Suspense>
  )
}
