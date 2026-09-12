import { describe, expect, it } from "vitest"
import {
  clock,
  dayLabel,
  groupByDay,
  parseHistoryItem,
  parseHistoryPage,
  progressFraction,
  resumeLine,
  type HistoryRow,
} from "./history"

/**
 * The history page's rules, asserted as arithmetic.
 *
 * Every one of these fails silently when it is wrong: a row drawn as a blank
 * card, a "Watched to 44:58 of 45:00" under a video the server already
 * called finished, something watched at 23:50 filed under Today at 00:10.
 * None of them throw, so none of them would be found by a browser either.
 */

/** A local moment, so the day arithmetic below is about calendar days here. */
function local(y: number, m: number, d: number, h = 12): Date {
  return new Date(y, m - 1, d, h, 0, 0)
}

const NOW = local(2026, 9, 12, 15)

function row(over: Partial<HistoryRow> & { lastWatchedAt?: string } = {}): HistoryRow {
  return {
    post: { id: "p1", author_id: "a", content_type: "long_video", created_at: "", counts: { likes: 0, comments: 0 } },
    positionMs: 754_000,
    durationMs: 2_700_000,
    completed: false,
    lastWatchedAt: NOW.toISOString(),
    ...over,
  }
}

describe("clock", () => {
  it("prints zero as a place, not as nothing", () => {
    expect(clock(0)).toBe("0:00")
    expect(clock(-5_000)).toBe("0:00")
  })

  it("pads only what needs padding", () => {
    expect(clock(754_000)).toBe("12:34")
    expect(clock(5_000)).toBe("0:05")
    expect(clock(3_723_000)).toBe("1:02:03")
  })
})

describe("resumeLine", () => {
  it("says where and out of what", () => {
    expect(resumeLine(row())).toBe("Watched to 12:34 of 45:00")
  })

  it("says only Watched once the server has called it complete", () => {
    // 44:58 of 45:00 is true and reads as an invitation to go back for two
    // seconds. The server's 90% rule decided this; the line agrees with it.
    expect(resumeLine(row({ completed: true, positionMs: 2_698_000 }))).toBe("Watched")
  })

  it("drops the 'of' when there is no duration to be out of", () => {
    // A row saved before the transcode finished carries duration 0, and
    // "of 0:00" would claim the video is empty.
    expect(resumeLine(row({ durationMs: 0 }))).toBe("Watched to 12:34")
    expect(resumeLine(row({ durationMs: 0, positionMs: 0 }))).toBe("Watched to 0:00")
  })
})

describe("progressFraction", () => {
  it("agrees with the line: complete is full, no duration is empty", () => {
    expect(progressFraction(row({ completed: true, positionMs: 0 }))).toBe(1)
    expect(progressFraction(row({ durationMs: 0 }))).toBe(0)
  })

  it("is the plain ratio, clamped", () => {
    expect(progressFraction(row({ positionMs: 1_350_000 }))).toBeCloseTo(0.5)
    expect(progressFraction(row({ positionMs: 9_000_000 }))).toBe(1)
  })
})

describe("dayLabel", () => {
  it("is Today for anything on the same local calendar day", () => {
    expect(dayLabel(local(2026, 9, 12, 0).toISOString(), NOW)).toBe("Today")
    expect(dayLabel(local(2026, 9, 12, 23).toISOString(), NOW)).toBe("Today")
  })

  it("is Yesterday by the calendar, not by a 24-hour window", () => {
    // 23:50 last night is Yesterday at 15:00 today, even though it is under
    // 24 hours ago. A window would call it Today until tonight.
    expect(dayLabel(new Date(2026, 8, 11, 23, 50).toISOString(), NOW)).toBe("Yesterday")
  })

  it("is the date, older than that", () => {
    const label = dayLabel(local(2026, 9, 3).toISOString(), NOW)
    expect(label).not.toBe("Today")
    expect(label).not.toBe("Yesterday")
    expect(label).toContain("2026")
  })

  it("files a row it cannot date under Earlier rather than throwing", () => {
    expect(dayLabel("", NOW)).toBe("Earlier")
    expect(dayLabel("not a date", NOW)).toBe("Earlier")
  })
})

describe("groupByDay", () => {
  it("keeps the server's order and opens a group the first time a day appears", () => {
    const rows = [
      row({ lastWatchedAt: local(2026, 9, 12, 14).toISOString() }),
      row({ lastWatchedAt: local(2026, 9, 12, 9).toISOString() }),
      row({ lastWatchedAt: local(2026, 9, 11).toISOString() }),
      row({ lastWatchedAt: local(2026, 9, 3).toISOString() }),
    ]
    const groups = groupByDay(rows, NOW)
    expect(groups.map((g) => g.label).slice(0, 2)).toEqual(["Today", "Yesterday"])
    expect(groups).toHaveLength(3)
    expect(groups[0].rows).toHaveLength(2)
    expect(groups[0].rows[0]).toBe(rows[0])
    expect(groups[2].rows).toHaveLength(1)
  })

  it("is empty for no rows, not a group with nothing in it", () => {
    expect(groupByDay([], NOW)).toEqual([])
  })
})

describe("parseHistoryItem", () => {
  it("reads a contract row", () => {
    const parsed = parseHistoryItem({
      user_id: "u",
      post_id: "p1",
      position_ms: 754000,
      duration_ms: 2700000,
      percent_watched: 27.9,
      completed: false,
      last_watched_at: "2026-09-12T10:00:00Z",
      updated_at: "2026-09-12T10:00:00Z",
      post: { id: "p1", title: "A video" },
    })
    expect(parsed?.post.id).toBe("p1")
    expect(parsed?.positionMs).toBe(754000)
    expect(parsed?.durationMs).toBe(2700000)
    expect(parsed?.completed).toBe(false)
    expect(parsed?.lastWatchedAt).toBe("2026-09-12T10:00:00Z")
  })

  it("drops a row with no post, because a card with no title is not a card", () => {
    expect(parseHistoryItem({ post_id: "p1", position_ms: 1 })).toBeNull()
    expect(parseHistoryItem({ post_id: "p1", post: null })).toBeNull()
    expect(parseHistoryItem({ post_id: "p1", post: {} })).toBeNull()
    expect(parseHistoryItem(null)).toBeNull()
    expect(parseHistoryItem("row")).toBeNull()
  })

  it("falls back to updated_at, the column's other name", () => {
    const parsed = parseHistoryItem({ post: { id: "p1" }, updated_at: "2026-09-12T10:00:00Z" })
    expect(parsed?.lastWatchedAt).toBe("2026-09-12T10:00:00Z")
  })

  it("treats a missing or malformed number as zero rather than NaN", () => {
    const parsed = parseHistoryItem({ post: { id: "p1" }, position_ms: "12", duration_ms: -4 })
    expect(parsed?.positionMs).toBe(0)
    expect(parsed?.durationMs).toBe(0)
  })
})

describe("parseHistoryPage", () => {
  it("keeps the drawable rows and the cursor", () => {
    const page = parseHistoryPage({
      data: [{ post: { id: "a" } }, { post_id: "gone" }, { post: { id: "b" } }],
      meta: { next_cursor: "abc" },
    })
    expect(page.rows.map((r) => r.post.id)).toEqual(["a", "b"])
    expect(page.nextCursor).toBe("abc")
  })

  it("reads an absent meta as the last page, the way feed-service ends a list", () => {
    expect(parseHistoryPage({ data: [] }).nextCursor).toBeNull()
    expect(parseHistoryPage({ data: [], meta: {} }).nextCursor).toBeNull()
    expect(parseHistoryPage({ data: [], meta: { next_cursor: "" } }).nextCursor).toBeNull()
    expect(parseHistoryPage(undefined)).toEqual({ rows: [], nextCursor: null })
  })
})
