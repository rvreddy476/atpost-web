"use client"

/**
 * The header's search box, now that there is somewhere to put the answer.
 *
 * This replaces the deliberately inert `<button aria-disabled>` that stood
 * here while `/v1/search` was live and this zone had no results page. The
 * shape is unchanged — the same pill, the same sunken well, the same glyph, the
 * same `hidden … sm:flex` and the same 260px cap — because the shape was
 * always the real one; only the promise behind it was missing.
 *
 * ── One request per submit, and never one per keystroke ───────────────────
 * There is no debounce here because there is nothing to debounce: this is a
 * `<form>` and the only thing that fetches is a navigation. Typing costs
 * nothing. That is the cheaper answer than a debounced type-ahead against a
 * real OpenSearch cluster, and it is also the honest one for this endpoint —
 * `/v1/search` has no suggest mode, and `POST /v1/search/click` exists to join
 * a result tap back to a query id, which only makes sense if a query is a
 * deliberate act rather than a side effect of the third letter.
 *
 * ── It is a real form, so it works without JavaScript ─────────────────────
 * `method="get"` with `name="q"` produces exactly the URL the results page
 * reads: `/social/search?q=…`. The submit handler intercepts it for a
 * client-side transition when React is running, and does nothing else — so if
 * the bundle has not arrived, or has failed, pressing Enter still lands on the
 * right page rather than doing nothing at all.
 *
 * The action's prefix comes from NEXT_PUBLIC_API_BASE_URL, which this zone
 * already requires to equal its own basePath (see `zonePath` in AppFrame, and
 * apps/social/.env.local). One answer per deployment to "where is this zone",
 * rather than a second constant that can disagree with the first.
 *
 * ── A searchbox this time, and not a button ───────────────────────────────
 * The old control announced itself as a button because that is what it was:
 * something you press, with nothing to type into. This one is an
 * `<input type="search">` inside a `role="search"` landmark, which is what it
 * now is. The change of role is the point — announcing an editable field for
 * something with no editing in it was the lie the old comment named, and the
 * reverse is just as true.
 */

import { Suspense, useCallback } from "react"
import { Search } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { BRAND } from "@momentum/brand"
import { normalizeQuery } from "@/search/contract"

/** Where the form posts to without JavaScript. Absolute, zone-prefixed. */
function searchAction(): string {
  return `${process.env.NEXT_PUBLIC_API_BASE_URL || ""}/search`
}

function SearchForm({ initialQuery }: { initialQuery: string }) {
  const router = useRouter()

  const onSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      const form = event.currentTarget
      const query = normalizeQuery(new FormData(form).get("q")?.toString())
      // An empty box is not a search. Letting the plain form through would
      // navigate to a page whose only content is "type something", which is
      // less useful than the page they are already on — so this one case is
      // swallowed rather than submitted. (`/search` with no query is still a
      // real, reachable state: it is what a bookmark of the bare path shows.)
      if (!query) {
        event.preventDefault()
        return
      }
      // Everything else is a client-side transition. `preventDefault` runs
      // only once we are certain we can do better than the browser would.
      event.preventDefault()
      router.push(`/search?q=${encodeURIComponent(query)}`)
    },
    [router]
  )

  return (
    <form
      // The search landmark, so "skip to search" and rotor navigation find it.
      role="search"
      action={searchAction()}
      method="get"
      onSubmit={onSubmit}
      className={[
        "hidden h-10 w-full max-w-[260px] items-center gap-2 rounded-mo-pill border border-mo bg-mo-sunken px-3.5 sm:flex",
        // The ring is on the wrapper because the wrapper is what looks like
        // the control; the input inside it has no border of its own to ring.
        "focus-within:border-mo-focus focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-mo",
      ].join(" ")}
    >
      {/* --mo-muted-lg over --mo-sunken, measured on the rendered page at
          3.68 — over the 3.0 bar this glyph is held to as a non-text mark,
          and sunken is one of the two grounds tokens.css allows it on. */}
      <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-mo-muted-lg" />
      <input
        type="search"
        name="q"
        // Remounted when the URL's query changes, which is what makes an
        // uncontrolled field track navigation (a new search, the back button)
        // without becoming controlled state that could disagree with the URL.
        key={initialQuery}
        defaultValue={initialQuery}
        // The visible placeholder is not the accessible name: a placeholder
        // disappears the moment anyone types, and takes the field's only label
        // with it.
        aria-label={`Search ${BRAND.name}`}
        placeholder={`Search ${BRAND.name}`}
        maxLength={500}
        autoComplete="off"
        // `text-mo-ink` for what is typed; --mo-body for the placeholder,
        // which is 6.22 on the card ground and higher again on this sunken
        // well. Small text, so never --mo-muted-lg.
        className="min-w-0 flex-1 bg-transparent text-sm text-mo-ink outline-none placeholder:text-mo-body"
      />
      {/*
        A real submit control, hidden but not removed.

        The box has no visible button by design, and a form with a single text
        field is implicitly submitted by Enter — but only "if the form has no
        other field that blocks implicit submission", which is a condition the
        next person to add a filter select to this box would silently break.
        An explicit submit button makes Enter unconditional, and it gives a
        screen-reader or switch user something to activate rather than a field
        whose only affordance is a key they have to know about.

        `sr-only` and not `hidden`: the same distinction `aria-disabled` versus
        `disabled` draws everywhere else in this zone — a control removed from
        the accessibility tree is a control announced to nobody.
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
 * this one is mounted in the layout — i.e. on every route in the zone,
 * including the statically rendered feed. The Suspense boundary is what keeps
 * that local: the fallback is the identical form with an empty box, so the
 * only difference anyone can perceive is that the field fills in.
 */
function PrefilledSearchForm() {
  const params = useSearchParams()
  return <SearchForm initialQuery={normalizeQuery(params.get("q"))} />
}

export function SearchBox() {
  return (
    <Suspense fallback={<SearchForm initialQuery="" />}>
      <PrefilledSearchForm />
    </Suspense>
  )
}
