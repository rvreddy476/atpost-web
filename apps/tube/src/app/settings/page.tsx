import type { Metadata } from "next"
import { TubeSettings } from "@/settings/TubeSettings"

/**
 * `/tube/settings`: a full page in the Tube application.
 *
 * A mount point and nothing else, exactly like ../subscriptions/page.tsx.
 * A static segment beside `[postId]`, safe because Next resolves static
 * segments first. `noindex` for the reason ../upload/page.tsx gives: it is
 * a tool behind a session, not a page anybody should be sent to by a
 * search engine.
 */
export const metadata: Metadata = {
  title: "Settings",
  robots: { index: false, follow: false },
}

export default function SettingsPage() {
  return <TubeSettings />
}
