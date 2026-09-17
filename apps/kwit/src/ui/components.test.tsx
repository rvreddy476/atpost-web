import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import questionGet200Anonymous from "@/qa/__fixtures__/question_get_200_anonymous.json"
import questionsGet200 from "@/qa/__fixtures__/questions_get_200.json"
import { kwitSignInHref } from "@/chrome/links"
import { parseQuestion, parseQuestionPage, parseQuestionSummary } from "@/qa/parse"
import { EMPTY_UUID } from "@/qa/wire"
import { Byline } from "./Byline"
import { QuestionCard } from "./QuestionCard"
import { EmptyState, NotAvailable } from "./states"
import { VoteView } from "./VoteControl"

/**
 * Rendered with react-dom/server — the repo has no jsdom — so these check
 * what each state draws, not the press itself.
 */

const ME = "66666666-6666-4666-8666-666666666666"

describe("Byline", () => {
  const anon = parseQuestion(questionGet200Anonymous.data)

  it("an anonymous post reads Anonymous and never shows the masked id", () => {
    const html = renderToStaticMarkup(
      <Byline isAnonymous={anon.is_anonymous} author={anon.author} authorId={anon.author_id} viewerId={null} createdAt={anon.created_at} />,
    )
    expect(html).toContain(">Anonymous<")
    expect(html).not.toContain(EMPTY_UUID)
    expect(html).not.toContain("<a ")
    expect(html).not.toContain("Posted anonymously")
  })

  it("the author of an anonymous post sees the marker", () => {
    const html = renderToStaticMarkup(<Byline isAnonymous author={null} authorId={ME} viewerId={ME} />)
    expect(html).toContain(">Anonymous<")
    expect(html).toContain("Posted anonymously")
    expect(html).not.toContain(ME)
  })

  it("a named post with no author reads Member", () => {
    const html = renderToStaticMarkup(<Byline isAnonymous={false} author={null} authorId="2d598287-eee7-40b4-a7f5-b46b9412e4e7" viewerId={null} />)
    expect(html).toContain(">Member<")
    expect(html).not.toContain("Anonymous")
  })
})

describe("QuestionCard", () => {
  it("links the title to the question and shows its counts", () => {
    const row = parseQuestionPage(questionsGet200.data).questions[0]
    const html = renderToStaticMarkup(<QuestionCard question={row} viewerId={null} />)
    expect(html).toContain('href="/questions/1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d"')
    expect(html).toContain("How do I scale a Go service behind a gateway?")
    expect(html).toContain("2 answers")
    expect(html).toContain("Answered")
    expect(html).toContain("tail latency climbs")
  })

  it("an anonymous row links nothing to its author", () => {
    const row = parseQuestionSummary({ ...questionGet200Anonymous.data, excerpt: "" })
    const html = renderToStaticMarkup(<QuestionCard question={row} viewerId={null} />)
    expect(html).toContain(">Anonymous<")
    expect(html).not.toContain(EMPTY_UUID)
  })
})

describe("VoteView", () => {
  const state = { viewerVote: "up" as const, score: 7, up: 8, down: 1 }

  it("marks the viewer's vote pressed", () => {
    const html = renderToStaticMarkup(<VoteView state={state} onPress={() => undefined} signInHref="/login" subject="question" />)
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1)
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(1)
    expect(html).toMatch(/aria-pressed="true" aria-label="Upvote question"/)
    expect(html).toContain(">7<")
  })

  it("signed out, the arrows are sign-in links", () => {
    const href = kwitSignInHref("/questions/abc")
    const html = renderToStaticMarkup(<VoteView state={state} signInHref={href} subject="answer" />)
    expect(html).not.toContain("<button")
    expect(html).toContain(`href="${href.replace(/&/g, "&amp;")}"`)
    expect(html).toContain("Sign in to upvote answer")
  })
})

describe("states", () => {
  it("the gate screen says Know It isn't available", () => {
    const html = renderToStaticMarkup(<NotAvailable />)
    expect(html.replace(/&#x27;/g, "'")).toMatch(/isn.t available/i)
    expect(html).toContain('role="status"')
  })

  it("an empty state carries its title and body", () => {
    const html = renderToStaticMarkup(<EmptyState title="Nothing here yet" body="Follow a few topics." />)
    expect(html).toContain("Nothing here yet")
    expect(html).toContain("Follow a few topics.")
  })
})

describe("kwitSignInHref", () => {
  it("returns to the Know It page the reader was on", () => {
    expect(kwitSignInHref("/")).toBe("/login?redirect=%2Fkwit")
    expect(kwitSignInHref("/questions/abc")).toBe("/login?redirect=%2Fkwit%2Fquestions%2Fabc")
    expect(kwitSignInHref("new")).toBe("/login?redirect=%2Fkwit%2Fnew")
  })
})
