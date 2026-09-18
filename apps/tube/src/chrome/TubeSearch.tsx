"use client"

/**
 * The top bar's search box — Tube's own, pointed at Tube's own results, with
 * suggestions under it.
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
 * app is about — where /social/search returns posts, people and hashtags.
 *
 * So the results page is `/tube/search`, it runs the two narrowed queries
 * described in ../tube/channelApi.ts, and this box is the only thing that
 * navigates to it.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE SUGGESTIONS, AND THE NOTE THIS FILE USED TO CARRY
 *
 * This file used to say, in as many words: "there is nothing to debounce…
 * `/v1/search` has no suggest mode". That was wrong, and it is worth saying so
 * rather than quietly deleting it. `GET /v1/search/autocomplete` is real, is
 * public, and was real then; the box had simply not looked. The reasoning
 * around it still holds, and it is why the debounce is as long as it is:
 * `POST /v1/search/click` exists to join a result tap back to a query id,
 * which only makes sense if a SEARCH is a deliberate act rather than a side
 * effect of the third letter. A suggestion is not a search — nothing is
 * logged, no results page is rendered — so the two can coexist.
 *
 * What that endpoint suggests is NOT video titles: it is users, hashtags and
 * communities, because that is what the index holds. ./suggest.ts has the
 * finding in full, and it is why choosing a row runs a search for those WORDS
 * rather than jumping to a profile — which would take somebody out of Tube on
 * a keystroke.
 *
 * ── A combobox, built to the pattern rather than approximately ────────────
 * `role="combobox"` on the input with `aria-expanded`, `aria-controls` and
 * `aria-activedescendant`; `role="listbox"` on the panel and `role="option"`
 * on each row. Focus NEVER leaves the input — the arrow keys move
 * `aria-activedescendant` and nothing else, which is what lets somebody keep
 * typing after arrowing down. A list that moved real focus would swallow the
 * next keystroke.
 *
 * The arithmetic — which row is next, what is shown, when to ask at all — is
 * in ./suggest.ts, pure and tested. This file is the DOM, the debounce and
 * the abort.
 *
 * ── It is still a real form, so it still works without JavaScript ─────────
 * `method="get"` with `name="q"` produces exactly the URL the results page
 * reads. The `action` is ABSOLUTE and carries the basePath — a browser
 * submitting a form has never heard of `next/link` and will not add "/tube"
 * for us, which is the same class of mistake as `videoHref` returning "/{id}".
 * The submit handler intercepts it for a client-side transition when React is
 * running; if the bundle has not arrived, Enter still lands on the right page
 * and the suggestions simply never appear.
 */

import { Suspense, useCallback, useEffect, useId, useRef, useState } from "react"
import { Clock, Hash, Search, Users } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { useSession } from "@atpost/api-client/session"
// The paths and the normaliser are in ./search.ts and not here on purpose:
// the results page is a SERVER component and imports the normaliser, and a
// plain function exported from a `"use client"` module arrives at the server
// as a client reference that throws when called. That file says so at length.
import { TUBE_SEARCH_ACTION, normalizeTubeQuery, tubeSearchHref } from "./search"
import {
  DEBOUNCE_MS,
  nextSuggestionIndex,
  shouldSuggest,
  visibleSuggestions,
  type TubeSuggestion,
} from "./suggest"
import { clearRecentSearches, fetchRecentSearches, fetchSuggestions } from "./suggestApi"

function SearchForm({ initialQuery }: { initialQuery: string }) {
  const router = useRouter()
  const { signedIn, status } = useSession()

  const [query, setQuery] = useState(initialQuery)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [recent, setRecent] = useState<TubeSuggestion[]>([])
  const [suggested, setSuggested] = useState<TubeSuggestion[]>([])

  const rootRef = useRef<HTMLDivElement | null>(null)
  /** The in-flight suggestion request, aborted on the next keystroke. */
  const inFlight = useRef<AbortController | null>(null)
  const listId = useId()

  /**
   * The recent list, fetched once per session change rather than per open.
   *
   * It is twenty short strings; refetching on every focus would be a request
   * per click on a control people click by reflex. It is only ever changed
   * locally by Clear, which is the one thing this box does to it.
   */
  useEffect(() => {
    // "unknown" is the beat before the session has read its own cookie.
    // Asking here would be a guaranteed 401 with a failed refresh behind it.
    if (status === "unknown") return
    if (!signedIn) {
      setRecent([])
      return
    }
    let live = true
    void fetchRecentSearches().then((rows) => {
      if (live) setRecent(rows)
    })
    return () => {
      live = false
    }
  }, [signedIn, status])

  /**
   * Suggestions, debounced, with the previous request aborted.
   *
   * The abort is not tidiness: "ca" and "cat" are two requests and the first
   * can land last, putting stale rows under a newer query.
   * `fetchSuggestions` swallows the abort along with every other failure — a
   * list that is not there is the correct rendering of all of them, including
   * the 429 this endpoint answers by design when Redis blips.
   */
  useEffect(() => {
    inFlight.current?.abort()
    if (!shouldSuggest(query)) {
      setSuggested([])
      return
    }
    const controller = new AbortController()
    inFlight.current = controller
    const timer = window.setTimeout(() => {
      void fetchSuggestions(query.trim(), controller.signal).then((rows) => {
        if (!controller.signal.aborted) setSuggested(rows)
      })
    }, DEBOUNCE_MS)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [query])

  /** A press anywhere else closes the list, without moving focus. */
  useEffect(() => {
    if (!open) return
    const onDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return
      setOpen(false)
      setActive(-1)
    }
    document.addEventListener("pointerdown", onDown)
    return () => document.removeEventListener("pointerdown", onDown)
  }, [open])

  const rows = visibleSuggestions(query, recent, suggested)

  const search = useCallback(
    (raw: string) => {
      const next = normalizeTubeQuery(raw)
      // An empty box is not a search. Letting it through would navigate to a
      // page whose only content is "type something", which is less useful
      // than the page they are already on.
      if (!next) return
      setOpen(false)
      setActive(-1)
      // Inside this zone, so a client transition is correct and Next adds the
      // basePath itself. This is the one branch @momentum/chrome's box cannot
      // take from reels, and the whole reason this file exists.
      router.push(tubeSearchHref(next))
    },
    [router]
  )

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Escape") {
        // Closes the list and keeps both the text and the focus. Escape on a
        // combobox means "stop offering", not "undo what I typed".
        // `stopPropagation` so it does not also close the rail drawer behind
        // this bar on a narrow window.
        event.stopPropagation()
        setOpen(false)
        setActive(-1)
        return
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        if (rows.length === 0) return
        // Otherwise the caret jumps to the end or the start of the field,
        // which is the default for an arrow key in a text input.
        event.preventDefault()
        if (!open) setOpen(true)
        const key = event.key
        setActive((current) => nextSuggestionIndex(current, rows.length, key))
        return
      }
      if (event.key === "Enter" && active >= 0 && rows[active]) {
        // The highlighted row wins over the typed text. Preventing the default
        // stops the form submitting the half-typed query underneath it.
        event.preventDefault()
        setQuery(rows[active].text)
        search(rows[active].text)
      }
    },
    [active, open, rows, search]
  )

  const clear = useCallback(async () => {
    const ok = await clearRecentSearches()
    if (ok) setRecent([])
    // A failed clear says nothing, deliberately. The rows are still on screen,
    // which is itself the message, and a red line under a search box about a
    // list nobody has looked at yet would be noise.
  }, [])

  const iconFor = (row: TubeSuggestion) => {
    const className = "h-4 w-4 shrink-0 text-mo-body"
    if (row.kind === "recent") return <Clock aria-hidden="true" className={className} />
    if (row.kind === "hashtag") return <Hash aria-hidden="true" className={className} />
    if (row.kind === "community") return <Users aria-hidden="true" className={className} />
    return <Search aria-hidden="true" className={className} />
  }

  const showList = open && rows.length > 0

  return (
    <div ref={rootRef} className="relative flex min-w-0 flex-1 justify-center">
      <form
        role="search"
        action={TUBE_SEARCH_ACTION}
        method="get"
        onSubmit={(event) => {
          event.preventDefault()
          search(new FormData(event.currentTarget).get("q")?.toString() ?? "")
        }}
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
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setOpen(true)
            // A new query invalidates the highlight: row 3 of the old list is
            // a different word in the new one, and Enter would then search for
            // something nobody chose.
            setActive(-1)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          /* ── The combobox contract ─────────────────────────────────────── */
          role="combobox"
          aria-expanded={showList}
          aria-controls={showList ? listId : undefined}
          // Focus stays on the input; THIS is what the arrow keys move.
          aria-activedescendant={
            showList && active >= 0 ? `${listId}-${rows[active].key}` : undefined
          }
          // The browser's own history dropdown would otherwise cover this one.
          autoComplete="off"
          // The placeholder is not the accessible name: it disappears the
          // moment anyone types, and takes the field's only label with it.
          aria-label="Search videos and channels"
          placeholder="Search videos and channels"
          maxLength={500}
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

      {showList && (
        <div className="absolute left-1/2 top-12 z-50 w-full max-w-[560px] -translate-x-1/2 overflow-hidden rounded-mo border border-mo bg-mo-overlay py-1 shadow-mo-lift">
          <ul id={listId} role="listbox" aria-label="Search suggestions">
            {rows.map((row, at) => (
              // eslint-disable-next-line jsx-a11y/click-events-have-key-events -- the
              // keyboard lives on the combobox input, which is the pattern: see
              // `onKeyDown` above and the header. A key handler here would
              // require focus to be on the option, which is what
              // `aria-activedescendant` exists to avoid.
              <li
                key={row.key}
                id={`${listId}-${row.key}`}
                role="option"
                aria-selected={at === active}
                // `onPointerDown` and not `onClick`: a click fires after the
                // input has already blurred, and the blur would have closed
                // this list out from under the press.
                onPointerDown={(event) => {
                  event.preventDefault()
                  setQuery(row.text)
                  search(row.text)
                }}
                onMouseEnter={() => setActive(at)}
                className={[
                  "flex cursor-pointer items-center gap-3 px-3.5 py-2 text-sm text-mo-ink",
                  at === active ? "bg-mo-raised" : "",
                ].join(" ")}
              >
                {iconFor(row)}
                <span className="min-w-0 flex-1 truncate">{row.text}</span>
                {/* Says what the row IS, because this index holds creators,
                    tags and communities and no video titles at all. */}
                <span className="shrink-0 text-xs text-mo-body">{row.badge}</span>
              </li>
            ))}
          </ul>

          {/* Offered only when the list IS the recent list. Under a typed
              query the rows are mostly the server's, and a Clear there would
              be a control whose target is off screen.

              It clears ALL of them and the label says so, because this gateway
              has no per-row delete — ./suggestApi.ts has the finding, and a
              cross on each row that wiped nineteen others would be the worst
              possible way to discover it. */}
          {query.trim().length === 0 && recent.length > 0 && (
            <div className="border-t border-mo px-3.5 py-2">
              <button
                type="button"
                onPointerDown={(event) => {
                  event.preventDefault()
                  void clear()
                }}
                className="text-xs font-semibold text-mo-cyan underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mo"
              >
                Clear all recent searches
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * The prefill, behind its own boundary.
 *
 * `useSearchParams()` makes any client component that calls it dynamic, and
 * this one is mounted in the layout — on every route in the zone. The
 * Suspense boundary keeps that local: the fallback is the identical form with
 * an empty box, so the only perceptible difference is that the field fills in.
 *
 * `key` remounts the form when the URL's query changes, which is what makes
 * the field track navigation — a new search, the back button — without the
 * typed value becoming a second source of truth that can disagree with the
 * URL.
 */
function PrefilledSearchForm() {
  const params = useSearchParams()
  const initial = normalizeTubeQuery(params.get("q"))
  return <SearchForm key={initial} initialQuery={initial} />
}

export function TubeSearch() {
  return (
    <Suspense fallback={<SearchForm initialQuery="" />}>
      <PrefilledSearchForm />
    </Suspense>
  )
}
