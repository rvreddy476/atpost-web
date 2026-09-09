/**
 * Sound, and the two facts a browser makes you separate.
 *
 * ── The thing browsers actually forbid ────────────────────────────────────
 * Not "loud video". A video that tries to autoplay with sound before the
 * document has had a qualifying user gesture DOES NOT PLAY AT ALL: `play()`
 * returns a promise that rejects, the element stays at its poster, and nothing
 * is logged unless somebody catches it. So "start unmuted" is not a louder
 * version of the feature — it is the feature not existing. Every autoplay in
 * this package therefore starts muted, and always will.
 *
 * What a browser DOES allow is sound once the person has touched the page.
 * Chrome unblocks audible playback for the origin after a click or a tap (it
 * additionally softens the rule with its Media Engagement Index, which we
 * cannot see and must not depend on); Firefox does the same on interaction;
 * Safari is stricter and may refuse anyway, which is why nothing here believes
 * its own answer — see `noteUnmutedPlaybackRefused` at the bottom.
 *
 * So this module holds one bit — "may the NEXT video start with sound?" — and
 * the whole design is about when that bit is allowed to change and, more
 * importantly, what it is NOT allowed to do when it does.
 *
 * ── The failure mode this is shaped around ───────────────────────────────
 * Somebody presses a button in the header and a video three cards down starts
 * blaring. That is the only way this feature can be worse than no feature, and
 * two properties together make it structurally impossible rather than
 * unlikely:
 *
 *   1. ARMING IS NOT RETROACTIVE. Nothing in here reaches for a video. There
 *      is no subscriber list and no notification, on purpose: a player reads
 *      `soundIsArmed()` IMPERATIVELY at the moment it starts a playback, and
 *      never again for the life of that playback. A video that is already
 *      running when the bit flips keeps the sound state it started with. This
 *      is also exactly the behaviour the product asked for — "sound from the
 *      second video onward", which is what Instagram and TikTok do on the web.
 *
 *   2. ONLY ONE VIDEO IS EVER PLAYING. `autoplay.ts` returns a single active
 *      id, and `manualPlayback.ts` arbitrates the one case the coordinator
 *      does not watch. A card three positions down is paused, so it has
 *      nothing to blare with.
 *
 * Together: the only element that can make a noise is the one on screen, and
 * it will not change its mind under the person's hands. That is why the
 * gesture does NOT need to be narrowed to a press on a player — and narrowing
 * it would have gutted the feature anyway, because the only gestures that land
 * on a player are the picture (which pauses) and the speaker (which already
 * unmutes explicitly). There would have been nothing left to arm on.
 *
 * ── Why a module-level holder and not React ──────────────────────────────
 * The same argument `manualPlayback.ts` makes, and this file deliberately
 * copies its shape rather than inventing a second mechanism. The fact is a
 * property of the DOCUMENT — one document, one gesture history — and every
 * player in the feed has to agree about it, including one mounted ten minutes
 * later by an infinite scroll. A React context would need a common ancestor,
 * which does not exist across a package boundary: the provider would live in
 * the zone, and @momentum/content and tube would each have to remember to wrap
 * themselves in it. One module, one holder, nothing to forget.
 *
 * ── Not persisted, and that is a decision ────────────────────────────────
 * See `soundIsArmed`.
 */

/**
 * Has the document had a qualifying gesture AND does the viewer want sound?
 *
 * The two questions are deliberately one bit rather than two. Keeping them
 * apart would let the code express "the viewer wants sound but the browser has
 * not been touched", and the only thing a player could do with that state is
 * attempt an unmuted play that is certain to be refused — a dead frame and a
 * retry on every video, which is precisely the bug this file exists to avoid.
 */
let armed = false

/**
 * The browser told us no, so stop asking.
 *
 * Latched for the session and NOT cleared by a later gesture, because the
 * refusal is evidence about the browser rather than about the person: Safari
 * will keep refusing however many times somebody clicks. It is cleared by one
 * thing only — a person pressing the speaker — because that press IS the
 * gesture the browser wanted, in the handler where it wanted it.
 */
let refused = false

/**
 * Has the person used a speaker button at all this session?
 *
 * Once they have, the gesture listeners are done for good — in BOTH
 * directions. Somebody who muted a video deliberately must not have sound
 * handed back to them by their next click on a like button, and somebody who
 * unmuted has already said the thing the listeners were waiting to infer. An
 * explicit answer outranks an inferred one, so the inference stops.
 *
 * Without this, a player mounting after the mute — an infinite scroll produces
 * them continuously — would find `armed` false, reinstall the listeners, and
 * re-arm on the next stray click.
 */
let decided = false

/** How many players are mounted. Listeners exist only while this is > 0. */
let mounted = 0

/** Whether the document listeners are currently attached. */
let listening = false

/**
 * The events that count as a gesture, and the two that famously do not.
 *
 * `scroll` and `mousemove` are NOT user activation in any engine — a page can
 * be scrolled by a fling, by a restored position, by an anchor, by the
 * coordinator itself — and treating them as consent is how a feed ends up
 * making noise at somebody who only moved their thumb. They are absent from
 * this list on purpose; do not add them.
 *
 * `pointerdown` covers mouse, pen and (on every modern engine) touch;
 * `touchend` is kept for engines where a touch does not produce a pointer
 * event that grants activation, and `keydown` is the entire keyboard story.
 */
const GESTURES = ["pointerdown", "keydown", "touchend"] as const

/**
 * Keys that do not mean "I am using this page".
 *
 * Modifiers alone are half a chord and browsers do not treat them as
 * activation. Escape is a dismissal. Tab is the one judgement call: it does
 * grant activation in Chrome, but a keyboard user tabbing PAST a feed on the
 * way to something else has expressed no interest in it, and a keyboard user
 * who actually wants the video will press Space, K or M — all of which are on
 * the player and all of which arrive here as ordinary keydowns.
 */
const NON_ACTIVATING_KEYS = new Set([
  "Escape",
  "Tab",
  "Shift",
  "Control",
  "Alt",
  "AltGraph",
  "Meta",
  "OS",
  "CapsLock",
  "NumLock",
  "ScrollLock",
  "Fn",
  "FnLock",
  "Hyper",
  "Super",
  "Dead",
  "Unidentified",
])

/** Whether a `keydown` for this key is a gesture. Pure, so it is testable. */
export function isActivationKey(key: string): boolean {
  return !NON_ACTIVATING_KEYS.has(key)
}

function onGesture(event: Event): void {
  if (event.type === "keydown") {
    const key = (event as KeyboardEvent).key
    if (typeof key === "string" && !isActivationKey(key)) return
  }
  armed = true
  stopListening()
}

function startListening(): void {
  if (listening || armed || refused || decided) return
  if (typeof document === "undefined") return
  listening = true
  for (const type of GESTURES) {
    /*
      Capture, and passive.

      CAPTURE because a handler somewhere in the tree calling
      `stopPropagation` — the player's own key handler does exactly that, so
      that an arrow key does not also turn a carousel page — would otherwise
      hide the gesture from a listener on the document. The gesture happened;
      whether the app let it bubble is not our business.

      PASSIVE because this must never be the reason a touch feels slow. It
      only sets a boolean, so there is nothing to preventDefault.
    */
    document.addEventListener(type, onGesture, { capture: true, passive: true })
  }
}

function stopListening(): void {
  if (!listening) return
  listening = false
  if (typeof document === "undefined") return
  for (const type of GESTURES) {
    document.removeEventListener(type, onGesture, { capture: true })
  }
}

/**
 * "There is a video on this page now" — called by every player on mount, and
 * the returned function on unmount.
 *
 * Two things are going on and both are load-bearing.
 *
 * THE LISTENERS ARE SHARED AND TEMPORARY. Twenty players do not install sixty
 * listeners; the first one installs three, and the FIRST gesture removes them.
 * A permanent global listener per player is waste, and a page that has already
 * been touched has nothing left to learn.
 *
 * THE CLOCK STARTS HERE, which is the quiet half of the noise defence. A click
 * that happened before any video existed cannot arm sound — so navigating to
 * the feed by clicking "Home" in the nav does not mean the first video greets
 * you with audio. Only a gesture made on a page that already had video on it
 * counts, which is the honest reading of "the viewer's first real interaction"
 * anyway.
 */
export function watchForSoundGesture(): () => void {
  mounted += 1
  startListening()
  let released = false
  return () => {
    if (released) return
    released = true
    mounted = Math.max(0, mounted - 1)
    if (mounted === 0) stopListening()
  }
}

/**
 * May a playback that is starting RIGHT NOW start with sound?
 *
 * Read imperatively at a play start and nowhere else — see property 1 in the
 * header. Anything that read this during render and re-rendered on change
 * would have reintroduced exactly the retroactive unmute this design refuses.
 *
 * ── Persistence: no, and here is the argument ────────────────────────────
 * `localStorage` is available and this deliberately does not use it.
 *
 * The bit is half a statement about the DOCUMENT: "a gesture has happened
 * here". A reload destroys that half — the new document has had no gesture —
 * and no storage can restore it. Persisting the other half alone would mean
 * every video of the new session attempts an unmuted start, is refused, and
 * falls back: a stutter at the top of every page load, in exchange for
 * guessing at a permission we do not hold. (Chrome's Media Engagement Index
 * might allow it for a heavy user; it is unobservable, so we would be shipping
 * behaviour that differs per person with no way to reproduce a report.)
 *
 * The product argument points the same way and is the stronger one. The cost
 * of not persisting is one silent video per session. The cost of persisting is
 * that a page opened in a background tab, or reopened in a room where sound is
 * not welcome, can start talking before the person has touched anything —
 * unexpected noise, at the one moment they have the least warning. A person
 * returning to a quiet page is not surprised by quiet. Instagram and TikTok
 * both pay the one-silent-video cost on the web, for this reason.
 */
export function soundIsArmed(): boolean {
  return armed && !refused
}

/**
 * The person pressed a speaker and turned sound ON.
 *
 * The strongest signal there is — a deliberate press, in a gesture handler,
 * saying "I want to hear this" — so it arms directly rather than waiting for
 * the listeners, and it clears a previous refusal because this press is
 * precisely the gesture the browser was holding out for.
 *
 * What it changes is the DEFAULT for videos that have not been touched. It
 * does not reach into any player: a player that has been given its own answer
 * keeps it, which is the rule `MomentumVideo`'s `userMuted` enforces and which
 * this must never be allowed to undo.
 */
export function armSound(): void {
  armed = true
  refused = false
  decided = true
  stopListening()
}

/**
 * The person pressed a speaker and turned sound OFF.
 *
 * Also a change to the default and nothing more. Somebody who silences a video
 * means "I do not want to be hearing things", not "silence this one clip", and
 * a feed that started shouting again two cards later would be ignoring the
 * clearest instruction it has been given. Players already playing are
 * untouched — same non-retroactivity rule, in the other direction.
 *
 * It also ends the inference for good (see `decided`): after this, no amount
 * of clicking around the page brings the sound back. Only another press of a
 * speaker does, which is the only place the person can see what they are
 * asking for.
 */
export function disarmSound(): void {
  armed = false
  decided = true
  stopListening()
}

/**
 * An unmuted `play()` was refused. Believe it.
 *
 * This is the browser telling the truth, and the truth is about the browser:
 * Safari will refuse the next one too, and the one after that. Without this
 * latch every video for the rest of the session would attempt an unmuted
 * start, fail, and restart muted — a visible hitch at the top of every video,
 * repeated forever, in pursuit of a permission that is not coming.
 *
 * The caller's other job is the one that matters more: fall back to muted and
 * KEEP PLAYING. A refusal that is merely swallowed leaves a dead frame, which
 * is how this feature turns into "the videos stopped working".
 */
export function noteUnmutedPlaybackRefused(): void {
  refused = true
  armed = false
  stopListening()
}

/** Tests only. There is no production reason to reach in here. */
export function __resetSoundPreference(): void {
  stopListening()
  armed = false
  refused = false
  decided = false
  mounted = 0
}
