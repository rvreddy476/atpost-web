import { notFound } from "next/navigation"
import { isUuid } from "@/qa/rules"
import { TopicScreen } from "@/topics/TopicsScreens"

/** `/ask/topics/[id]` — a malformed id is a 404 before any request is made. */
export default async function TopicPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isUuid(id)) notFound()
  return <TopicScreen topicId={id} />
}
