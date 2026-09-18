"use client"

/**
 * The tokens from ./linkify.ts, drawn.
 *
 * Used by the description panel and by every comment body, which is why it is
 * its own component: "a timestamp in the text seeks the player" should be true
 * of the whole page, not of one panel. A viewer who learns it under the video
 * and finds it dead in "2:13 is the good bit" three comments down has learned
 * something false.
 *
 * ── A timestamp is a <button>, a link is an <a> ───────────────────────────
 * Because that is what each of them IS. The timestamp does not navigate: it
 * moves the playhead of a video that is already playing, which is the whole
 * argument in ./expand.ts for why this page has no second route. A `<button>`
 * is in the tab order for free, answers Enter and Space without a key handler,
 * and is announced as a control rather than as a destination.
 *
 * ── The links carry rel ───────────────────────────────────────────────────
 * A URL in a description is written by whoever uploaded the video.
 * `rel="noopener noreferrer nofollow"` on every one of them: `noopener` because
 * a target it opens must not get a handle on this window, and `nofollow`
 * because a video description is user-generated and must not pass ranking to
 * whatever somebody pasted into it.
 */

import Link from "next/link"
import { tubeSearchHref } from "@/chrome/search"
import { channelHref } from "@/tube/channels"
import { parseRichText } from "./linkify"

export interface RichTextProps {
  text: string
  /** The video's length, so a number past the end stays text. See linkify.ts. */
  durationMs?: number
  /** Move the playhead. Absent means timestamps are drawn as plain text. */
  onSeek?: (ms: number) => void
  className?: string
}

const LINK =
  "text-mo-cyan underline-offset-2 hover:underline " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-mo-cyan"

export function RichText({ text, durationMs = 0, onSeek, className }: RichTextProps) {
  const tokens = parseRichText(text, durationMs)

  return (
    <span className={className}>
      {tokens.map((token, index) => {
        // The index is a legitimate key here and only here: the token list is
        // derived from one immutable string, so a token's position IS its
        // identity and the list is never reordered or spliced.
        const key = `${token.kind}-${index}`

        switch (token.kind) {
          case "timestamp":
            if (!onSeek) return <span key={key}>{token.text}</span>
            return (
              <button
                key={key}
                type="button"
                onClick={() => onSeek(token.seconds * 1000)}
                className={`${LINK} font-mono tabular-nums`}
              >
                {token.text}
                <span className="sr-only"> — play from here</span>
              </button>
            )

          case "hashtag":
            return (
              <Link key={key} href={tubeSearchHref(token.text)} className={LINK}>
                {token.text}
              </Link>
            )

          case "mention":
            // A mention resolves to a channel by handle, which is the same
            // address the name under the video links to. `channelHref` owns
            // the "@" normalisation; a second one here is the drift that made
            // `videoHref` need a test.
            return (
              <Link key={key} href={channelHref(token.handle)} className={LINK}>
                {token.text}
              </Link>
            )

          case "url":
            return (
              <a
                key={key}
                href={token.href}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className={LINK}
              >
                {token.text}
              </a>
            )

          default:
            return <span key={key}>{token.text}</span>
        }
      })}
    </span>
  )
}
