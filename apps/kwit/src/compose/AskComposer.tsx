"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { Switch, Textarea, useToast } from "@atpost/ui"
import { kwitSignInHref } from "@/chrome/links"
import { createQuestion } from "@/qa/api"
import { COPY } from "@/qa/copy"
import { errorMessage } from "@/qa/errors"
import { qaKeys, useSimilar, useTopics, useViewer } from "@/qa/hooks"
import { MAX_TITLE, MIN_TITLE, canAsk, parseTags, shouldCheckSimilar, toggleId } from "@/qa/rules"
import { ListSkeleton, SignInPrompt, queryFallback } from "@/ui/states"
import { CARD, CHIP, H1, H2, INPUT, PRIMARY } from "@/ui/styles"

/** `/kwit/new` — ask a question. */
export function AskComposer() {
  const viewer = useViewer()
  if (!viewer.known) return <ListSkeleton count={1} />
  if (!viewer.signedIn) {
    return <SignInPrompt title={COPY.signInToAsk} body={COPY.signInToAskBody} href={kwitSignInHref("/new")} />
  }
  return <ComposerForm />
}

function ComposerForm() {
  const router = useRouter()
  const toast = useToast()
  const queryClient = useQueryClient()
  const topics = useTopics()
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [topicIds, setTopicIds] = useState<string[]>([])
  const [tagsRaw, setTagsRaw] = useState("")
  const [anonymous, setAnonymous] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const similar = useSimilar(title)

  const tags = parseTags(tagsRaw)
  const ready = canAsk(title, topicIds) && !busy
  const titleLength = title.trim().length
  const suggestions = shouldCheckSimilar(title) ? (similar.data ?? []) : []

  // The topic list is the gate probe here too: dark product, no form.
  const topicsFallback = topics.data ? null : queryFallback(topics, <ListSkeleton count={1} />)
  if (topicsFallback && topics.isError) return <>{topicsFallback}</>

  return (
    <form
      className="space-y-5"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!ready) return
        setBusy(true)
        setFailure(null)
        try {
          const created = await createQuestion({
            title: title.trim(),
            body: body.trim(),
            topic_ids: topicIds,
            tags,
            is_anonymous: anonymous,
          })
          toast.success(COPY.asked)
          void queryClient.invalidateQueries({ queryKey: ["qa", "feed"] })
          void queryClient.invalidateQueries({ queryKey: qaKeys.mine })
          router.push(`/questions/${created.id}`)
        } catch (error) {
          setFailure(errorMessage(error))
          setBusy(false)
        }
      }}
    >
      <h1 className={H1}>{COPY.askTitle}</h1>

      <div className={`${CARD} space-y-5`}>
        <div className="flex flex-col gap-1">
          <label htmlFor="ask-title" className="text-sm font-semibold text-mo-ink">
            {COPY.askTitleLabel}
          </label>
          <input
            id="ask-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={MAX_TITLE}
            required
            aria-describedby="ask-title-hint"
            placeholder="How do I…?"
            className={`${INPUT} h-11 text-base`}
          />
          <p id="ask-title-hint" className="flex justify-between gap-2 text-xs text-mo-body">
            <span>{COPY.askTitleHint}</span>
            <span className="tabular-nums">{titleLength < MIN_TITLE ? `${MIN_TITLE - titleLength} more` : `${titleLength} / ${MAX_TITLE}`}</span>
          </p>
        </div>

        {suggestions.length > 0 ? (
          <section aria-labelledby="ask-similar" aria-live="polite" className="rounded-mo-sm border border-mo bg-mo-sunken p-3">
            <h2 id="ask-similar" className={`${H2} text-base`}>
              {COPY.askSimilarHeader}
            </h2>
            <p className="text-xs text-mo-body">{COPY.askSimilarHint}</p>
            <ul className="mt-2 space-y-1">
              {suggestions.map((q) => (
                <li key={q.id}>
                  <Link href={`/questions/${q.id}`} className="text-sm font-semibold text-mo-cyan hover:underline">
                    {q.title}
                  </Link>
                  <span className="ml-2 text-xs text-mo-body">{q.answer_count === 1 ? "1 answer" : `${q.answer_count} answers`}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <Textarea label={COPY.askBodyLabel} description={COPY.askBodyHint} value={body} onChange={setBody} minRows={4} maxRows={16} maxLength={10000} />

        <fieldset aria-describedby="ask-topics-hint">
          <legend className="text-sm font-semibold text-mo-ink">{COPY.askTopicsLabel}</legend>
          <p id="ask-topics-hint" className="mb-2 text-xs text-mo-body">
            {COPY.askTopicsHint}
          </p>
          {topics.data ? (
            topics.data.length === 0 ? (
              <p className="text-sm text-mo-body">{COPY.emptyTopicsBody}</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {topics.data.map((topic) => {
                  const on = topicIds.includes(topic.id)
                  return (
                    <button
                      key={topic.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setTopicIds((ids) => toggleId(ids, topic.id))}
                      className={`${CHIP} px-3 py-1 text-sm ${on ? "border-mo-cyan bg-mo-overlay text-mo-ink" : "text-mo-body hover:text-mo-ink"}`}
                    >
                      {topic.name}
                    </button>
                  )
                })}
              </div>
            )
          ) : (
            topicsFallback
          )}
        </fieldset>

        <div className="flex flex-col gap-1">
          <label htmlFor="ask-tags" className="text-sm font-semibold text-mo-ink">
            {COPY.askTagsLabel}
          </label>
          <input id="ask-tags" value={tagsRaw} onChange={(e) => setTagsRaw(e.target.value)} aria-describedby="ask-tags-hint" className={INPUT} />
          <p id="ask-tags-hint" className="text-xs text-mo-body">
            {tags.length > 0 ? tags.map((t) => `#${t}`).join(" ") : COPY.askTagsHint}
          </p>
        </div>

        <Switch label={COPY.askAnonymousLabel} description={COPY.askAnonymousHint} checked={anonymous} onChange={setAnonymous} />
      </div>

      {failure ? (
        <p role="alert" className="text-sm text-mo-bad">
          {failure}
        </p>
      ) : null}

      <div className="flex justify-end">
        <button type="submit" disabled={!ready} className={PRIMARY}>
          {busy ? "Posting…" : COPY.askSubmit}
        </button>
      </div>
    </form>
  )
}
