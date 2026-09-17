import type { Metadata } from "next"
import { AskComposer } from "@/compose/AskComposer"

export const metadata: Metadata = { title: "Ask a question" }

export default function NewQuestionPage() {
  return <AskComposer />
}
