/**
 * The analytics surface this zone reports: "reels".
 *
 * ── What the server accepts ───────────────────────────────────────────────
 * analytics-service's `normalizeSurface` (internal/service/ingest.go) is a
 * closed set:
 *
 *     case "feed", "reels", "posttube", "profile", "search", "channel":
 *             return normalized
 *
 * Anything else is stored as `"other"` — the request does not fail — and,
 * since plan 5D (2026-09-11), counted on
 * `analytics_surface_rejected_total{raw}` so a wrong string is visible on
 * /metrics rather than a silently lost dimension on the events a creator is
 * PAID from. Before 5D there was no `"reels"` arm, and this constant was
 * `"feed"` to match the phone; 99.8% of stored rows were `"other"`.
 *
 * ── What the Android client sends from the same screen ────────────────────
 * Still `"feed"`. `ReelsViewModel.startWatchAnalytics` passes
 * `surface = AnalyticsSurface.FEED`, and `AnalyticsContract.kt`'s enum has no
 * REELS value yet. That is the next Android session's change (the enum, the
 * call site, and the Kotlin test that pins the accepted set); until it lands,
 * phone reels sit in `"feed"` and web reels in `"reels"`. The server accepts
 * both, and the split is the point: it is the only way to ever tell the two
 * surfaces apart.
 *
 * ── The mirrors that must move together ───────────────────────────────────
 * `normalizeSurface` (server), `packages/analytics/src/contract.ts`'s
 * `AnalyticsSurface` union (web), `AnalyticsContract.kt`'s enum (Android).
 */

import type { AnalyticsSurface } from "@momentum/analytics"

export const SURFACE: AnalyticsSurface = "reels"
