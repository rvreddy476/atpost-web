/**
 * The analytics surface this zone reports, and why it is not "reels".
 *
 * ── What the server accepts ───────────────────────────────────────────────
 * analytics-service's `normalizeSurface` (internal/service/ingest.go) is a
 * five-arm switch:
 *
 *     case "feed", "posttube", "profile", "search", "channel":
 *             return strings.ToLower(strings.TrimSpace(value))
 *     default:
 *             return "other"
 *
 * There is no arm for short-form vertical video. `"reels"`, `"flicks"` and
 * `"shorts"` would every one of them be accepted by the request — the switch
 * does not error — and stored as `"other"`. That is the worst failure
 * available: not a rejected batch anyone would notice, but a silently lost
 * dimension on the events a creator is PAID from.
 *
 * (There is a `reels_feed` string in the repo, in a doc comment on
 * `model/video_events.go`'s `VideoEventCommon`. That struct documents a
 * different, older shape which the ingest path never decodes. It is not a
 * licence to send `reels_feed` here.)
 *
 * ── What the Android client sends from the same screen ────────────────────
 * `"feed"`. `ReelsViewModel.startWatchAnalytics` passes
 * `surface = AnalyticsSurface.FEED`, and `AnalyticsSurface` is the same
 * five-value enum with the same comment on it. So Android's Reels and
 * Android's home feed are already indistinguishable in this dimension, by
 * decision rather than by accident.
 *
 * This zone matches the phone. Sending anything else would put web reels in
 * the `"other"` bucket while phone reels are in `"feed"`, which makes the two
 * clients' numbers incomparable — a strictly worse outcome than sharing a
 * bucket with the home feed.
 *
 * ── If reels ever needs its own dimension ─────────────────────────────────
 * It takes a server change, not a client one: a sixth arm in
 * `normalizeSurface`, then the two client mirrors (`AnalyticsContract.kt`'s
 * enum and `packages/analytics/src/contract.ts`'s `AnalyticsSurface` union)
 * and the Kotlin test that pins the accepted set. Until all four move
 * together the value is discarded.
 */

import type { AnalyticsSurface } from "@momentum/analytics"

export const SURFACE: AnalyticsSurface = "feed"
