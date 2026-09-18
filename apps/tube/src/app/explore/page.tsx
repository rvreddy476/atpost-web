import type { Metadata } from "next"
import { TubeExplore } from "@/explore/TubeExplore"

/**
 * `/tube/explore`: a full page in the Tube application.
 *
 * Indexable, like ../trending/page.tsx and unlike every other page added in
 * this change: `GET /v1/posts/categories` is public and this page is the
 * platform's topic list, which is exactly the kind of thing a search result
 * should be able to point at.
 *
 * NOT to be confused with the rail's "Explore Momentum" row, which is the
 * product's mini-app launcher at /apps and a different zone entirely. The two
 * are told apart in ../../chrome/rail.ts, including at the 76px width where
 * their labels would otherwise collide.
 */
export const metadata: Metadata = {
  title: "Explore",
  description: "Every topic on Momentum Tube.",
}

export default function ExplorePage() {
  return <TubeExplore />
}
