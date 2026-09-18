"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { Bell, Bookmark, Flag, Link2, Lock, Trash2 } from "lucide-react"
import { Dialog, Textarea, useToast } from "@atpost/ui"
import { kwitSignInHref } from "@/chrome/links"
import { closeQuestion, deleteQuestion, setQuestionFollowed, setQuestionSaved, voteQuestion } from "@/qa/api"
import { isOwnPost } from "@/qa/byline"
import { COPY } from "@/qa/copy"
import { classifyError, errorMessage } from "@/qa/errors"
import { qaKeys, useQuestion, useViewer } from "@/qa/hooks"
import { isOpen } from "@/qa/rules"
import { voteStateOf } from "@/qa/votes"
import type { AskQuestion } from "@/qa/wire"
import { Byline } from "@/ui/Byline"
import { TopicChip } from "@/ui/QuestionCard"
import { ReportDialog } from "@/ui/ReportDialog"
import { EmptyState, ListSkeleton, queryFallback } from "@/ui/states"
import { CARD, CHIP, GHOST_ACTION, H1, PILL_ACTION } from "@/ui/styles"
import { ToggleButton } from "@/ui/ToggleButton"
import { VoteControl } from "@/ui/VoteControl"
import { AnswersSection } from "./AnswersSection"

/** `/kwit/questions/[id]` — the question, its answers, and the answer composer. */
export function QuestionScreen({ questionId }: { questionId: string }) {
  const query = useQuestion(questionId)
  const viewer = useViewer()

  if (!query.data) {
    if (query.isError && classifyError(query.error).kind === "notFound") {
      return <EmptyState title="Question not found" body="It may have been deleted, or the link is wrong." />
    }
    return <>{queryFallback(query, <ListSkeleton count={2} />)}</>
  }

  const question = query.data
  return (
    <div className="space-y-5">
      {/* Keyed on the fields the optimistic controls start from, so a refetch re-seeds them. */}
      <QuestionHeader
        key={`${question.id}:${question.viewer_vote}:${question.vote_score}:${question.is_following}:${question.is_saved}:${viewer.userId}`}
        question={question}
        viewerId={viewer.userId}
        signedIn={viewer.signedIn}
      />
      <AnswersSection question={question} viewerId={viewer.userId} signedIn={viewer.signedIn} known={viewer.known} />
    </div>
  )
}

function QuestionHeader({ question, viewerId, signedIn }: { question: AskQuestion; viewerId: string | null; signedIn: boolean }) {
  const toast = useToast()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [reporting, setReporting] = useState(false)
  const [closing, setClosing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const owner = isOwnPost(question.author_id, viewerId)
  const signInHref = kwitSignInHref(`/questions/${question.id}`)
  const fail = (error: unknown) => toast.error(errorMessage(error))

  const share = async () => {
    const url = typeof window === "undefined" ? "" : window.location.href
    try {
      await navigator.clipboard.writeText(url)
      toast.success(COPY.linkCopied)
    } catch {
      toast.toast({ title: url, variant: "info" })
    }
  }

  return (
    <article className={CARD} aria-labelledby="ask-question-title">
      <Byline
        isAnonymous={question.is_anonymous}
        author={question.author}
        authorId={question.author_id}
        viewerId={viewerId}
        createdAt={question.created_at}
        size="md"
      />
      <h1 id="ask-question-title" className={`mt-3 ${H1} leading-snug`}>
        {question.title}
      </h1>

      {/* Plain text with its line breaks. body_html is never rendered as HTML. */}
      {question.body ? <div className="mt-3 whitespace-pre-line break-words text-mo-ink">{question.body}</div> : null}

      {question.topics.length > 0 || question.tags.length > 0 ? (
        <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Topics and tags">
          {question.topics.map((topic) => (
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

      {!isOpen(question.status) ? (
        <p className="mt-4 flex items-start gap-2 rounded-mo-sm border border-mo bg-mo-sunken p-3 text-sm text-mo-body">
          <Lock aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {COPY.closedNotice}
            {question.closed_reason ? ` Reason: ${question.closed_reason}` : ""}
          </span>
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <VoteControl
          initial={voteStateOf(question)}
          perform={(next) => voteQuestion(question.id, next)}
          onError={fail}
          signedIn={signedIn}
          signInHref={signInHref}
          subject="question"
        />
        {signedIn ? (
          <>
            <ToggleButton
              initial={question.is_following}
              perform={(next) => setQuestionFollowed(question.id, next)}
              onError={fail}
              onLabel={COPY.following}
              offLabel={COPY.follow}
              icon={<Bell aria-hidden="true" className="h-4 w-4" />}
            />
            <ToggleButton
              initial={question.is_saved}
              perform={async (next) => {
                await setQuestionSaved(question.id, next)
                void queryClient.invalidateQueries({ queryKey: qaKeys.saved })
              }}
              onError={fail}
              onLabel={COPY.saved}
              offLabel={COPY.save}
              icon={<Bookmark aria-hidden="true" className="h-4 w-4" />}
            />
          </>
        ) : (
          <a href={signInHref} className={PILL_ACTION}>
            <Bell aria-hidden="true" className="h-4 w-4" />
            {COPY.follow}
          </a>
        )}
        <button type="button" onClick={() => void share()} className={GHOST_ACTION}>
          <Link2 aria-hidden="true" className="h-4 w-4" />
          {COPY.share}
        </button>
        {signedIn && !owner ? (
          <button type="button" onClick={() => setReporting(true)} className={GHOST_ACTION}>
            <Flag aria-hidden="true" className="h-4 w-4" />
            {COPY.report}
          </button>
        ) : null}
        {owner ? (
          <>
            {isOpen(question.status) ? (
              <button type="button" onClick={() => setClosing(true)} className={GHOST_ACTION}>
                <Lock aria-hidden="true" className="h-4 w-4" />
                {COPY.closeQuestion}
              </button>
            ) : null}
            <button type="button" onClick={() => setDeleting(true)} className={`${GHOST_ACTION} hover:text-mo-bad`}>
              <Trash2 aria-hidden="true" className="h-4 w-4" />
              {COPY.deleteQuestion}
            </button>
          </>
        ) : null}
      </div>

      {signedIn ? (
        <ReportDialog
          open={reporting}
          onClose={() => setReporting(false)}
          targetType="question"
          targetId={question.id}
          onReported={() => toast.success(COPY.reported)}
        />
      ) : null}

      {owner ? (
        <>
          <CloseDialog
            open={closing}
            onClose={() => setClosing(false)}
            onConfirm={async (reason) => {
              await closeQuestion(question.id, reason)
              toast.success(COPY.closed)
              await queryClient.invalidateQueries({ queryKey: qaKeys.question(question.id) })
            }}
          />
          <Dialog open={deleting} onClose={() => setDeleting(false)} title={COPY.deleteQuestion}>
            <p className="text-sm text-mo-ink">{COPY.deleteConfirm}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setDeleting(false)} className={GHOST_ACTION}>
                Cancel
              </button>
              <button
                type="button"
                className={`${PILL_ACTION} border-mo-bad text-mo-bad`}
                onClick={async () => {
                  try {
                    await deleteQuestion(question.id)
                    setDeleting(false)
                    toast.success(COPY.deleted)
                    void queryClient.invalidateQueries({ queryKey: qaKeys.all })
                    router.replace("/")
                  } catch (error) {
                    fail(error)
                  }
                }}
              >
                {COPY.deleteQuestion}
              </button>
            </div>
          </Dialog>
        </>
      ) : null}
    </article>
  )
}

function CloseDialog({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean
  onClose: () => void
  onConfirm: (reason: string) => Promise<void>
}) {
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  return (
    <Dialog open={open} onClose={onClose} title={COPY.closeQuestion}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!reason.trim() || busy) return
          setBusy(true)
          setFailure(null)
          try {
            await onConfirm(reason.trim())
            setReason("")
            onClose()
          } catch (error) {
            setFailure(errorMessage(error))
          } finally {
            setBusy(false)
          }
        }}
      >
        <Textarea label={COPY.closeReasonLabel} description={COPY.closeReasonHint} value={reason} onChange={setReason} required maxLength={500} minRows={2} />
        {failure ? (
          <p role="alert" className="text-sm text-mo-bad">
            {failure}
          </p>
        ) : null}
        <div className="flex justify-end">
          <button type="submit" disabled={!reason.trim() || busy} className={PILL_ACTION}>
            {busy ? "Closing…" : COPY.closeQuestion}
          </button>
        </div>
      </form>
    </Dialog>
  )
}
