/**
 * This zone's prefix, in one place.
 *
 * It is stated four times in this repository and they all have to agree:
 *
 *   · `createZoneConfig({ basePath: "/tube" })`   — next.config.ts
 *   · `NEXT_PUBLIC_API_BASE_URL=/tube`            — .env.local, .env.example
 *   · `["/tube", "TUBE_ZONE_URL", …]`             — apps/shell/next.config.ts
 *   · this, which is what the app hands @momentum/chrome
 *
 * A fifth and a sixth, which are not paths but move with them: `moduleHomes`
 * and `moduleLabels` in apps/shell/src/lib/moduleRedirect.ts — the file says so
 * itself, and a `?redirect=/tube` the shell will not honour strands somebody
 * on the login page one click short of the video they came for.
 *
 * The first three cannot import from each other — one is a Next config, one is
 * an env file, one is another app — so this does not attempt to derive itself
 * from any of them and does not pretend to. It is the value the RUNTIME uses.
 * If it disagrees with next.config.ts the symptom is navigation: "Tube" in the
 * header stops being marked as the current page, and the search box submits
 * from the wrong branch. See @momentum/chrome's zone.ts.
 */
export const ZONE = "/tube"
