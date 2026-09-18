/**
 * Chapters, as the player sees them: a start time and a name.
 *
 * ── Deliberately not the wire shape ───────────────────────────────────────
 * apps/tube/src/watch/timeline.ts holds the real chapter model — `chapter_index`,
 * `start_ms`, the server's ordering rules and the list the description renders.
 * That is tube's, and this package must not import an app. What the player
 * needs is two fields, so the prop takes two fields and tube maps its rows on
 * the way in. The alternative — moving the wire type into @momentum/player —
 * would drag the tube API's vocabulary into a package the feed also mounts.
 *
 * The functions here mirror `activeChapterIndex` in that file on purpose: the
 * rule that a chapter is the LAST one starting at or before the playhead, not
 * the nearest, has to be the same in both or the scrubber's highlight and the
 * description's highlight disagree by one row in the middle of a video.
 */

/** One chapter. `startMs` from the start of the video; `title` as authored. */
export interface PlayerChapter {
  startMs: number
  title: string
}

/**
 * The list, cleaned: finite non-negative starts only, ascending.
 *
 * A negative start is dropped rather than clamped to zero, because two
 * chapters clamped to zero are two ticks in the same place and an ambiguous
 * "current chapter" for the first second of the video.
 */
export function orderedPlayerChapters(chapters: readonly PlayerChapter[]): PlayerChapter[] {
  return chapters
    .filter((c) => Number.isFinite(c.startMs) && c.startMs >= 0)
    .slice()
    .sort((a, b) => a.startMs - b.startMs)
}

/**
 * Which chapter is playing, or -1.
 *
 * The LAST one starting at or before the playhead. A chapter is a span that
 * runs until the next begins, so at 61s with chapters at 0 and 60s the answer
 * is the second and stays the second.
 *
 * -1 is a real state, not an error: an author may start their list at 0:12
 * after a cold open, and naming the first chapter during the cold open is a
 * small lie about where you are.
 *
 * Expects `orderedPlayerChapters` output.
 */
export function activePlayerChapter(
  chapters: readonly PlayerChapter[],
  positionMs: number
): number {
  if (!Number.isFinite(positionMs)) return -1
  let found = -1
  for (let i = 0; i < chapters.length; i += 1) {
    if (chapters[i]!.startMs <= positionMs) found = i
    else break
  }
  return found
}

/** The name to print beside the clock, or null when there is nothing to say. */
export function currentChapterTitle(
  chapters: readonly PlayerChapter[],
  positionMs: number
): string | null {
  const index = activePlayerChapter(chapters, positionMs)
  if (index < 0) return null
  const title = chapters[index]!.title.trim()
  return title || null
}

/**
 * Where the ticks go, as fractions of the bar.
 *
 * ── The three exclusions, each of which was a visible defect ──────────────
 * A tick at 0 is not drawn: it sits under the left end cap of the track and
 * reads as a rendering artefact, and every video starts at its first chapter
 * anyway so it marks nothing.
 *
 * A tick at or past the duration is not drawn: chapter lists outlive re-edits,
 * and a marker hard against the right end cap looks like the bar is broken.
 *
 * Nothing at all is drawn before the duration is known. A fraction computed
 * from a duration of 0 is either 0 or Infinity, and a stack of ticks piled on
 * the left end of the bar while the poster is still up is the state people
 * screenshot.
 */
export function chapterMarks(
  chapters: readonly PlayerChapter[],
  durationSeconds: number
): number[] {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return []
  const durationMs = durationSeconds * 1000
  const marks: number[] = []
  for (const chapter of chapters) {
    if (chapter.startMs <= 0 || chapter.startMs >= durationMs) continue
    marks.push(chapter.startMs / durationMs)
  }
  return marks
}
