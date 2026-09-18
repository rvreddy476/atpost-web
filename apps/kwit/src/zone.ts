/**
 * This zone's prefix, in one place.
 *
 * It is stated in several places that cannot import each other and must agree:
 *
 *   · `createZoneConfig({ basePath: "/kwit" })`   — next.config.ts
 *   · `NEXT_PUBLIC_API_BASE_URL=/kwit`            — .env.local, .env.example
 *   · the shell's zone rewrite table and its sign-in redirect allowlist
 *   · this, which is what the runtime hands @momentum/chrome and the sign-in link
 */
export const ZONE = "/kwit"
