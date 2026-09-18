# @momentum/player

HLS playback, the one-video-at-a-time autoplay policy, and the watch tracker
that feeds the payout numbers.

The boundary has not moved: **this package takes a source and emits events.**
It imports no API client, builds no URL and makes no request. A zone resolves
its own URLs and passes them in — which is what lets tube mount the same player
against a different analytics surface, and is the only reason any of this can be
tested without a gateway. `hls.js` is still imported **dynamically**, on the
first attach, never at module load.

---

## One switch: `chrome`

```tsx
<MomentumVideo source={source} active={active} muted />              // minimal
<MomentumVideo source={source} active muted={false} chrome="full" /> // everything
```

| | `"minimal"` (default) | `"full"` |
|---|---|---|
| play/pause, picture press, speaker, seek bar, resting hairline | ● | ● |
| buffered ranges, scrub tooltip, chapter ticks | | ● |
| volume slider, speed, quality, captions, gear menu | | ● |
| fullscreen, picture-in-picture | | ● |
| keyboard | Space/K, M, ←/→, Home/End, 0–9 | …plus `<` `>` `c` `f` `i` ↑ ↓ |

**The default is the small one and that is the compatibility promise.** A caller
that says nothing gets exactly the player it had before any of this existed —
@momentum/content's feed and apps/reels both depend on that, and
`chromeFeatures("minimal")` returning all-false is asserted in `chrome.test.ts`.
Reels in particular binds ArrowUp/ArrowDown to "previous/next reel" *because*
the player did not claim them (`apps/reels/src/reels/keys.ts`), and the player
calls `stopPropagation` on every key it claims — so a new chord is live only
where its control is.

`features` overrides individual flags on top of the preset. `undefined` in an
override means "say nothing", not "off".

---

## Props

Everything below is additive; nothing existing changed shape.

| Prop | Type | What it is |
|---|---|---|
| `chrome` | `"minimal" \| "full"` | Which controls exist. Default `"minimal"`. |
| `features` | `Partial<PlayerFeatures>` | Per-feature overrides: `speed`, `quality`, `captions`, `fullscreen`, `pictureInPicture`, `volume`, `buffered`, `tooltip`, `chapters`, `settings`. |
| `viewerId` | `string \| null` | Namespaces the remembered preferences. Never sent anywhere. Omit for the shared anonymous key. |
| `chapters` | `{ startMs, title }[]` | Ticks on the scrubber and the chapter name beside the clock. Deliberately not the wire shape — the caller maps. |
| `captions` | `CaptionSource[]` | `{ language, label, src, default?, kind? }`, one per row of `GET /v1/subtitles/{mediaId}`. Rendered as `<track>` children. |
| `fullscreenTarget` | `() => HTMLElement \| null` | The box to take fullscreen. Defaults to the player's own. A getter, so an element held in state can be passed directly. |
| `onToggleFullscreen` | `() => void` | Delegate fullscreen to the caller. The button and `f` call this instead of the API. |
| `isFullscreen` | `boolean` | The caller's state, when it is the caller's to own. |
| `videoRef` | `Ref<HTMLVideoElement>` | The real `<video>`, as an object or a callback ref — so no zone has to `querySelector("video")` inside this package's subtree. Not a second owner of playback: `active` still decides. |
| `onTimeUpdate` | `(currentMs, durationMs) => void` | The playhead, throttled to `TIME_UPDATE_INTERVAL_MS` with seeks let through at once. Milliseconds both; `0`, never `NaN`, before metadata. Not the watch tracker — nothing here reaches analytics. |

### `muted` is controlled — by its **changes**, not its value

A **change** to `muted` becomes this player's answer, exactly as a press of its
own speaker does. Passing a constant behaves as it always has, which is what
keeps @momentum/content's feed and apps/reels working: a prop that won on every
render would overwrite a speaker press a frame after it happened.

Precedence, highest first — `resolveMuted` in `controlled.ts`, all of it tested:

1. **A browser refusal.** The element *is* muted; a speaker glyph saying
   otherwise would be the UI lying about audio.
2. **This player's answer** — its speaker, or a changed `muted` prop.
3. **`soundPreference.ts`'s document-wide arming**, which only ever decides what
   an *untouched* player starts as.
4. **`muted` as a cold default.**

So when a controlled `muted` and the arming disagree, **the prop wins for this
player**, and arming keeps deciding every other one. A prop change does *not*
arm or disarm the document: only a real gesture on a speaker moves that, because
a consumer re-rendering with a new boolean is not a person pressing anything.

### What is remembered, and where

`localStorage`, under `momentum.player.<name>.<viewerId|anon>`: **speed**,
**quality** (a height, never a level index — an index means a different quality
on every ladder), **caption language** and **volume**. Every read and write is
wrapped: `window.localStorage` is a getter that raises `SecurityError` before
any access in a browser with site data blocked, and an unguarded read during
render takes the tree down. Absent or unparseable always means the default.

Sound-on-first-gesture is **not** stored and must not be — `soundPreference.ts`
has that argument in full.

---

## Keyboard

Claimed only when the player has focus, and `stopPropagation`'d so a carousel or
a reels scroller underneath never sees a key the player took. Modifier chords
are never claimed (Ctrl+← is "back"; Cmd+M minimises the window).

| Key | Action | Needs |
|---|---|---|
| `Space` / `K` | play / pause | always |
| `M` | mute / unmute | always |
| `←` `→` | seek ∓5s | always |
| `Home` / `End` | start / end | always |
| `0`–`9` | jump to that tenth | always |
| `<` `>` | one step down / up the speed list | `speed` |
| `↑` `↓` | volume ±5% | `volume` |
| `C` | captions on / off (last used language) | `captions`, and a track exists |
| `F` | fullscreen | `fullscreen`, and the element supports it |
| `I` | picture-in-picture | `pictureInPicture`, and the document allows it |
| `Esc` | leave the gear menu, focus back on the gear | menu open |

Inside an open gear menu the arrows move the highlight, `Enter`/`Space` choose,
`←` goes back a page and `Esc` closes — the video's own keys are ignored for as
long as it is open, so `↑` cannot both move the highlight and change the volume.
`Tab` is never claimed: a menu inside a video may not be a focus trap.

---

## Coordinating fullscreen with a page that already has it

Tube's watch page owns its expansion: `apps/tube/src/watch/expand.ts` has a
theatre fallback for browsers that refuse the Fullscreen API and a document
scroll lock that goes with it. Two owners for one expansion is a player that
enters fullscreen and immediately leaves it, so tube passes the delegate and
switches the player's own **button** off:

```tsx
chrome="full"
features={{ fullscreen: false }}   // tube draws its own "Full video" control
onToggleFullscreen={expand.toggle} // …and `f` still reaches it
isFullscreen={isExpanded(expand.mode)}
```

Whatever `fullscreenTarget` returns **must never be re-parented**. Moving the
player into a portal unmounts hls.js and the `WatchSession` with it: the playhead
goes to zero and one view arrives at analytics as two shorter ones, which is the
number a creator is paid from.

## Captions, and the one thing this package cannot do

A `<track>` has no credentials mode of its own; its fetch follows the `<video>`'s
`crossorigin` attribute. That attribute is **not** set here and must not be — it
governs the media fetch too, and HLS segments are absolute, pre-signed,
cross-origin URLs that a credentialed request cannot load at all.

So a **same-origin** `src` (a gateway path) sends the session cookie and works.
A **cross-origin** `src` that needs credentials cannot be made to work from here,
and the failure is silent: the track exists, the cues never arrive, the CC button
turns on nothing. The way out is for the zone to fetch the VTT itself, with
credentials, and pass a `blob:` URL as `src`.

The chosen track is set to `hidden`, not `showing`, and the cue box is drawn by
this package: `::cue` cannot be given a `--mo-*` colour, and the browser's own
box sits exactly where the transport is.

---

## Testing

`bun --filter @momentum/player test` — vitest, **no jsdom and never any**. The
rules live in pure modules next to the component (`controls.ts`, `chrome.ts`,
`playbackRate.ts`, `quality.ts`, `captions.ts`, `volume.ts`, `chapters.ts`,
`scrubber.ts`, `menu.ts`, `presentation.ts`, `preferences.ts`) precisely so they
can be asserted as values rather than as a screenshot. Anything that needs a
component assertion is rendered with `renderToStaticMarkup` from
`react-dom/server`.
