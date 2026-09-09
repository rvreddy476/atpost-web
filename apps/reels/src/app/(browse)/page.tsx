import { ReelsBrowse } from "@/browse/ReelsBrowse"

/**
 * `/reels` — the browse page.
 *
 * A mount point and nothing else, as the route it replaced was: the layout
 * beside this file supplies the chrome, and everything that decides anything
 * is in `ReelsBrowse`.
 *
 * This route used to render `ReelsViewer`, so that clicking Reels in the
 * navigation dropped straight into full-screen video. The viewer has not gone
 * anywhere and has not changed — it is what `/reels/{postId}` renders, and a
 * tile's Expand is a link to it.
 */
export default function ReelsPage() {
  return <ReelsBrowse />
}
