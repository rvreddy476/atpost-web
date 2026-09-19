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
 * ── There is ONE results page, and it is not in every zone ────────────────
 * This is the thing that changed when the chrome became a package. The action
 * used to be `${NEXT_PUBLIC_API_BASE_URL}/search` — this zone's own /search —
 * and the submit handler used to `router.push("/search?q=…")`. Both are
 * correct in apps/social and both are wrong in apps/reels, which has no
 * /search route and never will: `SEARCH_PATH` is `/social/search`, full stop,
 * because a second results page would be a second opinion about one index.
 *
 * So the form's `action` is that absolute path in every zone — which is also
 * what makes the no-JavaScript path work from reels — and the handler asks
 * `zoneRelative` whether the destination is inside the zone it is running in:
 *
 *   · inside  (social) → `router.push("/search?q=…")`, a client transition.
 *   · outside (reels)  → `window.location.assign("/social/search?q=…")`, a
 *     document navigation, because a client-side push in the reels zone would
 *     resolve against its basePath and ask for /reels/social/search.
 *
 * The `preventDefault` in the second branch is not decoration: without it the
 * form submits AND the assignment runs, which is two navigations racing.
 *
 * ── A searchbox this time, and not a button ───────────────────────────────
 * The old control announced itself as a button because that is what it was:
 * something you press, with nothing to type into. This one is an
 * `<input type="search">` inside a `role="search"` landmark, which is what it
 * now is. The change of role is the point — announcing an editable field for
 * something with no editing in it was the lie the old comment named, and the
 * reverse is just as true.
 */

import { Suspense, useCallback, useEffect, useRef } from "react"
import { Search } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { BRAND } from "@momentum/brand"
import { SEARCH_PATH, normalizeQuery, searchHref, zoneRelative } from "./zone"

/**
 * The two places one search box is drawn, and the only thing that differs.
 *
 * ── Why a variant and not a second component ──────────────────────────────
 * The founder's reference puts a full-width search field in the LEFT RAIL,
 * under the product lockup — and the header keeps its own, because the rail is
 * gone below 1024px and the header is what a phone has. Two boxes, one index,
 * one results page, and therefore one submit handler, one no-JavaScript
 * fallback, one `zoneRelative` decision and one prefill. Copying the form to
 * change a width and add a chip would be a second implementation of every one
 * of those, and the second one is always the one that stops agreeing about
 * what an empty query is.
 *
 * So the ONLY difference is presentation: the header's is a 260px pill that
 * appears at `sm:`, the rail's is full width and always shown (the rail is
 * itself hidden below `lg`, so it has no breakpoint of its own to keep).
 */
type SearchVariant = "header" | "rail"

/**
 * The keyboard-shortcut chip the reference puts at the right of the rail field.
 *
 * ── It is a real shortcut, not a decoration ───────────────────────────────
 * A chip that does not focus anything is exactly the fault the founder
 * objected to elsewhere, so the key is bound: "/" anywhere outside a field
 * puts focus in this box. "/" rather than ⌘K because ⌘K is the browser's own
 * search shortcut in Chrome and Firefox and cannot be taken without breaking
 * it, and because one unmodified key needs no platform text — the chip reads
 * the same on a Mac, a PC and a Chromebook.
 *
 * The binding ignores the key while a field, a textarea or any
 * `contenteditable` has focus: typing "/" into the composer must type a "/".
 */
const SEARCH_HOTKEY = "/"

function useSearchHotkey(ref: React.RefObject<HTMLInputElement | null>, enabled: boolean) {
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== SEARCH_HOTKEY) return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return
      if (target?.isContentEditable) return
      const input = ref.current
      if (!input) return
      // Without this the "/" lands in the box it has just focused.
      event.preventDefault()
      input.focus()
      input.select()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [ref, enabled])
}

function SearchForm({
  basePath,
  initialQuery,
  variant = "header",
}: {
  basePath: string
  initialQuery: string
  variant?: SearchVariant
}) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const rail = variant === "rail"
  useSearchHotkey(inputRef, rail)

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
      // From here the browser is not allowed to submit: either we transition
      // client-side, or we navigate ourselves. Doing both is two navigations
      // racing for the same tab.
      event.preventDefault()
      const target = searchHref(query)
      const inside = zoneRelative(basePath, target)
      if (inside) {
        router.push(inside)
        return
      }
      // Another zone. `router.push` would prefix this zone's basePath.
      window.location.assign(target)
    },
    [basePath, router]
  )

  return (
    <form
      // The search landmark, so "skip to search" and rotor navigation find it.
      role="search"
      // Absolute, and the same in every zone — this is what a browser with no
      // JavaScript submits, and it has to reach the one results page from
      // wherever the header is drawn.
      action={SEARCH_PATH}
      method="get"
      onSubmit={onSubmit}
      className={[
        "w-full items-center gap-2 rounded-mo-pill border border-mo bg-mo-sunken",
        // The rail's is full width and 44px — a real pointer target, because
        // on a tablet the rail is open and this is the only search there is.
        // The header's keeps the shape it had: 40px, capped, and absent below
        // `sm:` where there is no room for it beside seven destinations.
        rail ? "flex h-11 px-4" : "hidden h-10 max-w-[260px] px-3.5 sm:flex",
        // The ring is on the wrapper because the wrapper is what looks like
        // the control; the input inside it has no border of its own to ring.
        "focus-within:border-mo-focus focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-mo",
      ].join(" ")}
    >
      {/* --mo-muted-lg over --mo-sunken: 3.68 in the dark scope and 3.33 in
          the light one, both over the 3.0 bar this glyph is held to as a
          non-text mark. Sunken is one of the two grounds tokens.css allows the
          colour on, and it is the better-behaved ground of the two in a light
          zone — #E9EDEB is 1.18 against the page there, so the well reads as
          recessed without needing a border at all. */}
      <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-mo-muted-lg" />
      <input
        ref={inputRef}
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
        className="peer min-w-0 flex-1 bg-transparent text-sm text-mo-ink outline-none placeholder:text-mo-body"
      />
      {/*
        The shortcut chip. `aria-hidden` because it is a sighted affordance for
        a key that is already bound — a screen-reader user reaches this field
        by its landmark and its label, and announcing "slash" after the field's
        name would be a third thing said about one box.

        Hidden while the field has focus (`peer-focus:`, off the input above):
        it says how to GET here, so it has nothing to say once you have
        arrived, and leaving it there would crowd the right end of a field
        somebody is typing in.

        --mo-body on --mo-raised is small text and has to clear 4.5: #46554D on
        #F1F4F2 is 6.02 light, #A19CB9 on #2A2745 is 5.20 dark. --mo-muted-lg
        is 2.61 on raised and is barred there outright.
      */}
      {rail && (
        <kbd
          aria-hidden="true"
          className="shrink-0 rounded-mo-sm border border-mo bg-mo-raised px-1.5 py-0.5 font-mo-sans text-[11px] font-semibold leading-none text-mo-body peer-focus:hidden"
        >
          {SEARCH_HOTKEY}
        </kbd>
      )}
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
function PrefilledSearchForm({
  basePath,
  variant,
}: {
  basePath: string
  variant?: SearchVariant
}) {
  const params = useSearchParams()
  return (
    <SearchForm
      basePath={basePath}
      variant={variant}
      initialQuery={normalizeQuery(params.get("q"))}
    />
  )
}

export function SearchBox({ basePath }: { basePath: string }) {
  return (
    <Suspense fallback={<SearchForm basePath={basePath} initialQuery="" />}>
      <PrefilledSearchForm basePath={basePath} />
    </Suspense>
  )
}

/**
 * The same box, drawn full width under the rail's product lockup.
 *
 * Mounted by ./LeftRail, which means it is rendered TWICE on a page between
 * 1024px and the drawer's own breakpoint — once in the sticky column and once
 * inside the drawer, if that were open. It is not: the drawer is `lg:hidden`
 * and the column is `hidden lg:block`, and the drawer is UNMOUNTED while shut,
 * so at no width are two of these in the document at once. That matters here
 * more than it looks, because the hotkey binds a window listener: two live
 * copies would both take "/" and the second would win at random.
 */
export function RailSearchBox({ basePath }: { basePath: string }) {
  return (
    <Suspense fallback={<SearchForm basePath={basePath} variant="rail" initialQuery="" />}>
      <PrefilledSearchForm basePath={basePath} variant="rail" />
    </Suspense>
  )
}
