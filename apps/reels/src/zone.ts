/**
 * This zone's prefix, in one place.
 *
 * It is stated four times in this repository and they all have to agree:
 *
 *   · `createZoneConfig({ basePath: "/reels" })`  — next.config.ts
 *   · `NEXT_PUBLIC_API_BASE_URL=/reels`           — .env.local, .env.example
 *   · `["/reels", "REELS_ZONE_URL", …]`           — apps/shell/next.config.ts
 *   · this, which is what the app hands @momentum/chrome
 *
 * The first three cannot import from each other — one is a Next config, one is
 * an env file, one is another app — so this does not attempt to derive itself
 * from any of them and does not pretend to. It is the value the RUNTIME uses,
 * kept out of the components that need it so the string is not typed into four
 * more files. If it disagrees with next.config.ts the symptom is navigation:
 * "Reels" in the header stops being marked as the current page, and the search
 * box submits from the wrong branch. See @momentum/chrome's zone.ts.
 */
export const ZONE = "/reels"
