import type { Metadata } from "next"
import { TubeYourVideos } from "@/uploads/TubeYourVideos"

/**
 * `/tube/your-videos`: a full page in the Tube application.
 *
 * `noindex`: one person's uploads behind a session, including videos still
 * processing that nobody else can see yet.
 *
 * This route is why the rail's "Your videos" row stopped pointing at the
 * viewer's own channel page. `GET /v1/uploads/videos` needs no channel and
 * shows the author their processing videos; `/@{handle}` needs one and shows
 * what the public sees. ../../chrome/rail.ts records the change.
 */
export const metadata: Metadata = {
  title: "Your videos",
  robots: { index: false, follow: false },
}

export default function YourVideosPage() {
  return <TubeYourVideos />
}
