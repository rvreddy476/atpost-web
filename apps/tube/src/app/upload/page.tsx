import type { Metadata } from "next"
import { UploadStudio } from "@/studio/UploadStudio"

/**
 * `/tube/upload` — the studio.
 *
 * A mount point and nothing else, exactly like ../subscriptions/page.tsx: the
 * root layout supplies the Tube shell and everything that decides anything is
 * in `UploadStudio`.
 *
 * ── A static segment beside a dynamic one, and why that is safe ───────────
 * `src/app/[postId]/page.tsx` — the watch page — is a dynamic segment at this
 * same level. Next resolves STATIC segments first, so "/tube/upload" lands
 * here and never on the watch page with `postId: "upload"`.
 *
 * ── Client-only, and deliberately so ──────────────────────────────────────
 * Every other page in this zone renders something on the server, because
 * every other page has something to render before anyone interacts. This one
 * does not: its first meaningful state is "does this account have a channel",
 * which is a `GET /v1/channels/me` that needs the session cookie, and its
 * whole job afterwards is a File object that only exists in a browser. There
 * is nothing to prerender but a spinner.
 *
 * `noindex` for the same reason a crawler has no business here: it is a tool,
 * not a page, and a search result pointing at somebody's upload form is a
 * search result pointing at a sign-in wall.
 */
export const metadata: Metadata = {
  title: "New video",
  robots: { index: false, follow: false },
}

export default function UploadPage() {
  return <UploadStudio />
}
