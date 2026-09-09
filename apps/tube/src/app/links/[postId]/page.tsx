import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { LinkEditor } from "@/links/LinkEditor"

/**
 * `/tube/links/{postId}` — the linked-video authoring screen for one video.
 *
 * ── The id is validated here, before anything is fetched ──────────────────
 * The same check the watch page makes at `src/app/[postId]/page.tsx`, for the
 * same reason and deliberately kept in step with it: every id in this system
 * is a UUID, and a malformed one is a bad link that should cost no request and
 * show no skeleton. A well-formed id that is not one of the viewer's own
 * videos is a different answer, and `LinkEditor` gives it after actually
 * looking — see the ownership note in `useLinkEditor`.
 *
 * The check is shape-only. Asking the server whether the post exists would be
 * a round trip answering a question the editor's own load is about to answer
 * better: not "does this row exist" but "is this row yours to edit".
 *
 * ── This route is the stable address, and the studio should link to it ────
 * It takes nothing but a post id and carries no state in the URL, so the
 * upload studio's "Your videos" row action can point straight at it without
 * either side knowing anything about the other. See the header of
 * `src/links/LinksIndex.tsx`.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const metadata: Metadata = {
  title: "Links",
}

export default async function LinkEditorPage({
  params,
}: {
  params: Promise<{ postId: string }>
}) {
  const { postId } = await params
  if (!UUID.test(postId)) notFound()
  return <LinkEditor postId={postId} />
}
