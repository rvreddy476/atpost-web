# Playback fixtures: the one contract both clients are measured against

Plan Phase 5A, audit M-12. A creator is paid on `is_display_view` and
`view_score`, and both are computed by analytics-service from the
heartbeat stream a client sends. Two clients that turn the same viewer
behaviour into different streams are a payout bug that surfaces months
later as an unexplainable dashboard difference. These fixtures are the
contract: for each viewer behaviour, the stream a correct client emits
and the session the server must produce from it.

They are exercised from two sides:

- **Server.** `analytics-service/internal/service/playback_contract_test.go`
  reads every `*.json` here (`PLAYBACK_FIXTURES_DIR=<this directory>`,
  skipped when unset), pushes the events through the real ingest service
  into a scratch database, runs the session finaliser where the fixture
  says so, and asserts the `expected` block against the
  `analytics.playback_sessions` row. Run from `Architecture/services/analytics-service`:

  ```
  ANALYTICS_POSTGRES_DSN=postgres://postgres:postgres@127.0.0.1:5432/analytics_it_test?sslmode=disable \
  PLAYBACK_FIXTURES_DIR=/c/workspace/atpost-web/packages/analytics/fixtures/playback \
  go test -tags=integration ./internal/service -run TestPlaybackContractFixtures -count=1 -v
  ```

- **Clients.** The `viewer` narrative is what a client test drives through
  its tracker (`packages/player/src/watchTracker.ts` on the web,
  `core/analytics/VideoWatchTracker.kt` on Android); the emitted events
  must match `events` field for field, before the server is involved at
  all. The web tracker passes by construction — the fixtures were written
  from it. Android does not yet; see below.

## Fixture shape

```jsonc
{
  "name": "plain_watch_to_end",
  "description": "...",                     // what happened and why it matters
  "viewer": ["0-30 s: plays continuously"], // the behaviour a client test replays
  "content": { "content_type": "flick", "duration_ms": 30000 },
  "events": [
    // In order. at_ms is wall-clock since play_start. payload is the wire
    // payload minus content_id / session_id / surface, which the harness adds.
    { "type": "play_start",      "at_ms": 0,    "payload": { ... } },
    { "type": "watch_heartbeat", "at_ms": 5000, "payload": { ... } },
    // Not a client event: the server's SessionFinalizer ran at this wall
    // time (it closes sessions quiet for 10 minutes).
    { "type": "server_finalizer_tick", "at_ms": 670000 },
    { "type": "play_end",        "at_ms": 30000, "payload": { ... } }
  ],
  "expected": {
    "watched_ms": 30000,          // required: credited watch time (GREATEST of every running total)
    "watched_ms_reported": 30000, // the client's raw figure kept for audit
    "covered_ms": 30000,          // required: unique seconds seen, from the coverage bitmap
    "loop_count": 0,              // required: capped at 20, from play_end only
    "seek_count": 0,
    "percent_viewed": 100,
    "percent_covered": 100,
    "is_display_view": true,      // required
    "view_score": 1.0,            // required: percent_covered / 100 when a display view, else 0
    "finalize_reason": "play_end",// play_end | inactivity | superseded
    "end_reason": "ended",        // null when no play_end arrived
    "sessions": 1                 // rows for this viewer + content
  },
  "notes": "..."                  // optional; where a fixture pins something worth knowing
}
```

Heartbeats are on the web cadence (every 5 s of wall clock, only when
watch time grew) and `watched_ms_increment` is **media time**, the
playhead delta — on both clients. At 2x a five-second beat carries
`watched_ms_increment: 10000`. The server must not scale it by
`playback_speed` again (`speed_2x` pins this).

## The fixtures

| fixture | behaviour | what it pins |
|---|---|---|
| `plain_watch_to_end` | 30 s flick, start to finish | the baseline: 30000 / 30000 / display / 1.0 |
| `pause_and_resume` | 10 s, 60 s pause, 20 s | a pause adds nothing, sends nothing, keeps the session |
| `forward_seek` | 10 s, scrub to 30 s of 40, 10 s | a seek adds no watch time and no coverage; `seek_count` 1 |
| `backward_seek_and_rewatch` | 20 s, scrub back to 10 s, 20 s | `watched_ms` 40000 (rewatch counts) vs `covered_ms` 30000 (it does not) |
| `loop_past_twenty` | 5 s flick, 25 wraps | `loop_count` capped at 20; coverage is one pass |
| `speed_2x` | 5 s wall at 2x, swipe away | media-time increments; 10000 covered, not 20000 |
| `backgrounded_then_resumed` | 10 s, tab hidden 12 min, 20 s | one session across a backgrounding; the finaliser's inactivity close is corrected by later events |
| `tab_closed_no_final_event` | 10 s, tab closed | heartbeats alone carry the view; closed by `inactivity` (M-08) |
| `slow_tick_continuous_watch` | continuous watch, one 3 s late sample | a late tick is watching, not a seek |

## Android divergences (for the next Android session)

The plan lists three. Each has a fixture whose `events` Android would not
produce from the same `viewer` behaviour; that fixture is the target.

1. **Backgrounding mints a new session.** `AnalyticsAppLifecycle.onBackground`
   calls `tracker.endAll(BACKGROUNDED)`, so the view ends with
   `play_end(backgrounded)` and the next play gets a new `session_id`. The
   web tracker pauses and keeps the session. Exposed by
   **`backgrounded_then_resumed`**: Android lands two sessions where the
   fixture expects one (`"sessions": 1`). The server's per-day display-view
   cap neutralises the money effect; watch time and coverage are still
   split across two rows.

2. **A loop wrap is counted and its watch time discarded as a seek.**
   `VideoWatchTracker.accumulateWatched` increments `loopCount` on a wrap,
   then still applies the forward-jump ceiling
   (`SAMPLE_INTERVAL_MS x 2 x speed`) to the wrap delta; a wrap whose tail
   plus head exceeds that (a late sample near the loop boundary) is a loop
   *and* a seek, and its `delta` is dropped. The web tracker skips the
   ceiling on a wrap. Exposed by **`loop_past_twenty`**: Android reports
   the same `loop_count` with a smaller `watched_ms_total` and a non-zero
   `seek_count_increment`.

3. **The seek threshold uses the nominal one-second tick, not the measured
   one.** Android's sampler is `delay(SAMPLE_INTERVAL_MS)` and the ceiling
   is sized from that constant, so a sample that arrives late (the app
   throttled, a slow main thread) sees a playhead delta larger than the
   ceiling and classifies continuous playback as a seek. Exposed by
   **`slow_tick_continuous_watch`**: Android reports `watched_ms_total`
   short by the late tick and `seek_count_increment: 1`. The web tracker
   had the same formula until M-27: `MomentumVideo` passes the measured
   `elapsed` into `sample()`, and `watchTracker.ts` now sizes the ceiling
   as `max(elapsedMs, SAMPLE_INTERVAL_MS) x 2 x speed`, so a late tick
   under continuous playback is credited and a genuine jump is still a
   seek (unit test "a slow tick is not a seek"). Android's sampler has no
   measured elapsed to use; the fix there is to measure the tick and size
   the ceiling from it the same way.

Also queued for that session, from Phase 5D: Android still reports
`surface=feed` for reels and lacks `REELS` in its enum.

## Server behaviour these fixtures pin that may want changing

Fixtures record what the server produces today, so a deliberate change
is a fixture edit in the same commit, not a silent drift.

- **The M-09 clamp binds the `play_end` figure only.** The server clamps a
  `play_end`'s `watched_ms_total` to `duration x (loop_count + 1)` and
  `loop_count` to 20, but the session row keeps the GREATEST of every
  event's running total, and heartbeats carry an unclamped total. So
  `loop_past_twenty` lands `watched_ms: 130000` (26 passes of a 5 s
  flick) beside `loop_count: 20`, where the plan's rule would say 105000;
  `backward_seek_and_rewatch` lands 40000 on a 30 s video. Neither
  changes `is_display_view` or `view_score` (both are coverage-based and
  capped), so no money moves on it today; `watch_time_total_ms` in the
  daily summary is what over-counts. Applying the clamp to the session
  total at finalisation is the fix, and it needs a decision about
  rewatch-by-scrub (fixture 4) — which the plan's rule would also cap at
  one pass. Left for the founder; the two fixtures are where the answer
  gets written down.
