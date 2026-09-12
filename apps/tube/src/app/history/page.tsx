import type { Metadata } from "next"
import { TubeHistory } from "@/history/TubeHistory"

/**
 * `/tube/history`: a full page in the Tube application.
 *
 * A mount point and nothing else, exactly like ../subscriptions/page.tsx:
 * the root layout supplies the shell and everything that decides anything
 * is in `TubeHistory`.
 *
 * A static segment beside `[postId]`, and safe for the reason that page
 * records: Next resolves static segments first, so "/tube/history" lands
 * here and never on the watch page with `postId: "history"`.
 *
 * `noindex` because this is one person's list behind a session, and a
 * search result pointing at it is a search result pointing at a sign-in
 * wall.
 */
export const metadata: Metadata = {
  title: "History",
  robots: { index: false, follow: false },
}

export default function HistoryPage() {
  return <TubeHistory />
}
