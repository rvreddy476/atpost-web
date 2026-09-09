/**
 * The analytics surface this zone reports, and why this one is real.
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
 * `"posttube"` is one of the five, and this zone is the reason it exists —
 * `POSTTUBE` is the Android module id for Tube (`AppModule.POSTTUBE`, and the
 * `platform=posttube` argument on the home feed). So unlike apps/reels, which
 * has to settle for `"feed"` because there is no arm for short-form vertical
 * video and `"reels"` would be silently stored as `"other"`, long video has a
 * dimension of its own and gets it.
 *
 * That silent storage is worth restating, because it is what makes guessing
 * here expensive: the switch does not error. An unrecognised value is accepted
 * by the request, reported as accepted, and written down as `"other"` — not a
 * rejected batch anybody would notice, but a lost dimension on the events a
 * creator is PAID from.
 *
 * The mirrors that have to agree are `packages/analytics/src/contract.ts`'s
 * `AnalyticsSurface` union and Android's `AnalyticsContract.kt` enum. Both
 * already carry `posttube`, which is why this is a one-word file and not a
 * server change.
 */

import type { AnalyticsSurface } from "@momentum/analytics"

export const SURFACE: AnalyticsSurface = "posttube"
