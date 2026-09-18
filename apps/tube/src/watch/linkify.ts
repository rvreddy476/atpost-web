/**
 * Turning a description — or a comment — into the things in it.
 *
 * Pure: a string in, a list of tokens out, no React and no DOM. ./RichText.tsx
 * draws them. The split is what lets the interesting half be tested as a table,
 * and the interesting half is entirely about what must NOT be matched.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * FOUR KINDS, AND THE ONE THAT IS THE POINT
 *
 * A TIMESTAMP — `1:23`, `12:04`, `1:02:33` — seeks the player. It is the reason
 * this file exists: a long video's description is very often a table of
 * contents somebody typed by hand, and on every other video site those numbers
 * are clickable. Ours were text.
 *
 * A HASHTAG links to the tag's page, an @MENTION to a profile, and a URL to
 * itself. Those three are ordinary linkification; the timestamp is a control.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT A TIMESTAMP IS NOT
 *
 * The naive pattern for `m:ss` matches a great deal of prose, and each of these
 * would become a clickable control that throws somebody out of what they were
 * watching:
 *
 *   · a ratio or a score — `4:3`, `2:1`. Rejected because the seconds field
 *     must be exactly two digits: `4:3` is not `4:03`.
 *   · a clock time — `at 14:30`. NOT rejected, and cannot be: `14:30` is a
 *     perfectly ordinary "fourteen minutes thirty" in a chapter list, and the
 *     only way to tell them apart is meaning. The duration check below is the
 *     mitigation: a timestamp past the end of the video is not offered as a
 *     seek, which removes the common case (a wall-clock time in a description
 *     is almost always larger than the video is long).
 *   · a bible verse, a citation, a port number — `3:16`, `localhost:8080`.
 *     `localhost:8080` fails the two-digit rule. `3:16` does not, and is
 *     accepted; that is the residual false positive and it is a seek to three
 *     minutes sixteen, which is recoverable in one press.
 *   · part of a URL — `https://host:8080/x`. Rejected by matching URLs FIRST,
 *     so the whole URL is consumed before the timestamp pattern sees its
 *     insides.
 *
 * The hours field is capped at two digits and the minutes at 59 when hours are
 * present, so `1:02:33` reads as one hour two minutes, and `102:33` reads as a
 * hundred and two minutes rather than as something with a broken hour.
 */

export type RichToken =
  | { kind: "text"; text: string }
  | { kind: "url"; text: string; href: string }
  | { kind: "hashtag"; text: string; tag: string }
  | { kind: "mention"; text: string; handle: string }
  | { kind: "timestamp"; text: string; seconds: number }

/**
 * One pass, with the alternatives in priority order.
 *
 * URL first, so nothing inside one is re-matched. Then the timestamp, then the
 * two sigil forms. `\p{L}\p{N}` for hashtags because a tag is not ASCII —
 * the platform has Telugu and Hindi hashtags today and a `[a-z0-9_]` class
 * would cut each one at its first character.
 */
const PATTERN = new RegExp(
  [
    // A URL, up to the first whitespace, with trailing sentence punctuation
    // left out of the match (handled below).
    "(?<url>https?:\\/\\/[^\\s<>\"]+)",
    // h:mm:ss or m:ss. The seconds are always two digits; that single rule is
    // what rejects "4:3" and "localhost:8080".
    "(?<ts>\\b(?:(?<h>\\d{1,2}):(?<hm>[0-5]\\d)|(?<m>\\d{1,3})):(?<s>[0-5]\\d)\\b)",
    // `\p{M}` alongside `\p{L}\p{N}` is load-bearing, not thoroughness: in an
    // Indic script the vowel signs are COMBINING MARKS, so "#తెలుగు" without it
    // matches exactly one character and renders as "#త".
    "(?<hashtag>#[\\p{L}\\p{M}\\p{N}_]+)",
    "(?<mention>@[A-Za-z0-9_.]{2,30})",
  ].join("|"),
  "gu"
)

/** Punctuation a sentence ends with, which a URL match greedily swallows. */
const TRAILING = /[.,;:!?)\]}'"]+$/

/**
 * Seconds from a matched timestamp's parts.
 *
 * Exported because "what does 1:02:33 mean" is the one piece of arithmetic here
 * that can be wrong in a way nobody notices until a seek lands in the wrong
 * place.
 */
export function timestampSeconds(parts: {
  hours?: string
  minutes: string
  seconds: string
}): number {
  const h = parts.hours ? Number(parts.hours) : 0
  return h * 3600 + Number(parts.minutes) * 60 + Number(parts.seconds)
}

/**
 * Split a body into its tokens.
 *
 * `durationMs` is the length of the video, when it is known. A number past the
 * end is kept as TEXT rather than dropped or clamped: it is almost certainly
 * not a timestamp (see the header), and a control that seeks to the end
 * whatever you click is worse than plain text. `0` means "unknown", which is
 * what the player reports before metadata lands, and unknown does not filter.
 */
export function parseRichText(body: string, durationMs = 0): RichToken[] {
  const tokens: RichToken[] = []
  if (!body) return tokens

  let last = 0
  const push = (text: string) => {
    if (text) tokens.push({ kind: "text", text })
  }

  for (const match of body.matchAll(PATTERN)) {
    const index = match.index ?? 0
    const groups = match.groups ?? {}
    push(body.slice(last, index))
    last = index + match[0].length

    if (groups.url) {
      // Trailing punctuation belongs to the sentence, not to the address: a
      // link that ends in "." 404s on a great many hosts.
      const trimmed = groups.url.replace(TRAILING, "")
      const dropped = groups.url.slice(trimmed.length)
      tokens.push({ kind: "url", text: trimmed, href: trimmed })
      push(dropped)
      continue
    }

    if (groups.ts) {
      const seconds = timestampSeconds({
        hours: groups.h,
        minutes: groups.h ? (groups.hm ?? "0") : (groups.m ?? "0"),
        seconds: groups.s ?? "0",
      })
      const beyond = durationMs > 0 && seconds * 1000 > durationMs
      if (beyond) push(groups.ts)
      else tokens.push({ kind: "timestamp", text: groups.ts, seconds })
      continue
    }

    if (groups.hashtag) {
      tokens.push({ kind: "hashtag", text: groups.hashtag, tag: groups.hashtag.slice(1) })
      continue
    }

    if (groups.mention) {
      tokens.push({ kind: "mention", text: groups.mention, handle: groups.mention.slice(1) })
      continue
    }
  }

  push(body.slice(last))
  return tokens
}
