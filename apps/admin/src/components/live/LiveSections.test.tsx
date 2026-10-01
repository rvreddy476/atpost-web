import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import type { DataColumn } from "@/components/blocks/DataTable"
import type { Row } from "@/lib/admin/data"
import { liveBanColumns, liveReportColumns, liveStreamColumns } from "./LiveSections"

const STREAM: Row = { id: "s-1", title: "Diwali sale", status: "reconnecting", host_username: "asha", host_user_id: "h-1", viewer_count: 1234, started_at: "2026-10-01T10:00:00Z" }
const REPORT: Row = { id: "r-1", reason: "harassment", reporter_user_id: "u-9", reporter_username: "meera", message_id: "m-1", message_text: "you are an idiot", stream_id: "s-1", stream_title: "Diwali sale", note: "third time", created_at: "2026-10-01T10:05:00Z" }
const BAN: Row = { user_id: "8a1f3c2e-1111-4222-8333-944455566677", username: "spammer", reason: "Scam links in every stream", banned_by: "a-1", created_at: "2026-09-30T08:00:00Z" }

/** Every cell of one row, as the table would render it. */
const renderRow = (columns: DataColumn<Row>[], row: Row) =>
  renderToStaticMarkup(
    <table>
      <tbody>
        <tr>
          {columns.map((c) => (
            <td key={c.key}>{c.cell ? c.cell(row) : String(c.value(row) ?? "")}</td>
          ))}
        </tr>
      </tbody>
    </table>,
  )

const buttons = (html: string) => html.match(/<button/g)?.length ?? 0

describe("no action button without its permission", () => {
  it("live now: Stop only with live:streams.stop", () => {
    const without = liveStreamColumns({ stop: false }, vi.fn())
    expect(without.map((c) => c.key)).not.toContain("actions")
    expect(buttons(renderRow(without, STREAM))).toBe(0)

    const html = renderRow(liveStreamColumns({ stop: true }, vi.fn()), STREAM)
    expect(buttons(html)).toBe(1)
    expect(html).toContain('aria-label="Stop Diwali sale"')
  })

  it("open reports: Resolve only with live:reports.act", () => {
    const without = liveReportColumns({ resolve: false }, vi.fn())
    expect(without.map((c) => c.key)).not.toContain("actions")
    expect(buttons(renderRow(without, REPORT))).toBe(0)

    const html = renderRow(liveReportColumns({ resolve: true }, vi.fn()), REPORT)
    expect(buttons(html)).toBe(1)
    expect(html).toContain("Resolve")
  })

  it("live bans: Unban only with live:users.ban", () => {
    const without = liveBanColumns({ ban: false }, vi.fn())
    expect(without.map((c) => c.key)).not.toContain("actions")
    expect(buttons(renderRow(without, BAN))).toBe(0)

    const html = renderRow(liveBanColumns({ ban: true }, vi.fn()), BAN)
    expect(buttons(html)).toBe(1)
    expect(html).toContain('aria-label="Unban spammer"')
  })

  it("the button calls back with its own row", () => {
    const onStop = vi.fn()
    const actions = liveStreamColumns({ stop: true }, onStop).find((c) => c.key === "actions")
    const element = actions?.cell?.(STREAM) as { props: { onClick: () => void } }
    element.props.onClick()
    expect(onStop).toHaveBeenCalledWith(STREAM)
  })
})

describe("what each row shows", () => {
  it("a stream: status label, host, viewers and start", () => {
    const html = renderRow(liveStreamColumns({ stop: false }, vi.fn()), STREAM)
    expect(html).toContain("Reconnecting")
    expect(html).toContain("asha")
    expect(html).toContain("1,234")
    expect(liveStreamColumns({ stop: false }, vi.fn()).map((c) => c.header)).toEqual(["Stream", "Status", "Host", "Viewers", "Started"])
  })

  it("a report: reason, note, reporter, the reported message and its stream", () => {
    const html = renderRow(liveReportColumns({ resolve: false }, vi.fn()), REPORT)
    expect(html).toContain("Harassment")
    expect(html).toContain("third time")
    expect(html).toContain("meera")
    expect(html).toContain("<q")
    expect(html).toContain("you are an idiot")
    expect(html).toContain("Diwali sale")
  })

  it("a report on the stream itself says so", () => {
    const html = renderRow(liveReportColumns({ resolve: false }, vi.fn()), { id: "r-2", reason: "nudity", stream_id: "s-1" })
    expect(html).toContain("The stream itself")
  })

  it("a ban: who, why, and since when", () => {
    const html = renderRow(liveBanColumns({ ban: false }, vi.fn()), BAN)
    expect(html).toContain("spammer")
    expect(html).toContain("Scam links in every stream")
  })
})
