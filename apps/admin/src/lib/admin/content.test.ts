import { describe, expect, it } from "vitest"
import { checkReason } from "../blocks/confirm"
import { ADMIN_APPS } from "./apps"
import {
  CHAT_STATS_PARTS,
  QA_MAX_REASON_LENGTH,
  QA_STATS_PART,
  QA_WRITES,
  SOCIAL_STATS_PARTS,
  TUBE_STATS_PART,
  checkQaReason,
  commentStatusRequirement,
  contentDecisionRequirement,
  contentPath,
  contentReviewStatusRequirement,
  contentVisibilityRequirement,
  mergedStatsView,
  qaStepUp,
  singleStatsView,
  urgentTiles,
  type QaWrite,
} from "./content"
import { parseAdminMe } from "./me"
import { CHAT_SECTIONS, QA_SECTIONS, SOCIAL_SECTIONS, TUBE_SECTIONS, can, visibleSections } from "./sections"

const navigation = ADMIN_APPS.map((app) => ({ app: app.id, label: app.label }))

function me(apps: Record<string, string[]>, platform: string[] = []) {
  const parsed = parseAdminMe({ data: { user_id: "u-1", permissions: { platform, apps }, mfa: { required: true, verified: true }, navigation } })
  if (!parsed) throw new Error("fixture did not parse")
  return parsed
}

const ids = (sections: { id: string }[]) => sections.map((s) => s.id)

describe("merged stats", () => {
  const partial = {
    data: {
      parts: {
        content: { status: "ok", source: "post-service", stats: { flagged_posts_pending: 3, flagged_reels_pending: 0, open_content_reports: 12, generated_at: "2026-09-17T09:00:00Z" } },
        pages: { status: "unavailable", source: "user-service", error: "answered 503", upstream_status: 503 },
      },
      complete: false,
    },
  }

  it("renders the part that answered and marks the other unavailable with its reason, never zeros", () => {
    const view = mergedStatsView(SOCIAL_STATS_PARTS, { status: "ok", raw: partial })
    expect(view.state).toBe("partial")
    expect(view.message).toBe("Business pages unavailable")
    const content = view.parts.find((p) => p.name === "content")
    const pages = view.parts.find((p) => p.name === "pages")
    expect(content?.status).toBe("ok")
    expect(content?.tiles.find((t) => t.key === "flagged_posts_pending")).toMatchObject({ display: "3", tone: "warn" })
    expect(content?.tiles.find((t) => t.key === "flagged_reels_pending")).toMatchObject({ display: "0", tone: "normal" })
    expect(content?.tiles.find((t) => t.key === "open_content_reports")).toMatchObject({ display: "12", tone: "bad" })
    expect(content?.tiles.find((t) => t.key === "posts_created_today")?.display).toBe("unavailable")
    expect(content?.generatedAt).toBe("2026-09-17T09:00:00Z")
    expect(pages?.status).toBe("unavailable")
    expect(pages?.error).toBe("user-service answered 503")
    expect(pages?.tiles.every((t) => t.display === "unavailable" && t.tone === "unknown")).toBe(true)
    expect(JSON.stringify(pages)).not.toMatch(/"display":"0"/)
  })

  it("reads a part that wraps its counts one level down (pages)", () => {
    const raw = { data: { parts: { content: { status: "ok", stats: {} }, pages: { status: "ok", stats: { pages: { pending_review: 4, documents_pending: 1, as_of: "2026-09-17T09:00:00Z" } } } }, complete: true } }
    const view = mergedStatsView(SOCIAL_STATS_PARTS, { status: "ok", raw })
    expect(view.state).toBe("ok")
    const pages = view.parts.find((p) => p.name === "pages")
    expect(pages?.tiles.find((t) => t.key === "pending_review")).toMatchObject({ display: "4", tone: "warn" })
    expect(pages?.generatedAt).toBe("2026-09-17T09:00:00Z")
  })

  it("makes every part unavailable when no source answered (503) or the body is unreadable", () => {
    const failed = mergedStatsView(CHAT_STATS_PARTS, { status: "error", message: "No stats source answered" })
    expect(failed.state).toBe("unavailable")
    expect(failed.parts.map((p) => p.name)).toEqual(["channels", "groups", "communities"])
    expect(failed.parts.every((p) => p.status === "unavailable" && p.error === "No stats source answered")).toBe(true)
    const unreadable = mergedStatsView(CHAT_STATS_PARTS, { status: "ok", raw: { data: [] } })
    expect(unreadable.state).toBe("unavailable")
    const missing = mergedStatsView(CHAT_STATS_PARTS, { status: "ok", raw: { data: { parts: { channels: { status: "ok", stats: { open_reports: 1 } } }, complete: false } } })
    expect(missing.parts.find((p) => p.name === "groups")?.error).toBe("not in the answer")
    expect(missing.parts.find((p) => p.name === "channels")?.tiles[0]).toMatchObject({ key: "open_reports", display: "1", tone: "bad" })
  })

  it("puts the urgent tiles of the answered parts first on a card", () => {
    const view = mergedStatsView(SOCIAL_STATS_PARTS, { status: "ok", raw: partial }, { compact: true })
    expect(urgentTiles(view).map((t) => t.key)).toEqual(["flagged_posts_pending", "flagged_reels_pending", "open_content_reports"])
    expect(view.parts.find((p) => p.name === "pages")?.status).toBe("unavailable")
  })

  it("reads single-source stats, the Q&A reasons breakdown included", () => {
    const qa = singleStatsView(QA_STATS_PART, { status: "ok", raw: { data: { open_reports_total: 2, open_reports_by_reason: { spam: 1, harassment: 1 }, locked_questions: 0 } } })
    expect(qa.state).toBe("ok")
    expect(qa.parts[0].tiles.find((t) => t.key === "open_reports_total")).toMatchObject({ display: "2", tone: "bad" })
    expect(qa.parts[0].tiles.find((t) => t.key === "open_reports_by_reason")?.display).toBe("spam 1 · harassment 1")
    expect(qa.parts[0].tiles.find((t) => t.key === "hidden_questions_last_7_days")?.display).toBe("unavailable")
    const tube = singleStatsView(TUBE_STATS_PART, { status: "error", message: "boom" })
    expect(tube.state).toBe("unavailable")
    expect(tube.parts[0].error).toBe("boom")
    expect(singleStatsView(TUBE_STATS_PART, { status: "loading" }).parts[0].tiles.every((t) => t.display === "…")).toBe(true)
  })
})

describe("Content sections per permission set", () => {
  it("a reels remover sees the reels queue without moderate; a pages reviewer sees only pages", () => {
    expect(ids(visibleSections(me({ social: ["social:reels.remove"] }), "social", SOCIAL_SECTIONS))).toEqual(["reels"])
    expect(ids(visibleSections(me({ social: ["social:documents.review"] }), "social", SOCIAL_SECTIONS))).toEqual(["pages"])
    const m = me({ social: ["social:posts.moderate", "social:reports.act", "social:users.read"] })
    expect(ids(visibleSections(m, "social", SOCIAL_SECTIONS))).toEqual(["posts", "reports", "creators"])
    expect(can(m, "social", "posts.remove")).toBe(false)
  })

  it("Tube: a channels moderator sees channels only; a video remover sees videos and series", () => {
    expect(ids(visibleSections(me({ tube: ["tube:channels.moderate"] }), "tube", TUBE_SECTIONS))).toEqual(["channels"])
    expect(ids(visibleSections(me({ tube: ["tube:videos.remove"] }), "tube", TUBE_SECTIONS))).toEqual(["videos", "series"])
  })

  it("Q&A: a reports reader sees reports; a merger sees questions; audit needs audit.read", () => {
    expect(ids(visibleSections(me({ qa: ["qa:reports.read"] }), "qa", QA_SECTIONS))).toEqual(["reports"])
    expect(ids(visibleSections(me({ qa: ["qa:questions.merge", "qa:audit.read"] }), "qa", QA_SECTIONS))).toEqual(["questions", "actions"])
    expect(visibleSections(me({ social: ["social:posts.moderate"] }), "qa", QA_SECTIONS)).toEqual([])
  })

  it("Chat: a channel moderator without report permissions sees only channels", () => {
    expect(ids(visibleSections(me({ chat: ["chat:channels.moderate"] }), "chat", CHAT_SECTIONS))).toEqual(["channels"])
    expect(ids(visibleSections(me({ chat: ["chat:reports.read"] }), "chat", CHAT_SECTIONS))).toEqual(["channels", "groups", "communities"])
    expect(ids(visibleSections(me({}, ["*"]), "chat", CHAT_SECTIONS))).toEqual(CHAT_SECTIONS.map((s) => s.id))
  })
})

describe("Q&A reason rule", () => {
  it("refuses a blank reason", () => {
    expect(checkQaReason("").ok).toBe(false)
    expect(checkQaReason("   \n ").ok).toBe(false)
    expect(checkQaReason("").message).toMatch(/required/)
  })

  it("allows exactly 2000 characters and refuses 2001", () => {
    expect(QA_MAX_REASON_LENGTH).toBe(2000)
    expect(checkQaReason("x".repeat(2000)).ok).toBe(true)
    expect(checkQaReason(`${"x".repeat(2000)} `).ok).toBe(true) // trimmed
    const over = checkQaReason("x".repeat(2001))
    expect(over.ok).toBe(false)
    expect(over.message).toContain("2000")
  })

  it("keeps the console's default limit for every other dialog", () => {
    expect(checkReason("x".repeat(501), { destructive: true }).ok).toBe(false)
    expect(checkReason("x".repeat(500), { destructive: true }).ok).toBe(true)
  })

  it("only merge needs a step-up; every write has a permission", () => {
    const writes = Object.keys(QA_WRITES) as QaWrite[]
    expect(writes.filter(qaStepUp)).toEqual(["question.merge"])
    for (const w of writes) expect(QA_WRITES[w].permission).toMatch(/\./)
  })
})

describe("takedown versus moderate", () => {
  it("reject and rejected are takedowns of the kind: remove permission and step-up", () => {
    expect(contentDecisionRequirement("reel", "reject")).toEqual({ permission: "reels.remove", stepUp: true, takedown: true })
    expect(contentDecisionRequirement("post", "reject")).toEqual({ permission: "posts.remove", stepUp: true, takedown: true })
    expect(contentDecisionRequirement("video", "reject")).toEqual({ permission: "videos.remove", stepUp: true, takedown: true })
    expect(contentReviewStatusRequirement("video", "rejected")).toEqual({ permission: "videos.remove", stepUp: true, takedown: true })
  })

  it("approve, needs changes, approved and visibility are moderate without step-up", () => {
    expect(contentDecisionRequirement("reel", "approve")).toEqual({ permission: "reels.moderate", stepUp: false, takedown: false })
    expect(contentDecisionRequirement("post", "needs_changes")).toEqual({ permission: "posts.moderate", stepUp: false, takedown: false })
    expect(contentReviewStatusRequirement("reel", "approved")).toEqual({ permission: "reels.moderate", stepUp: false, takedown: false })
    expect(contentVisibilityRequirement("video")).toEqual({ permission: "videos.moderate", stepUp: false, takedown: false })
  })

  it("a comment hidden or removed is a takedown; visible or review is not", () => {
    expect(commentStatusRequirement("hidden")).toEqual({ permission: "comments.remove", stepUp: true, takedown: true })
    expect(commentStatusRequirement("removed")).toEqual({ permission: "comments.remove", stepUp: true, takedown: true })
    expect(commentStatusRequirement("visible")).toEqual({ permission: "comments.moderate", stepUp: false, takedown: false })
    expect(commentStatusRequirement("review")).toEqual({ permission: "comments.moderate", stepUp: false, takedown: false })
  })
})

describe("the kind is in the URL", () => {
  it("builds each kind's routes under its app", () => {
    expect(contentPath("post", "/review-queue")).toBe("/v1/admin/social/posts/review-queue")
    expect(contentPath("reel", "/abc/moderation")).toBe("/v1/admin/social/reels/abc/moderation")
    expect(contentPath("reel", "/review-status")).toBe("/v1/admin/social/reels/review-status")
    expect(contentPath("video", "/abc/moderation-history")).toBe("/v1/admin/tube/videos/abc/moderation-history")
    expect(contentPath("video")).toBe("/v1/admin/tube/videos")
  })
})
