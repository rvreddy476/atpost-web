"use client"

import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Award, Flag, MessageSquare } from "lucide-react"
import { Switch, Textarea, useToast } from "@atpost/ui"
import { kwitSignInHref } from "@/chrome/links"
import { createAnswer, createComment, selectBestAnswer, voteAnswer, type AnswerSort } from "@/qa/api"
import { byline, isOwnPost } from "@/qa/byline"
import { COPY } from "@/qa/copy"
import { errorMessage } from "@/qa/errors"
import { qaKeys, useAnswers, useComments } from "@/qa/hooks"
import { answerCountLabel, canAnswer, canSelectBestAnswer, isOpen, orderAnswers } from "@/qa/rules"
import { voteStateOf } from "@/qa/votes"
import type { AskAnswer, AskQuestion } from "@/qa/wire"
import { relativeTime } from "@momentum/content"
import { Byline } from "@/ui/Byline"
import { ReportDialog } from "@/ui/ReportDialog"
import { EmptyState, ListSkeleton, queryFallback } from "@/ui/states"
import { CARD, GHOST_ACTION, H2, INPUT, PILL_ACTION, PRIMARY } from "@/ui/styles"
import { VoteControl } from "@/ui/VoteControl"

const SORTS: { id: AnswerSort; label: string }[] = [
  { id: "votes", label: COPY.sortVotes },
  { id: "newest", label: COPY.sortNewest },
]

export function AnswersSection({
  question,
  viewerId,
  signedIn,
  known,
}: {
  question: AskQuestion
  viewerId: string | null
  signedIn: boolean
  known: boolean
}) {
  const [sort, setSort] = useState<AnswerSort>("votes")
  const answers = useAnswers(question.id, sort)
  const canMarkBest = canSelectBestAnswer(question.author_id, viewerId, question.status)
  const list = answers.data ? orderAnswers(answers.data, question.best_answer_id) : null

  return (
    <section aria-labelledby="ask-answers-heading" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="ask-answers-heading" className={H2}>
          {answerCountLabel(list?.length ?? question.answer_count)}
        </h2>
        <div role="group" aria-label="Sort answers" className="inline-flex rounded-mo-pill border border-mo p-0.5">
          {SORTS.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={sort === option.id}
              onClick={() => setSort(option.id)}
              className={`rounded-mo-pill px-3 py-1 text-sm font-semibold transition-colors duration-150 ease-mo ${
                sort === option.id ? "bg-mo-raised text-mo-ink" : "text-mo-body hover:text-mo-ink"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {list === null ? (
        queryFallback(answers, <ListSkeleton count={2} />)
      ) : list.length === 0 ? (
        <EmptyState title={COPY.emptyAnswersTitle} body={COPY.emptyAnswersBody} />
      ) : (
        <ul className="space-y-4">
          {list.map((answer) => (
            <li key={`${answer.id}:${answer.viewer_vote}:${answer.vote_score}:${viewerId}`}>
              <AnswerCard
                answer={answer}
                questionId={question.id}
                viewerId={viewerId}
                signedIn={signedIn}
                canMarkBest={canMarkBest && !answer.is_best}
              />
            </li>
          ))}
        </ul>
      )}

      {!isOpen(question.status) ? (
        <p className="text-sm text-mo-body">{COPY.closedNotice}</p>
      ) : !known ? null : signedIn ? (
        <AnswerComposer questionId={question.id} />
      ) : (
        <div className={`${CARD} flex flex-wrap items-center justify-between gap-3`}>
          <p className="text-sm text-mo-body">{COPY.signInToAnswer}</p>
          <a href={kwitSignInHref(`/questions/${question.id}`)} className={PILL_ACTION}>
            {COPY.signIn}
          </a>
        </div>
      )}
    </section>
  )
}

function AnswerCard({
  answer,
  questionId,
  viewerId,
  signedIn,
  canMarkBest,
}: {
  answer: AskAnswer
  questionId: string
  viewerId: string | null
  signedIn: boolean
  canMarkBest: boolean
}) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [reporting, setReporting] = useState(false)
  const [showComments, setShowComments] = useState(false)
  const [marking, setMarking] = useState(false)
  const fail = (error: unknown) => toast.error(errorMessage(error))
  const own = isOwnPost(answer.author_id, viewerId)

  return (
    <article
      aria-label={answer.is_best ? `${COPY.bestAnswerBadge} by ${byline(answer.is_anonymous, answer.author)}` : `Answer by ${byline(answer.is_anonymous, answer.author)}`}
      className={`${CARD} ${answer.is_best ? "border-mo-good" : ""}`}
    >
      {answer.is_best ? (
        <p className="mb-3 inline-flex items-center gap-1.5 rounded-mo-pill border border-mo-good px-2.5 py-0.5 text-xs font-semibold text-mo-good">
          <Award aria-hidden="true" className="h-3.5 w-3.5" />
          {COPY.bestAnswerBadge}
        </p>
      ) : null}
      <Byline
        isAnonymous={answer.is_anonymous}
        author={answer.author}
        authorId={answer.author_id}
        viewerId={viewerId}
        createdAt={answer.created_at}
      />
      <div className="mt-3 whitespace-pre-line break-words text-mo-ink">{answer.body}</div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <VoteControl
          initial={voteStateOf(answer)}
          perform={(next) => voteAnswer(answer.id, next)}
          onError={fail}
          signedIn={signedIn}
          signInHref={kwitSignInHref(`/questions/${questionId}`)}
          subject="answer"
        />
        <button
          type="button"
          aria-expanded={showComments}
          aria-controls={`ask-comments-${answer.id}`}
          onClick={() => setShowComments((v) => !v)}
          className={GHOST_ACTION}
        >
          <MessageSquare aria-hidden="true" className="h-4 w-4" />
          {COPY.comments}
          {answer.comment_count > 0 ? ` (${answer.comment_count})` : ""}
        </button>
        {canMarkBest ? (
          <button
            type="button"
            disabled={marking}
            onClick={async () => {
              setMarking(true)
              try {
                await selectBestAnswer(questionId, answer.id)
                toast.success(COPY.markedBest)
                await Promise.all([
                  queryClient.invalidateQueries({ queryKey: qaKeys.question(questionId) }),
                  queryClient.invalidateQueries({ queryKey: qaKeys.answersAll(questionId) }),
                ])
              } catch (error) {
                fail(error)
              } finally {
                setMarking(false)
              }
            }}
            className={PILL_ACTION}
          >
            <Award aria-hidden="true" className="h-4 w-4" />
            {COPY.markBest}
          </button>
        ) : null}
        {signedIn && !own ? (
          <button type="button" onClick={() => setReporting(true)} className={GHOST_ACTION}>
            <Flag aria-hidden="true" className="h-4 w-4" />
            {COPY.report}
          </button>
        ) : null}
      </div>

      {showComments ? <Comments answerId={answer.id} signedIn={signedIn} questionId={questionId} /> : null}

      {signedIn ? (
        <ReportDialog
          open={reporting}
          onClose={() => setReporting(false)}
          targetType="answer"
          targetId={answer.id}
          onReported={() => toast.success(COPY.reported)}
        />
      ) : null}
    </article>
  )
}

/** Comments on an answer — qa-service has none on questions. */
function Comments({ answerId, signedIn, questionId }: { answerId: string; signedIn: boolean; questionId: string }) {
  const comments = useComments(answerId, true)
  const toast = useToast()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState("")
  const [busy, setBusy] = useState(false)
  const inputId = `ask-comment-${answerId}`

  return (
    <div id={`ask-comments-${answerId}`} className="mt-4 border-t border-mo pt-4">
      {comments.data ? (
        comments.data.length === 0 ? (
          <p className="text-sm text-mo-body">No comments yet.</p>
        ) : (
          <ul className="space-y-3">
            {comments.data.map((comment) => (
              <li key={comment.id} className="text-sm">
                <span className="font-semibold text-mo-ink">{byline(false, comment.author)}</span>{" "}
                <time dateTime={comment.created_at} className="text-mo-body">
                  {relativeTime(comment.created_at)}
                </time>
                <p className="mt-0.5 whitespace-pre-line break-words text-mo-ink">{comment.body}</p>
              </li>
            ))}
          </ul>
        )
      ) : (
        queryFallback(comments, <p className="text-sm text-mo-body">Loading comments…</p>)
      )}

      {signedIn ? (
        <form
          className="mt-3 flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault()
            const body = draft.trim()
            if (!body || busy) return
            setBusy(true)
            try {
              await createComment(answerId, body)
              setDraft("")
              toast.success(COPY.commented)
              await Promise.all([
                queryClient.invalidateQueries({ queryKey: qaKeys.comments(answerId) }),
                queryClient.invalidateQueries({ queryKey: qaKeys.answersAll(questionId) }),
              ])
            } catch (error) {
              toast.error(errorMessage(error))
            } finally {
              setBusy(false)
            }
          }}
        >
          <label htmlFor={inputId} className="sr-only">
            {COPY.commentLabel}
          </label>
          <input
            id={inputId}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={COPY.commentLabel}
            maxLength={1000}
            className={`${INPUT} min-w-0 flex-1`}
          />
          <button type="submit" disabled={!draft.trim() || busy} className={PILL_ACTION}>
            {COPY.commentSubmit}
          </button>
        </form>
      ) : null}
    </div>
  )
}

function AnswerComposer({ questionId }: { questionId: string }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState("")
  const [anonymous, setAnonymous] = useState(false)
  const [busy, setBusy] = useState(false)

  return (
    <form
      aria-label={COPY.answerLabel}
      className={`${CARD} space-y-4`}
      onSubmit={async (e) => {
        e.preventDefault()
        if (!canAnswer(draft) || busy) return
        setBusy(true)
        try {
          await createAnswer(questionId, { body: draft.trim(), is_anonymous: anonymous })
          setDraft("")
          setAnonymous(false)
          toast.success(COPY.answered)
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: qaKeys.answersAll(questionId) }),
            queryClient.invalidateQueries({ queryKey: qaKeys.question(questionId) }),
          ])
        } catch (error) {
          toast.error(errorMessage(error))
        } finally {
          setBusy(false)
        }
      }}
    >
      <h2 className={H2}>{COPY.answerLabel}</h2>
      <Textarea label={COPY.answerLabel} placeholder={COPY.answerHint} value={draft} onChange={setDraft} minRows={4} maxRows={16} className="bg-mo-sunken" />
      <Switch label={COPY.answerAnonymousLabel} description={COPY.answerAnonymousHint} checked={anonymous} onChange={setAnonymous} />
      <div className="flex justify-end">
        <button type="submit" disabled={!canAnswer(draft) || busy} className={PRIMARY}>
          {busy ? "Posting…" : COPY.answerSubmit}
        </button>
      </div>
    </form>
  )
}
