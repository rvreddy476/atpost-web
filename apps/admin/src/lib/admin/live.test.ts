import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it, vi } from "vitest"
import { APP_ENTRY_PERMISSIONS } from "./apps"
import {
  ACTIVE_STATUSES,
  LIVE_BANS,
  LIVE_PERMISSIONS,
  LIVE_REFRESH_MS,
  LIVE_REPORTS,
  LIVE_STREAMS,
  REPORT_REASONS,
  activeStreams,
  banUserIdProblem,
  liveAbilities,
  liveRequest,
  liveStatusLabel,
  liveStatusTone,
  reportMessage,
  reportReasonLabel,
  reportReporter,
  reportStream,
  resolveChoices,
  sortBans,
  sortReports,
  streamHost,
  streamStartedAt,
  type LiveWrite,
  type ResolveAction,
} from "./live"
import { buildAdminNav, findNavGroup, parseAdminMe } from "./me"
import { prepareSend, runSteppedAdminMutation, type SentResponse, type Transport } from "./mutation"

const ALL_LIVE = Object.values(LIVE_PERMISSIONS).map((action) => `live:${action}`)
const MODERATOR = ["live:streams.read", "live:reports.read", "live:reports.act", "live:chat.moderate"]

function me(live: string[] = [], { navigation = [{ app: "live", label: "Live" }] as unknown[], platform = [] as string[] } = {}) {
  const parsed = parseAdminMe({
    data: {
      user_id: "u-1",
      permissions: { platform, apps: live.length ? { live } : {} },
      mfa: { required: true, verified: true, auth_time: 1_760_000_000 },
      step_up_valid_until: null,
      step_up_window_seconds: 300,
      navigation,
    },
  })
  if (!parsed) throw new Error("fixture did not parse")
  return parsed
}

const REASON = "Repeated slurs in chat after a warning"

const read = (relative: string) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8")
const SECTIONS = read("../../components/live/LiveSections.tsx")
const PAGE = read("../../app/live/page.tsx")

// ---------------------------------------------------------------------------
// Navigation and abilities by permission
// ---------------------------------------------------------------------------

describe("nav by permission", () => {
  it("shows Live at /live to a holder of live:streams.read", () => {
    const group = findNavGroup(buildAdminNav(me(["live:streams.read"])), "live")
    expect(group).toMatchObject({ app: "live", label: "Live", href: "/live" })
  })

  it("does not show Live without live:streams.read, whatever else the admin holds", () => {
    const others = ALL_LIVE.filter((p) => p !== "live:streams.read")
    expect(findNavGroup(buildAdminNav(me(others)), "live")).toBeNull()
    for (const one of others) expect([one, findNavGroup(buildAdminNav(me([one])), "live")]).toEqual([one, null])
    expect(APP_ENTRY_PERMISSIONS.live).toBe(LIVE_PERMISSIONS.streamsRead)
  })

  it("does not show Live when the server's navigation leaves it out", () => {
    expect(findNavGroup(buildAdminNav(me(ALL_LIVE, { navigation: [] })), "live")).toBeNull()
  })

  it("an app-wide wildcard opens it; a cross-app audit permission does not", () => {
    expect(findNavGroup(buildAdminNav(me(["live:*"])), "live")).not.toBeNull()
    expect(findNavGroup(buildAdminNav(me([], { platform: ["*:audit.read"] })), "live")).toBeNull()
  })

  it("names the app Live when admin-service sends its bare id as the label", () => {
    expect(findNavGroup(buildAdminNav(me(["live:streams.read"], { navigation: [{ app: "live", label: "live" }] })), "live")?.label).toBe("Live")
  })

  it("the page refuses without the nav group or without live:streams.read", () => {
    expect(PAGE).toContain('const group = findNavGroup(nav, "live")')
    expect(PAGE).toContain("if (!group || !can.page) return <NoAccessToApp />")
  })
})

describe("liveAbilities: each action with its own permission", () => {
  it("a full live admin may do everything", () => {
    expect(liveAbilities(me(ALL_LIVE))).toEqual({ page: true, stop: true, reports: true, resolve: true, removeMessage: true, ban: true })
  })

  it("a moderator resolves reports and removes messages, but never stops a stream or bans", () => {
    expect(liveAbilities(me(MODERATOR))).toEqual({ page: true, stop: false, reports: true, resolve: true, removeMessage: true, ban: false })
  })

  it("a reader sees the lists and no action", () => {
    expect(liveAbilities(me(["live:streams.read", "live:reports.read"]))).toEqual({ page: true, stop: false, reports: true, resolve: false, removeMessage: false, ban: false })
  })

  it("each write permission adds exactly its own action", () => {
    const base = ["live:streams.read", "live:reports.read"]
    expect(liveAbilities(me([...base, "live:streams.stop"])).stop).toBe(true)
    expect(liveAbilities(me([...base, "live:users.ban"])).ban).toBe(true)
    expect(liveAbilities(me([...base, "live:reports.act"])).resolve).toBe(true)
    expect(liveAbilities(me([...base, "live:reports.act"])).removeMessage).toBe(false)
    expect(liveAbilities(me([...base, "live:chat.moderate"])).removeMessage).toBe(false)
  })

  it("acting on reports needs reading them", () => {
    expect(liveAbilities(me(["live:streams.read", "live:reports.act", "live:chat.moderate"]))).toMatchObject({ reports: false, resolve: false, removeMessage: false })
  })

  it("nothing at all without live:streams.read", () => {
    expect(liveAbilities(me(ALL_LIVE.filter((p) => p !== "live:streams.read")))).toEqual({ page: false, stop: false, reports: false, resolve: false, removeMessage: false, ban: false })
  })

  it("permissions from another app grant nothing here", () => {
    const other = parseAdminMe({ data: { user_id: "u", permissions: { platform: [], apps: { chat: ["chat:streams.read", "chat:users.ban"] } }, mfa: { required: true, verified: true }, navigation: [] } })
    if (!other) throw new Error("fixture")
    expect(liveAbilities(other).page).toBe(false)
    expect(liveAbilities(other).ban).toBe(false)
  })

  it("the page mounts reports and bans only with their permissions", () => {
    expect(PAGE).toContain("{can.reports ? <LiveReports /> : null}")
    expect(PAGE).toContain("{can.ban ? <LiveBans /> : null}")
    // …and the bans section does not even fetch without it.
    expect(SECTIONS).toContain("enabled: can.ban")
    expect(SECTIONS).toContain("if (!can.ban) return null")
  })
})

// ---------------------------------------------------------------------------
// Status labels and the live-now list
// ---------------------------------------------------------------------------

describe("status labels", () => {
  it("says what live-service means, not the raw value", () => {
    expect(liveStatusLabel("starting")).toBe("Starting")
    expect(liveStatusLabel("live")).toBe("Live")
    expect(liveStatusLabel("reconnecting")).toBe("Reconnecting")
    expect(liveStatusLabel("ended")).toBe("Ended")
    expect(liveStatusLabel("failed")).toBe("Failed")
    expect(liveStatusLabel("scheduled")).toBe("Scheduled")
    expect(liveStatusLabel("LIVE")).toBe("Live")
    expect(liveStatusLabel("on_hold")).toBe("On hold")
    expect(liveStatusLabel(undefined)).toBe("—")
  })

  it("colours live good, reconnecting a warning, failed bad and starting plain", () => {
    expect(liveStatusTone("live")).toBe("good")
    expect(liveStatusTone("reconnecting")).toBe("warn")
    expect(liveStatusTone("failed")).toBe("bad")
    expect(liveStatusTone("starting")).toBe("normal")
    expect(liveStatusTone("anything")).toBe("normal")
  })

  it("live now lists only starting, live and reconnecting streams, A to Z by title", () => {
    expect([...ACTIVE_STATUSES].sort()).toEqual(["live", "reconnecting", "starting"])
    const rows = [
      { id: "1", title: "Zumba", status: "live" },
      { id: "2", title: "art class", status: "reconnecting" },
      { id: "3", title: "Ended one", status: "ended" },
      { id: "4", title: "Failed one", status: "failed" },
      { id: "5", title: "Morning chat", status: "starting" },
      { id: "6", title: "Later", status: "scheduled" },
      { id: "7", title: "No status" },
    ]
    expect(activeStreams(rows).map((r) => r.id)).toEqual(["2", "5", "1"])
  })

  it("same title: by host", () => {
    const rows = [
      { id: "a", title: "Q&A", status: "live", host_username: "zara" },
      { id: "b", title: "Q&A", status: "live", host_username: "amit" },
    ]
    expect(activeStreams(rows).map((r) => r.id)).toEqual(["b", "a"])
  })

  it("reads the host, viewers and start time whatever names the BFF uses", () => {
    expect(streamHost({ host_username: "asha", host_user_id: "h-1" })).toEqual({ name: "asha", id: "h-1" })
    expect(streamHost({ creator_user_id: "c-1" })).toEqual({ name: null, id: "c-1" })
    expect(streamHost({ host: { username: "ravi", user_id: "h-2" } })).toEqual({ name: "ravi", id: "h-2" })
    expect(streamStartedAt({ started_at: "2026-10-01T10:00:00Z", status_changed_at: "x" })).toBe("2026-10-01T10:00:00Z")
    expect(streamStartedAt({ status_changed_at: "2026-10-01T09:59:00Z" })).toBe("2026-10-01T09:59:00Z")
  })

  it("re-reads live now every 15 seconds", () => {
    expect(LIVE_REFRESH_MS).toBe(15_000)
    expect(SECTIONS).toContain("refetchInterval: LIVE_REFRESH_MS")
    const hook = read("../../hooks/useAdminQuery.ts")
    expect(hook).toContain("refetchInterval: refetchInterval ?? false")
  })

  it("reads the BFF routes that mirror live-service's admin routes", () => {
    expect(LIVE_STREAMS).toBe("/v1/admin/live/streams?status=all")
    expect(LIVE_REPORTS).toBe("/v1/admin/live/reports?status=open")
    expect(LIVE_BANS).toBe("/v1/admin/live/bans")
  })
})

// ---------------------------------------------------------------------------
// Reports and resolve
// ---------------------------------------------------------------------------

describe("reports", () => {
  it("reason labels A to Z, covering every reason live-service accepts", () => {
    const labels = REPORT_REASONS.map((r) => r.label)
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b)))
    expect(REPORT_REASONS.map((r) => r.value).sort()).toEqual(["harassment", "hate", "nudity", "other", "scam", "spam", "violence"])
    expect(reportReasonLabel("hate")).toBe("Hate")
    expect(reportReasonLabel("new_reason")).toBe("New reason")
  })

  it("open reports A to Z by reason, oldest first within a reason", () => {
    const rows = [
      { id: "1", reason: "spam", created_at: "2026-10-01T10:00:00Z" },
      { id: "2", reason: "hate", created_at: "2026-10-01T11:00:00Z" },
      { id: "3", reason: "spam", created_at: "2026-10-01T09:00:00Z" },
      { id: "4", reason: "harassment", created_at: "2026-10-01T12:00:00Z" },
    ]
    expect(sortReports(rows).map((r) => r.id)).toEqual(["4", "2", "3", "1"])
  })

  it("reads reporter, message and stream, flat or nested", () => {
    expect(reportReporter({ reporter_user_id: "r-1", reporter_username: "meera" })).toEqual({ name: "meera", id: "r-1" })
    expect(reportReporter({ reporter: { id: "r-2" } })).toEqual({ name: null, id: "r-2" })
    expect(reportMessage({ message_id: "m-1", message_text: "buy followers" })).toEqual({ id: "m-1", text: "buy followers" })
    expect(reportMessage({ message: { id: "m-2", text: "hi" } })).toEqual({ id: "m-2", text: "hi" })
    expect(reportMessage({})).toEqual({ id: null, text: null })
    expect(reportStream({ stream_id: "s-1", stream_title: "Cooking" })).toEqual({ id: "s-1", title: "Cooking" })
    expect(reportStream({ stream: { id: "s-2", title: "Gaming" } })).toEqual({ id: "s-2", title: "Gaming" })
  })
})

describe("resolve choices", () => {
  const onMessage = { id: "rep-1", reason: "spam", message_id: "m-1" }
  const onStream = { id: "rep-2", reason: "nudity" }
  const values = (choices: { value: string }[]) => choices.map((c) => c.value)

  it("a full admin: Ban user, Dismiss, Remove message — A to Z", () => {
    const choices = resolveChoices(liveAbilities(me(ALL_LIVE)), onMessage)
    expect(choices.map((c) => c.label)).toEqual(["Ban user", "Dismiss", "Remove message"])
    expect(values(choices)).toEqual(["ban_user", "dismiss", "remove_message"])
    expect(choices.find((c) => c.value === "dismiss")?.destructive).toBe(false)
    expect(choices.find((c) => c.value === "ban_user")?.destructive).toBe(true)
    expect(choices.find((c) => c.value === "remove_message")?.destructive).toBe(true)
  })

  it("no Remove message for a report about the stream itself", () => {
    expect(values(resolveChoices(liveAbilities(me(ALL_LIVE)), onStream))).toEqual(["ban_user", "dismiss"])
  })

  it("no Ban user without live:users.ban", () => {
    expect(values(resolveChoices(liveAbilities(me(MODERATOR)), onMessage))).toEqual(["dismiss", "remove_message"])
  })

  it("no Remove message without live:chat.moderate", () => {
    expect(values(resolveChoices(liveAbilities(me(["live:streams.read", "live:reports.read", "live:reports.act"])), onMessage))).toEqual(["dismiss"])
  })

  it("nothing without live:reports.act", () => {
    expect(resolveChoices(liveAbilities(me(["live:streams.read", "live:reports.read", "live:users.ban", "live:chat.moderate"])), onMessage)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Request bodies and the reason
// ---------------------------------------------------------------------------

describe("liveRequest: one request per write", () => {
  it("resolve posts {action, reason} to the report", () => {
    for (const action of ["ban_user", "dismiss", "remove_message"] as const) {
      expect(liveRequest({ kind: "resolve", reportId: "rep-1", action, reason: `  ${REASON}  ` })).toEqual({
        method: "post",
        url: "/v1/admin/live/reports/rep-1/resolve",
        body: { action, reason: REASON },
      })
    }
  })

  it("refuses an action live-service does not know", () => {
    expect(() => liveRequest({ kind: "resolve", reportId: "rep-1", action: "delete_stream" as ResolveAction, reason: REASON })).toThrow()
  })

  it("stop posts {reason} to the stream", () => {
    expect(liveRequest({ kind: "stop", streamId: "s-1", reason: REASON })).toEqual({ method: "post", url: "/v1/admin/live/streams/s-1/stop", body: { reason: REASON } })
  })

  it("ban posts and unban deletes the user's live ban, both with a reason", () => {
    const user = "8a1f3c2e-1111-4222-8333-944455566677"
    expect(liveRequest({ kind: "ban", userId: user, reason: REASON })).toEqual({ method: "post", url: `/v1/admin/live/users/${user}/live-ban`, body: { reason: REASON } })
    expect(liveRequest({ kind: "unban", userId: user, reason: REASON })).toEqual({ method: "delete", url: `/v1/admin/live/users/${user}/live-ban`, body: { reason: REASON } })
  })

  it("ids are escaped into the path", () => {
    expect(liveRequest({ kind: "stop", streamId: "a/b?c", reason: REASON }).url).toBe("/v1/admin/live/streams/a%2Fb%3Fc/stop")
  })
})

describe("reason required", () => {
  const writes = (reason: string): LiveWrite[] => [
    { kind: "stop", streamId: "s-1", reason },
    { kind: "resolve", reportId: "r-1", action: "dismiss", reason },
    { kind: "ban", userId: "u-1", reason },
    { kind: "unban", userId: "u-1", reason },
  ]

  it("no write is built without a reason of at least ten characters", () => {
    for (const reason of ["", "   ", "too short", "         x"]) {
      for (const write of writes(reason)) expect(() => liveRequest(write)).toThrow()
    }
    for (const write of writes("Ten chars!")) expect(liveRequest(write).body.reason).toBe("Ten chars!")
  })

  it("every dialog asks for the reason (stop and ban as destructive, resolve and unban as required)", () => {
    const dialogs = SECTIONS.split("<ConfirmReasonDialog").slice(1).map((d) => d.slice(0, d.indexOf("onClose")))
    expect(dialogs).toHaveLength(3)
    for (const dialog of dialogs) expect(dialog).toMatch(/\n\s+(destructive|requireReason)\n/)
    const choice = SECTIONS.split("<ChoiceDialog").slice(1)
    expect(choice).toHaveLength(1)
    expect(choice[0].slice(0, choice[0].indexOf("onClose"))).toMatch(/\n\s+requireReason\n/)
  })

  it("ban needs a full user id", () => {
    expect(banUserIdProblem("")).not.toBeNull()
    expect(banUserIdProblem("8a1f3c2e")).not.toBeNull()
    expect(banUserIdProblem("8a1f3c2e-1111-4222-8333-944455566677")).toBeNull()
    // The ban dialog cannot be confirmed, and sends nothing, until the id is one.
    expect(SECTIONS).toContain("canConfirm={idProblem === null}")
    expect(SECTIONS).toContain('onConfirm={(reason) => idProblem === null && write.mutate({ kind: "ban", userId: userId.trim(), reason })}')
  })

  it("bans list A to Z by name, then id", () => {
    const rows = [{ user_id: "z-9" }, { user_id: "u-2", username: "Bilal" }, { user_id: "u-1", username: "anu" }]
    expect(sortBans(rows).map((r) => r.user_id)).toEqual(["u-1", "u-2", "z-9"])
  })
})

// ---------------------------------------------------------------------------
// Step-up before every write
// ---------------------------------------------------------------------------

describe("step-up before every write", () => {
  const ok: SentResponse = { status: 200, data: { data: {} } }
  const all: LiveWrite[] = [
    { kind: "stop", streamId: "s-1", reason: REASON },
    { kind: "resolve", reportId: "r-1", action: "ban_user", reason: REASON },
    { kind: "resolve", reportId: "r-1", action: "dismiss", reason: REASON },
    { kind: "resolve", reportId: "r-1", action: "remove_message", reason: REASON },
    { kind: "ban", userId: "u-1", reason: REASON },
    { kind: "unban", userId: "u-1", reason: REASON },
  ]

  function harness(answer: boolean) {
    const order: string[] = []
    const transport: Transport = vi.fn(async (request) => {
      order.push(`send ${request.method} ${request.url}`)
      return ok
    })
    const stepUp = vi.fn(async () => {
      order.push("step-up")
      return answer
    })
    return { order, transport, stepUp }
  }

  it("every live write asks for the code BEFORE it is sent", async () => {
    for (const write of all) {
      const h = harness(true)
      const request = liveRequest(write)
      const { send } = prepareSend(request, h.transport)
      expect((await runSteppedAdminMutation(send, h.stepUp, false)).kind).toBe("done")
      expect(h.order).toEqual(["step-up", `send ${request.method} ${request.url}`])
    }
  })

  it("a dismissed prompt sends nothing", async () => {
    for (const write of all) {
      const h = harness(false)
      const { send } = prepareSend(liveRequest(write), h.transport)
      expect(await runSteppedAdminMutation(send, h.stepUp, false)).toEqual({ kind: "cancelled" })
      expect(h.transport).not.toHaveBeenCalled()
    }
  })

  it("every mutation on the page goes through the step-up-first path, and no write leaves any other way", () => {
    const calls = SECTIONS.split("useAdminMutation<").slice(1)
    expect(calls).toHaveLength(3)
    for (const call of calls) {
      const options = call.slice(0, call.indexOf("})"))
      expect(options).toContain("request: liveRequest,")
      expect(options).toMatch(/stepUpFirst: \(\) => stepUpWindowOpen\(me\.stepUpValidUntil, Date\.now\(\)\)/)
    }
    expect(SECTIONS).not.toMatch(/\bapi\.(post|patch|put|delete)\(/)
    expect(SECTIONS).not.toMatch(/from "@\/lib\/admin\/api"/)
    const hook = read("../../hooks/useAdminMutation.tsx")
    expect(hook).toContain("return stepUpFirst ? runSteppedAdminMutation(send, stepUp, stepUpFirst()) : runAdminMutation(send, stepUp)")
  })
})
