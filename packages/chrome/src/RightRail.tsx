"use client"

/**
 * People, from the ranker — or nothing, honestly.
 *
 * ── There are no placeholder people in this file ──────────────────────────
 * That is the whole design constraint and it is worth stating before the code.
 * A right rail full of invented faces is the worst thing a social product can
 * ship: every name in it is a real person somewhere, a "suggested friend" who
 * does not exist is an account nobody can open, and the one surface whose
 * entire job is "these are real humans you might know" is the last place to
 * put filler. So there are exactly four things this can render — waiting, a
 * list, an empty state, and a failure — and three of them say so.
 *
 * ── What /v1/suggestions actually returns ─────────────────────────────────
 * Verified against the running gateway with the test account. It is live and
 * it answers with real rows:
 *
 *   {"data":{"type":"friend","surface":"home","generated_at":"…","items":[
 *     {"entityType":"user","candidate_user_id":"7cd6ea3a-…",
 *      "display_name":"raghu varan","avatar_media_id":"e13c1582-…",
 *      "score":0,"reason_codes":["POPULAR"],"explain_text":"Popular on atpost",
 *      "source_bucket":"trending","mutual_friend_count":0,"is_fresh":true,
 *      "generated_at":"…"}, … ]}}
 *
 * Two properties of that payload shape this component:
 *
 *   · `explain_text` arrives as a finished sentence, and this rail used to
 *     render it verbatim — including "Popular on atpost", the OLD product
 *     name, written by suggestion-service and printed in the chrome of a
 *     product called Momentum. The note that stood here said the client "may
 *     not silently rewrite" it and so rendered it as sent. That reasoning was
 *     half right: rewriting a server string WOULD hide the drift. Printing a
 *     dead brand to every reader in order to preserve the evidence is worse.
 *
 *     ./suggestions.ts resolves it the way suggestion-service's own brand.go
 *     says it should be resolved — from `reason_codes`, with this product's
 *     word coming from @momentum/brand — while still printing the server's
 *     sentence whenever it names no product, because a scored row's prose
 *     carries facts ("Both in Weekend Cyclists") no client could reconstruct.
 *
 *   · `score` is 0 on every row and `mutual_friend_count` is 0, because the
 *     only bucket with candidates in it today is `trending` — and on that
 *     path both are Go zero values rather than computed numbers, so a zero is
 *     indistinguishable from a real one. `score` is drawn nowhere, and the
 *     mutuals line is drawn only above zero.
 *
 *   · `avatar_media_id` is on every row and is an ID, never a URL. It is a
 *     picture now; see `avatarSrc` and the note in @momentum/content.
 *
 * ── The action is a friend request, not a follow ──────────────────────────
 * And NOT because follow is unavailable — that claim stood here, and in ./api,
 * and it was wrong: `POST /v1/graph/follow {"user_id":…}` answers
 * `{"status":"followed"}` for a person, verified live. These rows are the
 * ranker's FRIEND candidates and this button says "Add", so the honest wire
 * for it is `POST /v1/graph/connection-request`, which asks. ./api has the
 * full correction.
 *
 * ── The events the founder also asked for ─────────────────────────────────
 * Deliberately absent. There is no events endpoint on this gateway to ask —
 * nothing under /v1/events, and the suggestion service's own vocabulary is
 * people, hubs and communities. An events card with nothing behind it would be
 * the placeholder-people problem wearing a different hat.
 */

import { useCallback, useEffect, useId, useState } from "react"
import { MessageCircle, UserPlus } from "lucide-react"
import { Avatar, avatarSrc } from "@momentum/content"
import { useSession } from "@atpost/api-client/session"
import { BRAND } from "@momentum/brand"
import { fetchSuggestions, setFollow, type Suggestion } from "./api"
import { SOLID_ACTION_FILL } from "./NavItem"
import { suggestionReason } from "./suggestions"

type Status = "loading" | "ready" | "error"

/**
 * Per-row follow state. `following` and `requested` are only ever set from the
 * server; `pending` is the optimistic beat between the press and the answer.
 */
type FollowUiState = "none" | "pending" | "following" | "requested" | "failed"

/**
 * Why "Message" is a control that explains itself rather than a link.
 *
 * ── There is no chat zone on the web ──────────────────────────────────────
 * ./destinations is the whole list of places this product has, and the
 * Messages row in it carries `href: null` and `APP_ONLY_REASON`: the shell's
 * rewrite table serves /shop, /admin, /social, /apps, /reels, /tube and /kwit
 * and nothing else. There is no route to send anyone to, and no endpoint this
 * client could open a conversation with.
 *
 * The three options were a dead button, a link to a 404, and this. The rule
 * `RoleSwitcher` established and this package has followed since is that an
 * unavailable thing stays present, keeps its name, keeps its place in the
 * focus order and SAYS why — `aria-disabled` rather than `disabled`, because
 * `disabled` takes the control out of the focus order and the explanation is
 * then announced to nobody.
 *
 * So it is focusable, named, described through `aria-describedby`, carries the
 * sentence in `title` for a hover, and answers a press by saying the sentence
 * out loud in the rail's live region rather than by doing nothing at all.
 */
const MESSAGE_REASON = `Messages are only in the ${BRAND.mobileApp} — the web has no chat zone yet.`

function SuggestionRow({
  suggestion,
  basePath,
  reasonId,
  onSay,
}: {
  suggestion: Suggestion
  basePath: string
  /** The id of the card's one shared "messaging is app-only" note. */
  reasonId: string
  /** Puts a sentence in the rail's live region. */
  onSay: (text: string) => void
}) {
  const [state, setState] = useState<FollowUiState>("none")
  const name = suggestion.display_name

  /**
   * Follow, optimistically, and put it back when the server refuses.
   *
   * The optimistic half is the label changing on the press. The half that is
   * easy to skip is the rollback, and the half easier still to skip is saying
   * that it happened — which is why a refusal lands on "Try again" and a
   * sentence rather than silently back on "Follow": a button that springs back
   * with no explanation reads as a bug rather than as a request that did not
   * land. That is the same bargain `useOptimisticToggle` strikes in
   * @momentum/interactions.
   *
   * `requested` is never guessed. A private account answers `requested` and
   * the label has to say so, so it is only ever set from the answer.
   */
  const toggle = useCallback(() => {
    if (state === "pending") return
    const on = state === "following" || state === "requested"
    const previous: FollowUiState = state === "failed" ? "none" : state
    setState("pending")
    setFollow(suggestion.candidate_user_id, !on)
      .then((status) => {
        if (status === "followed") setState("following")
        else if (status === "requested") setState("requested")
        else if (status === "unfollowed") setState("none")
        else {
          // "unknown" is not an outcome to paint. We do not know what
          // happened, so the row goes back and says the press did not land.
          setState(previous)
          onSay(`We could not follow ${name}. Try again.`)
        }
      })
      .catch(() => {
        setState("failed")
        onSay(`We could not follow ${name}. Try again.`)
      })
  }, [state, suggestion.candidate_user_id, name, onSay])

  const active = state === "following" || state === "requested"
  const label =
    state === "following"
      ? "Following"
      : state === "requested"
        ? "Requested"
        : state === "failed"
          ? "Try again"
          : state === "pending"
            ? // The optimistic beat shows the DESTINATION rather than
              // "Following…": the press has already changed the world as far
              // as the reader is concerned, and a spinner-word would undo that.
              "Following"
            : "Follow"

  /**
   * ── The two controls are COMPACT, and 44px is not the rule here ────────
   * They were `min-h-[44px] flex-1` on a row of their own: two nearly
   * full-width slabs under every name, which turned a list of five people into
   * five cards and was the first thing the founder said about the page. They
   * are 32px pills sized to their own label now, side by side, on the row.
   *
   * 32 is under the 44px target this codebase holds most controls to, so the
   * exception is stated rather than slipped in. WCAG 2.2's Target Size
   * (Minimum) is 24×24 CSS pixels and these clear it comfortably; 44 is the
   * stricter AAA/platform figure, and it is the right one for a control that
   * is the ONLY way to do something. These are not — the same follow exists on
   * the person's profile, this rail is a convenience beside a feed, and a rail
   * that spends 90px a row on that convenience is a worse rail for everybody,
   * including the people using it by touch, because five rows then scroll off
   * a laptop screen.
   *
   * The `gap-2` between them and the `py-2.5` around the row keep the size
   * exception from becoming a crowding one: neither pill has another target
   * within 8px of it.
   */
  const pill =
    "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-mo-pill px-3 text-xs font-semibold transition-colors duration-150 ease-mo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mo"

  return (
    <li className="flex items-center gap-3 py-2.5">
      <Avatar
        name={name}
        id={suggestion.candidate_user_id}
        src={avatarSrc({ mediaId: suggestion.avatar_media_id }, basePath)}
        size="sm"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-mo-ink">{name}</p>
        {/* One line, decided in ./suggestions.ts so the rule is a table test
            rather than a ternary nobody can check. */}
        <p className="truncate text-xs text-mo-body">{suggestionReason(suggestion)}</p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={toggle}
          aria-pressed={active}
          aria-label={active ? `${label} ${name}` : `Follow ${name}`}
          className={[
            pill,
            active
              ? // Settled: it recedes, and it is still GREEN. The founder's
                // first change is that every button, filled or outline, is the
                // one colour. --brand-accent is #0B6B37 under `.mo-light`
                // (6.61 on a white card) and #06B6D4 in :root (6.74 on a dark
                // one).
                "border border-mo-strong text-brand-accent hover:bg-mo-raised"
              : state === "failed"
                ? // --mo-bad: #B91C1C on the white card (6.47), #FCA5A5 on the
                  // dark one (8.63). Not a second button colour — a failure
                  // state on the one button, which is what --mo-bad is for.
                  "border border-mo-bad text-mo-bad hover:bg-mo-raised"
                : SOLID_ACTION_FILL,
          ].join(" ")}
        >
          {label}
        </button>

        {/* The second action, and the one with nowhere to go — OUTLINED, so
            the filled one beside it is unambiguously the primary. See
            MESSAGE_REASON for why it is `aria-disabled` and not `disabled`.

            Reducing it to its glyph would save 60px and is not done: an
            unlabelled icon is exactly what the header strip was, and this
            control's whole job is to be legible about what it cannot do. */}
        <button
          type="button"
          aria-disabled="true"
          aria-describedby={reasonId}
          title={MESSAGE_REASON}
          onClick={() => onSay(MESSAGE_REASON)}
          aria-label={`Message ${name}`}
          className={`${pill} cursor-default border border-mo text-mo-body hover:bg-mo-raised`}
        >
          <MessageCircle aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
          Message
        </button>
      </div>
    </li>
  )
}

export function RightRail({
  basePath,
  extra,
}: {
  basePath: string
  /** A card the zone owns, under this one. See `AppFrameProps.rightRailExtra`. */
  extra?: React.ReactNode
}) {
  const { signedIn, status: sessionStatus } = useSession()
  const [items, setItems] = useState<Suggestion[]>([])
  const [status, setStatus] = useState<Status>("loading")
  const reasonId = useId()

  /**
   * The one sentence this rail last had to say.
   *
   * Two things put something here — a follow that did not land, and the
   * Message control explaining itself — and neither has anywhere else to put
   * it: the row is 300px wide and a failure that only changes a three-word
   * label is a failure a lot of people will not notice. Cleared on a timer,
   * the same shape apps/social's feed notice uses.
   *
   * `role="status"` rather than `alert`: none of it interrupts anything.
   */
  const [notice, setNotice] = useState<string | null>(null)
  useEffect(() => {
    if (!notice) return
    const id = window.setTimeout(() => setNotice(null), 6_000)
    return () => window.clearTimeout(id)
  }, [notice])
  const say = useCallback((text: string) => setNotice(text), [])

  useEffect(() => {
    // "unknown" is not "signed out" — asking now would 401 on a session that
    // is about to resolve perfectly well.
    if (sessionStatus === "unknown") return
    if (!signedIn) {
      setItems([])
      setStatus("ready")
      return
    }
    let live = true
    fetchSuggestions(5)
      .then((next) => {
        if (!live) return
        setItems(next)
        setStatus("ready")
      })
      .catch(() => {
        if (live) setStatus("error")
      })
    return () => {
      live = false
    }
  }, [signedIn, sessionStatus])

  // Signed out there are no suggestions to draw — but the zone's own card may
  // still be worth drawing, and trending tags are public. So the rail keeps
  // its track and renders whatever the zone gave it.
  if (!signedIn) {
    return (
      <aside
        aria-label="More"
        className="sticky top-14 hidden max-h-[calc(100vh-3.5rem)] overflow-y-auto py-5 pl-2 xl:block"
      >
        {extra}
      </aside>
    )
  }

  return (
    <aside
      aria-label="People and topics"
      className="sticky top-14 hidden max-h-[calc(100vh-3.5rem)] overflow-y-auto py-5 pl-2 xl:block"
    >
      <section className="rounded-mo-lg border border-mo bg-mo-surface p-4 shadow-mo-sm">
        <h2 className="font-mo-display text-base font-semibold tracking-mo-display text-mo-ink">
          {/*
            "People to follow", not "People to add" — the founder's second
            change, and the heading has to move with the button underneath it.
            The rows are the ranker's friend candidates either way; what
            changed is which edge the primary action writes. See `setFollow`
            in ./api.ts for why a follow is the honest optimistic action and a
            connection request is not.
          */}
          People to follow
        </h2>

        {status === "loading" && (
          <ul aria-hidden="true" className="mt-1">
            {[0, 1, 2].map((i) => (
              <li key={i} className="space-y-2 py-3">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 animate-pulse rounded-mo-pill bg-mo-raised" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-28 animate-pulse rounded-mo-pill bg-mo-raised" />
                    <div className="h-2.5 w-20 animate-pulse rounded-mo-pill bg-mo-raised" />
                  </div>
                </div>
                {/* The two buttons' own height, so the card does not jump by
                    44px a row when the real list lands. */}
                <div className="h-11 animate-pulse rounded-mo-pill bg-mo-raised" />
              </li>
            ))}
          </ul>
        )}

        {status === "error" && (
          // Not `role="alert"`: a rail that could not load is not worth
          // interrupting a screen reader mid-post for. It is still said.
          <p className="mt-2 text-sm text-mo-body">
            Suggestions did not answer. They will be here next time.
          </p>
        )}

        {status === "ready" && items.length === 0 && (
          <p className="mt-2 text-sm text-mo-body">
            No suggestions right now. When the ranker has someone for you, they
            will appear here — nobody is put here to fill the space.
          </p>
        )}

        {status === "ready" && items.length > 0 && (
          <ul className="mt-1 divide-y divide-mo">
            {items.map((suggestion) => (
              <SuggestionRow
                key={suggestion.candidate_user_id}
                suggestion={suggestion}
                basePath={basePath}
                reasonId={reasonId}
                onSay={say}
              />
            ))}
          </ul>
        )}

        {/* The Message control's one shared explanation, pointed at by every
            row's `aria-describedby`. One sentence rather than five copies of
            it — exactly what ./LeftRail does for the app-only destinations. */}
        <p id={reasonId} className="mt-3 flex items-start gap-2 border-t border-mo pt-3 text-xs leading-snug text-mo-body">
          <MessageCircle
            aria-hidden="true"
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-mo-muted-lg"
          />
          <span>{MESSAGE_REASON}</span>
        </p>

        {/* Always rendered, so there is a live region to announce INTO — a
            `role="status"` that appears at the same moment as its text is a
            region the announcement can be missed by. */}
        <div role="status" aria-live="polite" className="empty:hidden">
          {notice && <p className="mt-3 text-xs text-mo-body">{notice}</p>}
        </div>
      </section>

      <p className="mt-4 flex items-start gap-2 px-1 text-xs text-mo-body">
        <UserPlus aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-mo-muted-lg" />
        Following someone is one-sided and takes effect at once. A private
        account turns it into a request they see first.
      </p>

      {/* The zone's own card — "Trending Topics" in apps/social. */}
      {extra && <div className="mt-4">{extra}</div>}
    </aside>
  )
}
