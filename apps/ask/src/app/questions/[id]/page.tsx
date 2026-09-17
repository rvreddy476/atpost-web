import { notFound } from "next/navigation"
import { isUuid } from "@/qa/rules"
import { QuestionScreen } from "@/question/QuestionScreen"

/** `/ask/questions/[id]` — a malformed id is a 404 before any request is made. */
export default async function QuestionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isUuid(id)) notFound()
  return <QuestionScreen questionId={id} />
}
