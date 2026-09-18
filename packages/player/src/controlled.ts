/**
 * The three things a zone with its own chrome needs from this player, as rules.
 *
 * MShorts was reaching into the player's subtree for the `<video>` element and
 * driving it directly. That works until the day an element moves, and then it
 * fails silently on somebody else's surface. So the three things it actually
 * wanted are props now, and the parts of them that are decisions rather than
 * plumbing are here, where they can be asserted as values.
 *
 * Every one of them is INERT when the prop is absent: no forwarded ref, no
 * callback, and a `muted` that never changes all behave exactly as they did.
 */

/* ── 1. Forwarding the element ───────────────────────────────────────────── */

/**
 * React's two ref shapes, written out because this package cannot use
 * `useImperativeHandle`: the caller wants the REAL element, not a handle.
 */
export type ElementRef<T> = ((value: T | null) => void) | { current: T | null } | null | undefined

/**
 * Put a value into whichever kind of ref this is.
 *
 * A caller writes `ref={someRef}` (an object) or `ref={(el) => setEl(el)}` (a
 * function) and must not have to care which one this package supports. The
 * absent case is the common one and is not an error — most callers pass
 * nothing at all.
 *
 * A function ref that throws is NOT caught: it is the caller's code, and
 * swallowing an exception from it would hide their bug inside our player.
 */
export function assignRef<T>(ref: ElementRef<T>, value: T | null): void {
  if (!ref) return
  if (typeof ref === "function") {
    ref(value)
    return
  }
  ref.current = value
}

/* ── 2. Telling a consumer where the playhead is ─────────────────────────── */

/**
 * How often `onTimeUpdate` may fire, in ms.
 *
 * The same 1000ms the watch tracker samples at, and deliberately so: the
 * element's own `timeupdate` fires at a rate the BROWSER chooses — about 4Hz
 * normally, far more during a seek, and throttled to almost nothing in a
 * background tab. Handing that raw to a consumer means their state updates at
 * a rate they cannot predict and did not ask for, which on a zone that renders
 * a progress bar from it is four wasted renders a second per video.
 *
 * It is a separate constant from `SAMPLE_INTERVAL_MS` even though they are
 * equal today, because they answer to different things: that one is the
 * arithmetic the payout numbers assume, and it may not be changed to make a
 * consumer's progress bar smoother.
 */
export const TIME_UPDATE_INTERVAL_MS = 1_000

/** What the throttle remembers between calls. `null` means nothing yet. */
export interface TimeUpdateMemo {
  lastEmitAtMs: number | null
  lastCurrentMs: number
}

/**
 * May this `timeupdate` reach the consumer?
 *
 * Three yeses, and the third is the one a naive throttle gets wrong:
 *
 *   · the FIRST one always does. A consumer that is told nothing until a
 *     second has passed shows 0:00 over a video that is already playing.
 *   · one per interval after that, which is the throttle.
 *   · and any JUMP, whatever the clock says. A seek moves the playhead by more
 *     than the interval in a single frame, and a consumer that only heard
 *     about it up to a second later would draw its scrubber in the wrong place
 *     for that whole second — the one moment a person is watching the scrubber
 *     rather than the video. Backwards counts too, which is what a rewind and
 *     a loop both look like.
 */
export function shouldEmitTimeUpdate(
  memo: TimeUpdateMemo,
  nowMs: number,
  currentMs: number,
  intervalMs: number = TIME_UPDATE_INTERVAL_MS
): boolean {
  if (memo.lastEmitAtMs === null) return true
  if (!Number.isFinite(nowMs) || !Number.isFinite(currentMs)) return false
  if (nowMs - memo.lastEmitAtMs >= intervalMs) return true
  return Math.abs(currentMs - memo.lastCurrentMs) >= intervalMs
}

/* ── 3. `muted`, made controlled without breaking the callers it had ─────── */

/**
 * Everything that has an opinion about whether this player is silent.
 *
 * All four, in one place, because the precedence between them is the whole of
 * the sound design and it used to be an expression in the middle of a
 * component where nobody could test it.
 */
export interface MutedInputs {
  /** The `muted` prop as it stands right now. */
  prop: boolean
  /** This player's own answer — a speaker press, or a CHANGED prop. */
  answered: boolean | null
  /** The document has had a gesture and this playback started with sound. */
  startedWithSound: boolean
  /** The browser refused an unmuted start on this element. */
  refused: boolean
}

/**
 * Is the element muted, and who decided?
 *
 * In order, and each one outranks everything below it:
 *
 *   1. REFUSAL. The browser said no, so the element IS muted and a speaker
 *      glyph claiming otherwise would be the UI lying about audio. This is not
 *      an opinion and it beats an explicit unmute.
 *   2. THIS PLAYER'S ANSWER — a press of its speaker, or a `muted` prop that
 *      CHANGED (see `mutedPropChanged`). A consumer with its own mute button
 *      and a person pressing ours are the same kind of statement: somebody
 *      decided about this video, so no default may quietly undo it.
 *   3. THE DOCUMENT'S ARMING. Once a real gesture has happened anywhere,
 *      playbacks that START from then on start with sound. It moves what an
 *      UNTOUCHED player defaults to and nothing else — see the header of
 *      ./soundPreference.ts, which is emphatic that it never reaches into a
 *      player that has been given an answer, and never changes what is already
 *      running.
 *   4. THE PROP as a cold default, which is what it has always been and is
 *      still right for a document that has had no gesture at all: a browser
 *      refuses an unmuted autoplay, and the refusal arrives as a rejected
 *      promise rather than an exception, so "unmuted" there is not louder — it
 *      is a video that silently never starts.
 *
 * So when a controlled `muted` and the document-wide arming disagree, the PROP
 * wins for this player, and arming keeps deciding for every other one.
 */
export function resolveMuted(inputs: MutedInputs): boolean {
  if (inputs.refused) return true
  if (inputs.answered !== null) return inputs.answered
  return inputs.startedWithSound ? false : inputs.prop
}

/**
 * Did the caller CHANGE `muted`, as opposed to merely having one?
 *
 * This is what makes the prop controlled without breaking a single existing
 * caller. @momentum/content's feed and apps/reels both pass a constant — the
 * cold-document default — and rely on a press of this player's speaker winning
 * for ever afterwards. A prop that overrode the person on every render would
 * make their speaker button do nothing at all.
 *
 * A change is different: it is the consumer saying something new, in the same
 * way a speaker press is, so it becomes this player's answer. `null` for the
 * previous value means "first render", which is not a change — it is the
 * default arriving, and the default is rank 4 above.
 */
export function mutedPropChanged(previous: boolean | null, next: boolean): boolean {
  if (previous === null) return false
  return previous !== next
}
