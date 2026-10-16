import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import type { DataColumn } from "@/components/blocks/DataTable"
import type { Row } from "@/lib/admin/data"
import { LicenceCell, SoundStatusChip, SoundWriteControls, WithdrawSoundDialog, soundColumns } from "./SoundBits"

const NOW = Date.parse("2026-10-16T12:00:00Z")
const days = (d: number) => new Date(NOW + d * 86_400_000).toISOString()

const SOUND: Row = {
  id: "s-1",
  title: "Monsoon",
  artist: "Asha",
  genre: "Folk",
  duration_ms: 95_000,
  license_type: "licensed",
  rights_holder: "Saregama",
  license_expires_at: days(12),
  status: "active",
  is_active: true,
  usage_count: 1234,
  created_at: "2026-10-01T10:00:00Z",
}

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

describe("the list row", () => {
  it("shows every column the page promises", () => {
    const columns = soundColumns(vi.fn(), NOW)
    expect(columns.map((c) => c.header)).toEqual(["Title", "Artist", "Genre", "Duration", "Licence", "Status", "Uses", "Created"])
    const html = renderRow(columns, SOUND)
    for (const text of ["Monsoon", "Asha", "Folk", "1:35", "Licensed", "Saregama", "Active", "1,234"]) expect(html).toContain(text)
  })

  it("has no write button in the row — only the title, which opens the detail", () => {
    const onOpen = vi.fn()
    const columns = soundColumns(onOpen, NOW)
    expect(buttons(renderRow(columns, SOUND))).toBe(1)
    const title = columns[0].cell?.(SOUND) as { props: { onClick: () => void } }
    title.props.onClick()
    expect(onOpen).toHaveBeenCalledWith(SOUND)
  })
})

describe("status chip", () => {
  it.each([
    ["draft", "Draft", "text-mo-body"],
    ["active", "Active", "text-mo-good"],
    ["inactive", "Inactive", "text-mo-warn"],
    ["withdrawn", "Withdrawn", "text-mo-bad"],
  ])("%s → %s", (status, label, tone) => {
    const html = renderToStaticMarkup(<SoundStatusChip sound={{ status }} />)
    expect(html).toContain(label)
    expect(html).toContain(tone)
  })
})

describe("licence expiry highlighting", () => {
  const cell = (expires: unknown) => renderToStaticMarkup(<LicenceCell sound={{ ...SOUND, license_expires_at: expires }} now={NOW} />)

  it("marks an expired licence in the bad tone", () => {
    const html = cell(days(-2))
    expect(html).toContain('data-licence="expired"')
    expect(html).toContain("text-mo-bad")
    expect(html).toContain("Licence expired")
  })

  it("marks one ending within 30 days in the warning tone", () => {
    const html = cell(days(12))
    expect(html).toContain('data-licence="soon"')
    expect(html).toContain("text-mo-warn")
    expect(html).toContain("Licence ends in 12 days")
  })

  it("leaves a distant expiry plain, and says nothing without one", () => {
    const html = cell(days(90))
    expect(html).toContain('data-licence="ok"')
    expect(html).not.toContain("text-mo-warn")
    expect(html).not.toContain("text-mo-bad")
    expect(cell(null)).not.toContain("data-licence")
  })
})

describe("write controls", () => {
  const controls = (manage: boolean, sound: Row) =>
    renderToStaticMarkup(<SoundWriteControls manage={manage} sound={sound} busy={false} onEdit={vi.fn()} onToggle={vi.fn()} onWithdraw={vi.fn()} />)

  it("render nothing without media:sounds.manage", () => {
    expect(controls(false, SOUND)).toBe("")
  })

  it("offer Edit, Disable and Withdraw on an active sound", () => {
    const html = controls(true, SOUND)
    expect(buttons(html)).toBe(3)
    expect(html).toContain("Edit details")
    expect(html).toContain("Disable")
    expect(html).toContain("Withdraw")
  })

  it("offer Enable on a draft", () => {
    expect(controls(true, { ...SOUND, status: "draft", is_active: false })).toContain("Enable")
  })

  it("offer only Edit once withdrawn", () => {
    const html = controls(true, { ...SOUND, status: "withdrawn", is_active: false })
    expect(buttons(html)).toBe(1)
    expect(html).not.toContain("Withdraw")
  })

  it("send the toggle's target state", () => {
    const onToggle = vi.fn()
    const tree = SoundWriteControls({ manage: true, sound: { ...SOUND, status: "inactive" }, busy: false, onEdit: vi.fn(), onToggle, onWithdraw: vi.fn() }) as {
      props: { children: { props: { onClick?: () => void; children: unknown } }[] }
    }
    const toggle = tree.props.children[1]
    toggle.props.onClick?.()
    expect(onToggle).toHaveBeenCalledWith(true)
  })
})

describe("withdraw dialog", () => {
  type DialogElement = { props: { onConfirm: (reason: string) => void; canConfirm: boolean; destructive: boolean; confirmLabel: string; maxReasonLength: number } }
  const dialog = (props: Partial<Parameters<typeof WithdrawSoundDialog>[0]>) =>
    WithdrawSoundDialog({ open: true, title: "Monsoon", scope: null, onScopeChange: vi.fn(), busy: false, onWithdraw: vi.fn(), onClose: vi.fn(), ...props }) as unknown as DialogElement

  it("sends the chosen scope with the reason", () => {
    const onWithdraw = vi.fn()
    dialog({ scope: "everywhere", onWithdraw }).props.onConfirm("The label revoked our licence")
    expect(onWithdraw).toHaveBeenCalledWith({ scope: "everywhere", reason: "The label revoked our licence" })

    const stopNew = vi.fn()
    dialog({ scope: "new_uses", onWithdraw: stopNew }).props.onConfirm("Rotating the catalogue")
    expect(stopNew).toHaveBeenCalledWith({ scope: "new_uses", reason: "Rotating the catalogue" })
  })

  it("cannot be confirmed before a scope is chosen, and always needs a reason", () => {
    const onWithdraw = vi.fn()
    const element = dialog({ scope: null, onWithdraw })
    expect(element.props.canConfirm).toBe(false)
    expect(element.props.destructive).toBe(true)
    element.props.onConfirm("Some reason here")
    expect(onWithdraw).not.toHaveBeenCalled()
    expect(element.props.maxReasonLength).toBe(500)
  })

  it("offers both scopes, and warns harder for Remove from all posts", () => {
    const quiet = renderToStaticMarkup(<WithdrawSoundDialog open title="Monsoon" scope="new_uses" onScopeChange={vi.fn()} busy={false} onWithdraw={vi.fn()} onClose={vi.fn()} />)
    expect(quiet).toContain("Stop new uses")
    expect(quiet).toContain("Remove from all posts")
    expect(quiet).not.toContain("withdraw-everywhere-warning")

    const loud = renderToStaticMarkup(<WithdrawSoundDialog open title="Monsoon" scope="everywhere" onScopeChange={vi.fn()} busy={false} onWithdraw={vi.fn()} onClose={vi.fn()} />)
    expect(loud).toContain("withdraw-everywhere-warning")
    expect(loud).toContain("goes silent")
    expect(dialog({ scope: "everywhere" }).props.confirmLabel).toBe("Remove from all posts")
  })
})
