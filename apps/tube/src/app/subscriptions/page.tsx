import type { Metadata } from "next"
import { TubeSubscriptions } from "@/subscriptions/TubeSubscriptions"

/**
 * `/tube/subscriptions` — a full page in the Tube application.
 *
 * A mount point and nothing else: the root layout supplies the shell and
 * everything that decides anything is in `TubeSubscriptions`.
 *
 * ── A static segment beside a dynamic one, and why that is safe ───────────
 * `src/app/[postId]/page.tsx` — the watch page — is a dynamic segment at this
 * same level. Next resolves STATIC segments first, so "/tube/subscriptions"
 * lands here and never on the watch page with `postId: "subscriptions"`. The
 * channel page cannot rely on that rule (a handle is not a fixed word), which
 * is why it is reached through a rewrite instead; see next.config.ts.
 */
export const metadata: Metadata = {
  title: "Subscriptions",
}

export default function SubscriptionsPage() {
  return <TubeSubscriptions />
}
