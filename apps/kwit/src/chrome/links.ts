/**
 * The paths that leave this zone.
 *
 * /login is served by the shell, never by a zone, so a sign-in link is always
 * an absolute path reached with a plain `<a>` — `next/link` would prefix it
 * with this zone's basePath. The redirect brings the reader back to the Know It
 * page they were on, which must sit under a prefix on the shell's allowlist.
 */
import { ZONE } from "@/zone"

/** `/login?redirect=/kwit/...` for a path inside this zone (zone-relative, e.g. "/questions/x"). */
export function kwitSignInHref(zoneRelativePath = "/"): string {
  const clean = zoneRelativePath.startsWith("/") ? zoneRelativePath : `/${zoneRelativePath}`
  const target = clean === "/" ? ZONE : `${ZONE}${clean}`
  return `/login?redirect=${encodeURIComponent(target)}`
}

export const KWIT_SIGN_IN_HREF = kwitSignInHref("/")
