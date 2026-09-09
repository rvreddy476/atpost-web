import { TubeBrowse } from "@/browse/TubeBrowse"

/**
 * `/tube` — the browse page.
 *
 * A mount point and nothing else: the root layout supplies the chrome, and
 * everything that decides anything is in `TubeBrowse`.
 *
 * Note there is no `(browse)` route group here, unlike apps/reels. That group
 * exists there because its two surfaces disagree about wearing the frame; both
 * of this zone's wear it, so the frame is in the root layout and this file is
 * simply `src/app/page.tsx`. The reasoning is at the head of ./layout.tsx.
 */
export default function TubePage() {
  return <TubeBrowse />
}
