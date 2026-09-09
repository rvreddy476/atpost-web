/**
 * The handful of paths that leave this application, in one place.
 *
 * ── Why these are not imported from @momentum/chrome ──────────────────────
 * They could be — `HOME_PATH` and `signInHref` are exported from it, and
 * ../browse/states.tsx still reads them. The reason this shell restates them
 * is the reason the shell exists: `@momentum/chrome` is the SOCIAL chrome, and
 * a Tube shell that imports its constants is a Tube shell that acquires its
 * `DESTINATIONS`, its `APP_ONLY_REASON` and its idea of where the product's
 * front door is, one small import at a time. Four strings restated with the
 * reasoning attached is cheaper than that drift, and this file is short enough
 * to check against the shell's own tables by eye.
 *
 * What must stay true, and what breaks if it does not:
 *
 *   · HOME_PATH must be a zone in `apps/shell/next.config.ts`. If it is not,
 *     the exit control 500s — a rewrite to a port nothing is listening on
 *     hangs and then answers 500, which reads as "the platform is broken".
 *   · The sign-in redirect must be on the shell's allowlist,
 *     `moduleHomes` in `apps/shell/src/lib/moduleRedirect.ts`. If it is not,
 *     signing in silently lands somewhere else and the person is one click
 *     short of the video they came for. "/tube" is on it.
 */

import { BRAND } from "@momentum/brand"
import { ZONE } from "@/zone"

/** The product's front door. A zone in the shell's rewrite table. */
export const HOME_PATH = "/social"

/** The mini-app launcher. Also a zone. */
export const EXPLORE_PATH = "/apps"

/**
 * Where a signed-out browser is sent, and how it gets back HERE.
 *
 * /login is served by the shell, never by a zone, so this is always an
 * absolute path reached with a plain `<a>` or `window.location`. The redirect
 * is this zone's own basePath, which is on the shell's allowlist by
 * construction — somebody who hits Sign in from Tube comes back to Tube and
 * not to the feed.
 */
export const TUBE_SIGN_IN_HREF = `/login?redirect=${encodeURIComponent(ZONE)}`

/** Why a Tube destination cannot be opened from a browser today. */
export const TUBE_APP_ONLY_REASON = `Only in the ${BRAND.mobileApp} — Tube on the web has no page for it yet.`
