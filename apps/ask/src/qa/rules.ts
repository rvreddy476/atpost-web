/**
 * Pure rules the Ask screens share. Mirrors Android's QaRules.kt.
 */
import { isOwnPost } from "./byline"
import { STATUS_OPEN } from "./wire"

/** The server refuses a shorter title; the composer should not let it try. */
export const MIN_TITLE = 10
export const MAX_TITLE = 300
export const MIN_ANSWER = 1
/** `GET /questions/similar` needs at least this much to say anything useful. */
export const MIN_SIMILAR_QUERY = 12
/** `GET /search` refuses fewer than two characters. */
export const MIN_SEARCH_QUERY = 2
export const MAX_TAGS = 5
export const MAX_TAG_LENGTH = 32

export const PAGE_SIZE = 20
export const SIMILAR_LIMIT = 5

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID.test(value)
}

/** Postable when the title is long enough and at least one topic is chosen — the server enforces both. */
export function canAsk(title: string, topicIds: readonly string[]): boolean {
  const length = title.trim().length
  return length >= MIN_TITLE && length <= MAX_TITLE && topicIds.length > 0
}

export function canAnswer(body: string): boolean {
  return body.trim().length >= MIN_ANSWER
}

export function shouldCheckSimilar(title: string): boolean {
  return title.trim().length >= MIN_SIMILAR_QUERY
}

export function canSearch(query: string | null | undefined): boolean {
  return (query ?? "").trim().length >= MIN_SEARCH_QUERY
}

export function isOpen(status: string): boolean {
  return status === STATUS_OPEN
}

/** Only the question author may mark an answer best, and only while the question is open. */
export function canSelectBestAnswer(questionAuthorId: string, viewerId: string | null | undefined, status: string): boolean {
  return isOwnPost(questionAuthorId, viewerId) && isOpen(status)
}

/**
 * Tags typed as free text: split on commas or whitespace, lower-cased, a
 * leading `#` dropped, de-duplicated, capped.
 */
export function parseTags(raw: string): string[] {
  const out: string[] = []
  for (const piece of raw.split(/[,\s]+/)) {
    const tag = piece.replace(/^#+/, "").trim().toLowerCase().slice(0, MAX_TAG_LENGTH)
    if (tag && !out.includes(tag)) out.push(tag)
    if (out.length >= MAX_TAGS) break
  }
  return out
}

export function toggleId(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]
}

/** Best answer pinned first, then the server's order. */
export function orderAnswers<T extends { id: string; is_best: boolean }>(answers: readonly T[], bestAnswerId: string | null): T[] {
  const isBest = (a: T) => a.is_best || (bestAnswerId !== null && a.id === bestAnswerId)
  return [...answers.filter(isBest), ...answers.filter((a) => !isBest(a))]
}

export function answerCountLabel(count: number): string {
  return count === 1 ? "1 answer" : `${count} answers`
}

export function voteCountLabel(count: number): string {
  return Math.abs(count) === 1 ? `${count} vote` : `${count} votes`
}
