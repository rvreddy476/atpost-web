import { ReelsViewer } from "@/reels/ReelsViewer"

/**
 * `/reels` — the surface, from the top of the ranking.
 *
 * A mount point and nothing else. Everything that decides anything is in
 * `ReelsViewer`, which is the one client component in this tree; the route's
 * only job is to say which reel to open on, and here there isn't one.
 */
export default function ReelsPage() {
  return <ReelsViewer />
}
