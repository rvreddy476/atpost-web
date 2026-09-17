import { describe, expect, it } from "vitest"
import answersGet200 from "./__fixtures__/answers_get_200.json"
import questionGet200 from "./__fixtures__/question_get_200.json"
import questionGet200Anonymous from "./__fixtures__/question_get_200_anonymous.json"
import questionsGet200 from "./__fixtures__/questions_get_200.json"
import settingsDefaults from "./__fixtures__/settings_get_200_defaults.json"
import topicsGet200 from "./__fixtures__/topics_get_200.json"
import { byline } from "./byline"
import {
  DEFAULT_SETTINGS,
  SETTINGS_KEYS,
  parseAnswers,
  parseComments,
  parseQuestion,
  parseQuestionPage,
  parseQuestionSummaries,
  parseSettings,
  parseTopics,
  settingsPutBody,
} from "./parse"
import { EMPTY_UUID } from "./wire"

/**
 * The fixtures are byte-for-byte copies of qa-service's golden contract files
 * (internal/http/testdata/contracts). The service's own tests assert its
 * handlers still produce them, so decoding them here is the web's half of the
 * contract.
 */

describe("golden fixtures decode", () => {
  it("question_get_200", () => {
    const q = parseQuestion(questionGet200.data)
    expect(q.id).toBe("1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d")
    expect(q.title).toBe("How do I scale a Go service behind a gateway?")
    expect(q.body).toContain("thirty services")
    expect(q.status).toBe("open")
    expect(q.vote_score).toBe(7)
    expect(q.upvote_count).toBe(8)
    expect(q.downvote_count).toBe(1)
    expect(q.answer_count).toBe(2)
    expect(q.follow_count).toBe(3)
    expect(q.is_answered).toBe(true)
    expect(q.best_answer_id).toBe("9f8e7d6c-5b4a-4938-8271-6f5e4d3c2b1a")
    expect(q.topics).toHaveLength(1)
    expect(q.topics[0]).toMatchObject({ name: "Go", slug: "go", question_count: 42, follower_count: 310, is_featured: true, is_following: false })
    expect(q.tags).toEqual(["latency"])
    expect(q.author).toEqual({ user_id: "2d598287-eee7-40b4-a7f5-b46b9412e4e7", username: "priya", display_name: "Priya R" })
    expect(q.viewer_vote).toBe("up")
    expect(q.is_saved).toBe(true)
    expect(q.is_following).toBe(true)
    expect(q.is_pinned).toBe(false)
    expect(q.is_anonymous).toBe(false)
    expect(q.media_ids).toEqual(["3c4d5e6f-7a8b-4c9d-0e1f-2a3b4c5d6e7f"])
    expect(byline(q.is_anonymous, q.author)).toBe("Priya R")
  })

  it("question_get_200_anonymous: Anonymous byline, no author", () => {
    const q = parseQuestion(questionGet200Anonymous.data)
    expect(q.is_anonymous).toBe(true)
    expect(q.author).toBeNull()
    expect(q.author_id).toBe(EMPTY_UUID)
    expect(q.body).toBe("")
    expect(q.topics).toEqual([])
    expect(q.tags).toEqual([])
    expect(q.media_ids).toEqual([])
    expect(q.viewer_vote).toBeNull()
    expect(q.best_answer_id).toBeNull()
    expect(byline(q.is_anonymous, q.author)).toBe("Anonymous")
  })

  it("questions_get_200: the paginated envelope", () => {
    const page = parseQuestionPage(questionsGet200.data)
    expect(page.pagination).toEqual({ has_more: false, limit: 20, offset: 0 })
    expect(page.questions).toHaveLength(1)
    const row = page.questions[0]
    expect(row.excerpt).toBe("We run one gateway in front of thirty services and the tail latency climbs.")
    expect(row.is_answered).toBe(true)
    expect(row.tags).toEqual([])
    // A named row the server sent no author for is a Member, never Anonymous.
    expect(row.author).toBeNull()
    expect(byline(row.is_anonymous, row.author)).toBe("Member")
  })

  it("answers_get_200", () => {
    const answers = parseAnswers(answersGet200.data)
    expect(answers).toHaveLength(1)
    expect(answers[0]).toMatchObject({
      id: "9f8e7d6c-5b4a-4938-8271-6f5e4d3c2b1a",
      question_id: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
      vote_score: 12,
      upvote_count: 12,
      is_best: true,
      is_accepted: true,
      comment_count: 1,
      is_saved: false,
      is_anonymous: false,
      viewer_vote: null,
      author: null,
    })
    expect(byline(answers[0].is_anonymous, answers[0].author)).toBe("Member")
  })

  it("topics_get_200", () => {
    const topics = parseTopics(topicsGet200.data)
    expect(topics).toEqual([
      {
        id: "7f3f2a1c-1d4e-4a2b-9c8d-2f6b5a4e3c21",
        name: "Go",
        slug: "go",
        description: "The Go programming language.",
        icon_url: "",
        parent_topic_id: null,
        question_count: 42,
        follower_count: 310,
        is_featured: true,
        created_at: "2026-09-16T09:12:04Z",
        is_following: false,
      },
    ])
  })

  it("settings_get_200_defaults matches the client's defaults exactly", () => {
    expect(parseSettings(settingsDefaults.data)).toEqual(settingsDefaults.data)
    expect(DEFAULT_SETTINGS).toEqual(settingsDefaults.data)
    expect([...SETTINGS_KEYS].sort()).toEqual(Object.keys(settingsDefaults.data).sort())
  })
})

describe("tolerant decoding", () => {
  it("reads a null listing as empty", () => {
    expect(parseQuestionSummaries(null)).toEqual([])
    expect(parseAnswers(null)).toEqual([])
    expect(parseTopics(undefined)).toEqual([])
    expect(parseComments(null)).toEqual([])
    expect(parseQuestionPage(null)).toEqual({ questions: [], pagination: { limit: 0, offset: 0, has_more: false } })
  })

  it("never keeps a name on an anonymous row, even if one leaks", () => {
    const [row] = parseQuestionSummaries([
      { id: "x", is_anonymous: true, author: { user_id: "u", username: "leak", display_name: "Leak" } },
    ])
    expect(row.author).toBeNull()
    expect(byline(row.is_anonymous, row.author)).toBe("Anonymous")
  })

  it("ignores an unknown vote value and wrong types", () => {
    const q = parseQuestion({ viewer_vote: "sideways", vote_score: "7", tags: ["a", 1, null], is_saved: "yes" })
    expect(q.viewer_vote).toBeNull()
    expect(q.vote_score).toBe(0)
    expect(q.tags).toEqual(["a"])
    expect(q.is_saved).toBe(false)
  })

  it("reads the legacy `pinned` key as pinned", () => {
    expect(parseQuestionSummaries([{ pinned: true }])[0].is_pinned).toBe(true)
  })
})

describe("settings round-trip", () => {
  it("fills a missing key with the server default", () => {
    const parsed = parseSettings({ push_votes: true })
    expect(parsed.push_votes).toBe(true)
    expect(parsed.email_topic_digest).toBe(false)
    expect(parsed.inbox_answers).toBe(true)
  })

  it("the PUT body carries all sixteen fields and nothing else", () => {
    const edited = { ...parseSettings(settingsDefaults.data), email_topic_digest: true, inbox_votes: false }
    const body = settingsPutBody({ ...edited, extra: true } as typeof edited)
    expect(Object.keys(body)).toHaveLength(16)
    expect(Object.keys(body).sort()).toEqual([...SETTINGS_KEYS].sort())
    expect(body.email_topic_digest).toBe(true)
    expect(body.inbox_votes).toBe(false)
    expect(parseSettings(JSON.parse(JSON.stringify(body)))).toEqual(edited)
  })
})
