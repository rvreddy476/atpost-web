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

import { useCallback, useEffect, useState } from "react"
import { UserPlus } from "lucide-react"
import { Avatar, avatarSrc } from "@momentum/content"
import { useSession } from "@atpost/api-client/session"
import { fetchSuggestions, sendConnectionRequest, type Suggestion } from "./api"
import { suggestionReason } from "./suggestions"

type Status = "loading" | "ready" | "error"

/** Per-row state. Only ever moved by an answer from the server. */
type RowState = "idle" | "sending" | "requested" | "failed"

function SuggestionRow({
  suggestion,
  basePath,
}: {
  suggestion: Suggestion
  basePath: string
}) {
  const [state, setState] = useState<RowState>("idle")

  const ask = useCallback(() => {
    if (state === "sending" || state === "requested") return
    setState("sending")
    sendConnectionRequest(suggestion.candidate_user_id)
      // "unknown" is not success. The service answers a literal
      // `{"status":"request_sent"}`; anything else means we do not know what
      // happened, and telling someone their request went out when it may not
      // have is the failure mode worth avoiding here.
      .then((status) => setState(status === "request_sent" ? "requested" : "failed"))
      .catch(() => setState("failed"))
  }, [state, suggestion.candidate_user_id])

  return (
    <li className="flex items-center gap-3 py-2.5">
      <Avatar
        name={suggestion.display_name}
        id={suggestion.candidate_user_id}
        src={avatarSrc({ mediaId: suggestion.avatar_media_id }, basePath)}
        size="sm"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-mo-ink">{suggestion.display_name}</p>
        {/* One line, decided in ./suggestions.ts so the rule is a table test
            rather than a ternary nobody can check. */}
        <p className="truncate text-xs text-mo-body">{suggestionReason(suggestion)}</p>
      </div>
      <button
        type="button"
        onClick={ask}
        disabled={state === "sending" || state === "requested"}
        aria-label={
          state === "requested"
            ? `Friend request sent to ${suggestion.display_name}`
            : `Add ${suggestion.display_name} as a friend`
        }
        className={[
          // 44px tall: this is a real request being sent to a real person and
          // it was a 24px target.
          "inline-flex min-h-[44px] shrink-0 items-center rounded-mo-pill border px-3 text-xs font-semibold transition-colors duration-150 ease-mo",
          state === "requested"
            ? // A settled state recedes; it is not an invitation any more.
              "cursor-default border-mo text-mo-body"
            : state === "failed"
              ? // --mo-bad is #FCA5A5 on the dark card (8.63) and #B91C1C on
                // the white one (6.47). Both AAA/AA as small text, which a
                // "Try again" label is.
                "border-mo-bad text-mo-bad hover:bg-mo-raised"
              : // --brand-accent, not --mo-cyan. The measurement was never the
                // problem — cyan is 6.74 on a dark card and 5.84 on a white
                // one — the ROLE was: tokens.css moves interactivity onto
                // green inside `.mo-light` and leaves cyan as --mo-info, so a
                // cyan "Add" would be a notice-coloured button on a page whose
                // every other pressable thing is green. The alias is #06B6D4
                // in :root and #0B6B37 there: 6.74 and 6.61 on their own card.
                "border-mo-strong text-brand-accent hover:bg-mo-raised disabled:cursor-wait",
        ].join(" ")}
      >
        {state === "requested"
          ? "Requested"
          : state === "failed"
            ? "Try again"
            : state === "sending"
              ? "Sending…"
              : "Add"}
      </button>
    </li>
  )
}

export function RightRail({ basePath }: { basePath: string }) {
  const { signedIn, status: sessionStatus } = useSession()
  const [items, setItems] = useState<Suggestion[]>([])
  const [status, setStatus] = useState<Status>("loading")

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

  if (!signedIn) return <aside aria-hidden="true" className="hidden xl:block" />

  return (
    <aside
      aria-label="Suggestions"
      className="sticky top-14 hidden max-h-[calc(100vh-3.5rem)] overflow-y-auto py-5 pl-2 xl:block"
    >
      <section className="rounded-mo border border-mo bg-mo-surface p-4 shadow-mo">
        <h2 className="font-mo-display text-base font-semibold tracking-mo-display text-mo-ink">
          People to add
        </h2>

        {status === "loading" && (
          <ul aria-hidden="true" className="mt-1">
            {[0, 1, 2].map((i) => (
              <li key={i} className="flex items-center gap-3 py-2.5">
                <div className="h-8 w-8 animate-pulse rounded-mo-pill bg-mo-raised" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-28 animate-pulse rounded-mo-pill bg-mo-raised" />
                  <div className="h-2.5 w-20 animate-pulse rounded-mo-pill bg-mo-raised" />
                </div>
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
              />
            ))}
          </ul>
        )}
      </section>

      <p className="mt-4 flex items-start gap-2 px-1 text-xs text-mo-body">
        <UserPlus aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-mo-muted-lg" />
        Adding someone sends them a request. They see it before you see each
        other&rsquo;s posts.
      </p>
    </aside>
  )
}
