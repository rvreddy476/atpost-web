import Link from "next/link"
import { ArrowBigUp, CheckCircle2, MessageSquare, Pin } from "lucide-react"
import { formatCount } from "@momentum/content"
import { answerCountLabel } from "@/qa/rules"
import type { AskQuestionSummary, AskTopic } from "@/qa/wire"
import { Byline } from "./Byline"
import { CARD, CHIP } from "./styles"

/**
 * One question in a list: title (the link), excerpt, tags, votes, answers,
 * the answered badge, byline and time. The whole card is not a link — only
 * the title is — so the tag chips stay separately focusable.
 */
export function QuestionCard({
  question,
  viewerId,
  topics,
}: {
  question: AskQuestionSummary
  viewerId: string | null
  /** Topic chips, where the caller knows them (list rows carry none). */
  topics?: AskTopic[]
}) {
  return (
    <article className={`${CARD} transition-colors duration-150 ease-mo hover:border-mo-strong`}>
      <Byline
        isAnonymous={question.is_anonymous}
        author={question.author}
        authorId={question.author_id}
        viewerId={viewerId}
        createdAt={question.created_at}
        extra={
          question.is_pinned ? (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-mo-body">
              <Pin aria-hidden="true" className="h-3 w-3" /> Pinned
            </span>
          ) : null
        }
      />
      <h3 className="mt-3 font-mo-display text-lg font-semibold leading-snug tracking-mo-display text-mo-ink">
        <Link href={`/questions/${question.id}`} className="rounded-mo-sm hover:text-mo-cyan">
          {question.title}
        </Link>
      </h3>
      {question.excerpt ? <p className="mt-1.5 line-clamp-3 whitespace-pre-line text-sm text-mo-body">{question.excerpt}</p> : null}

      {(topics?.length ?? 0) > 0 || question.tags.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Topics and tags">
          {topics?.map((topic) => (
            <li key={topic.id}>
              <TopicChip topic={topic} />
            </li>
          ))}
          {question.tags.map((tag) => (
            <li key={tag}>
              <span className={`${CHIP} font-normal text-mo-body`}>#{tag}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-mo-body">
        <span className="inline-flex items-center gap-1" aria-label={`${question.vote_score} votes`}>
          <ArrowBigUp aria-hidden="true" className="h-4 w-4" />
          {formatCount(question.vote_score)}
        </span>
        <span className="inline-flex items-center gap-1">
          <MessageSquare aria-hidden="true" className="h-4 w-4" />
          {answerCountLabel(question.answer_count)}
        </span>
        {question.is_answered ? (
          <span className="inline-flex items-center gap-1 font-semibold text-mo-good">
            <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
            Answered
          </span>
        ) : null}
        {question.status === "closed" ? <span className="font-semibold">Closed</span> : null}
      </div>
    </article>
  )
}

export function TopicChip({ topic }: { topic: Pick<AskTopic, "id" | "name"> }) {
  return (
    <Link href={`/topics/${topic.id}`} className={`${CHIP} text-mo-cyan hover:bg-mo-overlay`}>
      {topic.name}
    </Link>
  )
}
