import type { Metadata } from "next"
import { TubeSaved } from "@/saved/TubeSaved"

/**
 * `/tube/saved`: a full page in the Tube application.
 *
 * A mount point and nothing else, exactly like ../subscriptions/page.tsx.
 * A static segment beside `[postId]`, safe because Next resolves static
 * segments first. `noindex` because it is one person's list behind a
 * session.
 */
export const metadata: Metadata = {
  title: "Saved videos",
  robots: { index: false, follow: false },
}

export default function SavedPage() {
  return <TubeSaved />
}
