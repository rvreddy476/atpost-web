/**
 * Payload-shaped stand-ins for the three linked-video mechanisms, behind a
 * switch that nothing turns on by itself.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THESE EXIST, AND WHY THEY ARE NOT WIRED INTO THE PAGE BY DEFAULT
 *
 * `video_cards`, `video_end_screens` and `video_series_episodes` are real
 * tables with real endpoints, and NOTHING IN THE PRODUCT WRITES TO THEM. There
 * is no card editor, no end-screen editor and no series builder on the web, on
 * the phone, or in the admin console. `GET /v1/posts/{id}/cards` and
 * `.../end-screens` answer `200 {"data":[]}` for every post that exists, and
 * `/v1/video-series` is not even routed by the gateway.
 *
 * So the rendering had to be built against something. The two dishonest ways to
 * do that were both available and are both refused here:
 *
 *   · INSERT rows into the dev database so a screenshot looks finished. That
 *     puts invented content into a running system other people are testing
 *     against, and it is indistinguishable from real data the moment anybody
 *     else looks at that video.
 *
 *   · Default the client to fixtures when the endpoint is empty. Then an empty
 *     endpoint and a broken endpoint look identical from the page, and the day
 *     somebody authors a real card the page would still be showing this one.
 *
 * What is built instead: the real fetch runs on every load and its result is
 * what the page renders. These rows are used ONLY when the URL explicitly asks
 * for them — `?links=preview` — and when they are used the page says so on
 * screen, in a badge nobody can mistake for content. Nothing is written
 * anywhere, and a viewer who has not typed the parameter cannot reach them.
 *
 * The shapes below are transcribed from post-service's own structs
 * (`postgres.VideoCard`, `postgres.EndScreen`, `postgres.VideoSeriesEpisode`)
 * and from migration 012's constraints — including the enums, which differ
 * between cards (`video|playlist|poll|external_link`) and end screens
 * (`video|playlist|channel_subscribe|external_link`). If a real payload ever
 * disagrees with one of these, the fixture is what is wrong.
 */

import type { Chapter, EndScreen, SeriesEpisode, VideoCard } from "./api"

/** The query parameter that turns fixtures on. Nothing else does. */
export const PREVIEW_PARAM = "links"
export const PREVIEW_VALUE = "preview"

/**
 * Is this URL asking for the fixture preview?
 *
 * Takes a search string rather than reading `window` so it can be asserted, and
 * so the one place that touches the browser is the hook that calls it.
 */
export function wantsLinkPreview(search: string): boolean {
  try {
    return new URLSearchParams(search).get(PREVIEW_PARAM) === PREVIEW_VALUE
  } catch {
    return false
  }
}

/**
 * Chapters over a video of unknown length.
 *
 * Timestamps are kept small on purpose — the dev stack's long videos are
 * minutes rather than hours, and a fixture chapter at 45:00 in a 3-minute video
 * would exercise only the clamping path and never the highlight.
 *
 * The first chapter deliberately does NOT start at 0: an author's list that
 * begins after a cold open is the case where `activeChapterIndex` must answer
 * -1, and a fixture that never produces -1 would not show that the highlight
 * correctly stays off.
 */
export function previewChapters(postId: string): Chapter[] {
  return [
    { post_id: postId, chapter_index: 0, title: "Cold open", start_ms: 6_000, source: "manual" },
    { post_id: postId, chapter_index: 1, title: "What we are building", start_ms: 24_000, source: "manual" },
    { post_id: postId, chapter_index: 2, title: "The part that goes wrong", start_ms: 62_000, source: "manual" },
    { post_id: postId, chapter_index: 3, title: "Fixing it", start_ms: 105_000, source: "ai_generated" },
  ]
}

/**
 * Two cards, one of them with no reachable target.
 *
 * The poll card is the interesting one and it is here on purpose: `poll` is a
 * legal `video_cards.type` and there is no poll surface on the web to send
 * anybody to. A prompt that renders as plain text rather than as a dead link is
 * the behaviour that needs to be visible, not hidden behind a happier fixture.
 */
export function previewCards(postId: string): VideoCard[] {
  return [
    {
      id: "11111111-1111-4111-8111-111111111111",
      post_id: postId,
      type: "video",
      target_id: "22222222-2222-4222-8222-222222222222",
      target_url: null,
      title: "The episode this one answers",
      teaser_text: "Watch the first half",
      appear_at_ms: 15_000,
    },
    {
      id: "33333333-3333-4333-8333-333333333333",
      post_id: postId,
      type: "poll",
      target_id: "44444444-4444-4444-8444-444444444444",
      target_url: null,
      title: "Which one should we build next?",
      teaser_text: null,
      appear_at_ms: 70_000,
    },
  ]
}

/**
 * Three end screens: one positioned, one positioned in fractions, one with no
 * usable `position` at all.
 *
 * The third is the important one. `position` is `JSONB NOT NULL` with no schema
 * and no writer, so a real payload could carry anything; the overlay must lay
 * an unpositioned tile out rather than render it at `NaN%`. A fixture set where
 * every tile is well-positioned would never show that.
 *
 * `start_ms`/`end_ms` are far enough apart to be visible while scrubbing, and
 * are ALSO subject to `inEndScreenWindow` — so on a short video they may still
 * be withheld, which is the correct behaviour and not a broken fixture.
 */
export function previewEndScreens(postId: string): EndScreen[] {
  return [
    {
      id: "55555555-5555-4555-8555-555555555555",
      post_id: postId,
      type: "video",
      target_id: "66666666-6666-4666-8666-666666666666",
      target_url: null,
      title: "Next: the follow-up",
      position: { x: 6, y: 16, w: 40, h: 30 },
      start_ms: 100_000,
      end_ms: 999_000,
    },
    {
      id: "77777777-7777-4777-8777-777777777777",
      post_id: postId,
      type: "channel_subscribe",
      target_id: null,
      target_url: null,
      title: null,
      // Fractions rather than percentages — both conventions are accepted by
      // `endScreenSlot`, and only a fixture using both proves it.
      position: { x: 0.54, y: 0.16, w: 0.4, h: 0.3 },
      start_ms: 100_000,
      end_ms: 999_000,
    },
    {
      id: "88888888-8888-4888-8888-888888888888",
      post_id: postId,
      type: "external_link",
      target_id: null,
      target_url: "https://example.org/notes",
      title: "The notes for this video",
      // Deliberately unusable. The overlay must lay this out itself.
      position: { anchor: "bottom-left" },
      start_ms: 100_000,
      end_ms: 999_000,
    },
  ]
}

/**
 * A series this video is the second episode of.
 *
 * `post_id` on the middle row is the caller's own post, which is what makes the
 * "next episode" affordance computable: the rail has to find THIS video in the
 * list to know what comes after it, and a fixture whose rows are all strangers
 * would leave that path untested.
 */
export function previewSeriesEpisodes(postId: string): SeriesEpisode[] {
  const seriesId = "99999999-9999-4999-8999-999999999999"
  return [
    { series_id: seriesId, post_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", episode_num: 1, title: "Where this started" },
    { series_id: seriesId, post_id: postId, episode_num: 2, title: null },
    { series_id: seriesId, post_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3", episode_num: 3, title: "The part nobody warns you about" },
    { series_id: seriesId, post_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4", episode_num: 4, title: "What we would do differently" },
  ]
}

/** The series' own title, which `GET /v1/video-series/{id}` would carry. */
export const PREVIEW_SERIES_TITLE = "Building it in the open"
