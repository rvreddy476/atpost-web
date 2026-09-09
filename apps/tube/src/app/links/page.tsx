import type { Metadata } from "next"
import { LinksIndex } from "@/links/LinksIndex"

/**
 * `/tube/links` — the way into linked-video authoring.
 *
 * A mount point and nothing else, like every other route in this app: the root
 * layout supplies the shell and everything that decides anything is in
 * `LinksIndex`.
 *
 * ── A static segment beside a dynamic one, and why that is safe ───────────
 * `src/app/[postId]/page.tsx` — the watch page — is a dynamic segment at this
 * same level, and Next resolves STATIC segments first. So "/tube/links" lands
 * here and never on the watch page with `postId: "links"`, exactly as
 * "/tube/subscriptions" does. The channel page is the one that cannot rely on
 * that rule, because a handle is not a fixed word; see next.config.ts.
 */
export const metadata: Metadata = {
  title: "Linked videos",
}

export default function LinksPage() {
  return <LinksIndex />
}
