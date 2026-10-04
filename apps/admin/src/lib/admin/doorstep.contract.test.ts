import { describe, expect, it } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import { resolve } from "node:path"

const contractDir = resolve(process.cwd(), "src/lib/admin/contracts/doorstep")
const backendDir = resolve(process.cwd(), "../../../modernsmapp/Architecture/services/doorstep-service/internal/http/testdata/contracts")
const fixture = (name: string) => JSON.parse(readFileSync(resolve(contractDir, name + ".json"), "utf8"))

describe("Doorstep handler golden bytes", () => {
  it("every published admin contract is copied byte-identical", () => {
    const names = readdirSync(backendDir).filter(name => name.startsWith("admin_") && name.endsWith(".json"))
    expect(names.length).toBeGreaterThan(20)
    for (const name of names) expect(readFileSync(resolve(contractDir,name)).equals(readFileSync(resolve(backendDir,name)))).toBe(true)
  })
  it("renders the real safety, support, ratings and compute-only settlements", () => {
    for (const name of ["admin_incidents_get_200", "admin_tickets_get_200", "admin_ratings_get_200", "admin_settlements_get_200"]) expect(readList(fixture(name)).length).toBe(1)
    expect(fixture("admin_tickets_get_200").data.items[0].body).toBeTruthy()
    expect(fixture("admin_settlements_get_200").data.items[0].status).toBe("computed")
  })
})
import { readList, readObject, type Row } from "./data"
import {
  DOORSTEP,
  DOORSTEP_WRITES,
  attentionMessage,
  cancelBody,
  checkCancelFee,
  doorstepRequest,
  readAdminBooking,
  refundCauseLabel,
  refundRoom,
} from "./doorstep"
import { prepareSend, IDEMPOTENCY_HEADER, type Transport } from "./mutation"
import { STATS_METRICS, statsView } from "./stats"

/**
 * The console reads JSON fixtures copied byte-identical from the
 * doorstep-service handler tests
 * (Architecture/services/doorstep-service/internal/http/testdata/contracts,
 * commit 9def49e5): admin_booking_get_200.json, admin_booking_cancel_200.json,
 * admin_booking_refund_201.json, admin_bookings_list_200.json and
 * admin_stats_200.json. If the backend's bytes change, copy them again.
 */

interface Envelope<T> {
  data: T
  meta: { request_id: string }
}

/** The fields of contracts/doorstep AdminBookingDetail this console reads. */
interface AdminBookingDetail {
  booking: Row & { id: string; status: string; start_otp: null; end_otp: null; paid_paise: number; refunded_paise: number }
  customer_user_id: string
  reserved_pro_id: string | null
  needs_attention: boolean
  attention_reason: string | null
  history: Row[]
  assignments: Row[]
  payments: Row[]
  refunds: Row[]
  extras: Row[]
  photos: Row[]
}

interface AdminStats {
  bookings_today: number
  bookings_in_progress: number
  unassigned_within_2h: number
  bookings_needing_attention: number
  pros_approved: number
  pros_pending_verification: number
  documents_pending: number
  incidents_open: number
  gmv_today_paise: number
  refunds_today_paise: number
  outstanding_paise: number
}

interface Refund {
  id: string
  payment_id: string
  cause: string
  amount_paise: number
  status: string
  created_at: string
}

// admin_booking_get_200.json
const ADMIN_BOOKING_GET_200: Envelope<AdminBookingDetail> = fixture("admin_booking_get_200")

// admin_booking_cancel_200.json (the admin view of the Booking: OTPs null)
const ADMIN_BOOKING_CANCEL_200: Envelope<Row & { status: string; start_otp: null; end_otp: null }> = fixture("admin_booking_cancel_200")

// admin_booking_refund_201.json
const ADMIN_BOOKING_REFUND_201: Envelope<Refund> = fixture("admin_booking_refund_201")

// admin_bookings_list_200.json (BookingSummary rows)
const ADMIN_BOOKINGS_LIST_200: Envelope<{ items: Row[]; next_cursor: string | null }> = fixture("admin_bookings_list_200")

// admin_stats_200.json
const ADMIN_STATS_200: Envelope<AdminStats> = fixture("admin_stats_200")

const BOOKING_ID = ADMIN_BOOKING_GET_200.data.booking.id

/** The golden detail with fields overridden, as the console receives it (enveloped). */
const detailWith = (patch: Partial<AdminBookingDetail>) => readObject({ ...ADMIN_BOOKING_GET_200, data: { ...ADMIN_BOOKING_GET_200.data, ...patch } })

describe("AdminBookingDetail (admin_booking_get_200.json)", () => {
  it("reads the reserved professional, the attention flag and the customer", () => {
    const view = readAdminBooking(readObject(ADMIN_BOOKING_GET_200))
    expect(view).toMatchObject({
      customerUserId: "2d598287-eee7-40b4-a7f5-b46b9412e4e7",
      reservedProId: "3005a641-3fd5-5fdb-825a-e3c1c0f92c42",
      needsAttention: false,
      attentionReason: null,
    })
    expect(view?.booking.id).toBe(BOOKING_ID)
    expect(attentionMessage(view!)).toBeNull()
  })

  it("no reserved professional reads as null, not an empty id", () => {
    expect(readAdminBooking(detailWith({ reserved_pro_id: null }))?.reservedProId).toBeNull()
  })

  it("a flagged booking shows its reason; a flag without a reason still shows, never silently", () => {
    const reason = "captured amount 224700 does not match the booking total 224800"
    const flagged = readAdminBooking(detailWith({ needs_attention: true, attention_reason: reason }))!
    expect(flagged.needsAttention).toBe(true)
    expect(attentionMessage(flagged)).toBe(reason)
    const bare = readAdminBooking(detailWith({ needs_attention: true, attention_reason: null }))!
    expect(attentionMessage(bare)).toMatch(/without a recorded reason/)
    // Only a real `true` flags: a string or a missing key does not.
    expect(readAdminBooking(readObject({ data: { booking: {}, needs_attention: "true" } }))?.needsAttention).toBe(false)
  })

  it("admin booking views never hold an OTP value: the golden bytes carry null, and the console drops the keys anyway", () => {
    expect(ADMIN_BOOKING_GET_200.data.booking.start_otp).toBeNull()
    expect(ADMIN_BOOKING_GET_200.data.booking.end_otp).toBeNull()
    expect(ADMIN_BOOKING_CANCEL_200.data.start_otp).toBeNull()
    expect(ADMIN_BOOKING_CANCEL_200.data.end_otp).toBeNull()
    const leaked = readObject({ data: { ...ADMIN_BOOKING_GET_200.data, booking: { ...ADMIN_BOOKING_GET_200.data.booking, start_otp: "4821", end_otp: "9034" } } })
    const view = readAdminBooking(leaked)!
    expect(view.booking).not.toHaveProperty("start_otp")
    expect(view.booking).not.toHaveProperty("end_otp")
    expect(JSON.stringify(view)).not.toMatch(/4821|9034/)
  })

  it("an unreadable detail is null, not a half-drawn booking", () => {
    expect(readAdminBooking(null)).toBeNull()
    expect(readAdminBooking(readObject({ data: { booking: null } }))).toBeNull()
  })

  it("the cancel and refund room comes from the golden payments: all ₹2,248 captured, nothing refunded", () => {
    expect(refundRoom(readObject(ADMIN_BOOKING_GET_200), "booking")).toBe(224800)
    expect(refundRoom(readObject(ADMIN_BOOKING_GET_200), "extras")).toBe(0)
  })
})

describe("bookings list (admin_bookings_list_200.json)", () => {
  it("rows carry no needs-attention flag, so the console offers no filter for it", () => {
    const rows = readList(ADMIN_BOOKINGS_LIST_200)
    expect(rows).toHaveLength(1)
    expect(Object.keys(rows[0]).sort()).toEqual(["category_slug", "created_at", "id", "service_name", "slot_end", "slot_start", "status", "total_paise"])
  })
})

describe("ops cancel: optional fee (AdminCancelInput)", () => {
  const room = 224800

  it("blank sends no fee (a full refund); the reason is always sent", () => {
    expect(checkCancelFee("", room)).toEqual({ ok: true, feePaise: null })
    expect(checkCancelFee("   ", room)).toEqual({ ok: true, feePaise: null })
    expect(cancelBody("Customer moved out of the city", null)).toEqual({ reason: "Customer moved out of the city" })
  })

  it("a fee is rupees typed, sent as integer paise, zero allowed", () => {
    expect(checkCancelFee("0", room)).toEqual({ ok: true, feePaise: 0 })
    expect(checkCancelFee("₹149.50", room)).toEqual({ ok: true, feePaise: 14950 })
    expect(cancelBody("Late cancellation by phone", 14950)).toEqual({ reason: "Late cancellation by phone", fee_paise: 14950 })
  })

  it("a fee may not exceed captured minus refunded, and must be a well-formed amount", () => {
    expect(checkCancelFee("2248", room)).toEqual({ ok: true, feePaise: 224800 })
    expect(checkCancelFee("2248.01", room)).toEqual({ ok: false, problem: "At most ₹2,248.00 (captured and not refunded) can be kept." })
    expect(checkCancelFee("50", 0)).toEqual({ ok: false, problem: "Nothing captured is left to keep as a fee." })
    expect(checkCancelFee("0", 0)).toEqual({ ok: true, feePaise: 0 })
    expect(checkCancelFee("-5", room)).toMatchObject({ ok: false })
    expect(checkCancelFee("12.345", room)).toMatchObject({ ok: false })
    expect(checkCancelFee("abc", room)).toMatchObject({ ok: false })
  })

  it("the cancel still requires a reason and a fresh 2FA code, and says a fee may be kept", () => {
    const def = DOORSTEP_WRITES["booking.cancel"]
    expect(def).toMatchObject({ reason: true, stepUp: true, method: "post" })
    expect(def.explain).toMatch(/unless you keep a fee/)
    expect(doorstepRequest("booking.cancel", { id: BOOKING_ID }, cancelBody("Customer moved out of the city", 5000))).toEqual({
      method: "post",
      url: `${DOORSTEP}/bookings/${BOOKING_ID}/cancel`,
      body: { reason: "Customer moved out of the city", fee_paise: 5000 },
      idempotent: true,
    })
  })
})

describe("admin refund (admin_booking_refund_201.json)", () => {
  it("is sent with an Idempotency-Key, the same key on the step-up retry, so a replay answers the same row", async () => {
    const seen: string[] = []
    const transport: Transport = async (req) => {
      seen.push(req.headers[IDEMPOTENCY_HEADER])
      return { status: 201, data: ADMIN_BOOKING_REFUND_201 }
    }
    const request = doorstepRequest("booking.refund", { id: BOOKING_ID }, { amount_paise: 10000, reason: "Partial service only", payment: "booking" })
    expect(DOORSTEP_WRITES["booking.refund"].idempotencyRequired).toBe(true)
    const { send, idempotencyKey } = prepareSend(request, transport, () => "key-1")
    const first = await send()
    const replay = await send()
    expect(idempotencyKey).toBe("key-1")
    expect(seen).toEqual(["key-1", "key-1"])
    expect(readObject(replay.data)).toEqual(readObject(first.data))
  })

  it("the refund row's admin cause reads as an ops refund", () => {
    expect(refundCauseLabel(ADMIN_BOOKING_REFUND_201.data.cause)).toBe("Ops refund")
    expect(refundCauseLabel("admin_cancel")).toBe("Ops cancellation")
    expect(refundCauseLabel("customer_cancel")).toBe("Customer cancel")
  })
})

describe("AdminStats (admin_stats_200.json)", () => {
  it("every contract key is a tile, including bookings needing attention, and nothing else", () => {
    const keys = STATS_METRICS.doorstep.map((m) => m.key).sort()
    expect(keys).toEqual(Object.keys(ADMIN_STATS_200.data).sort())
  })

  it("needs-attention reads from the golden bytes, alerts when above zero, and makes the overview's top four", () => {
    const view = statsView("doorstep", { status: "ok", raw: ADMIN_STATS_200 })
    expect(view.tiles.find((t) => t.key === "bookings_needing_attention")).toMatchObject({ label: "Bookings needing attention", display: "0", tone: "normal" })
    const flagged = statsView("doorstep", { status: "ok", raw: { data: { ...ADMIN_STATS_200.data, bookings_needing_attention: 3 } } })
    expect(flagged.tiles.find((t) => t.key === "bookings_needing_attention")).toMatchObject({ display: "3", tone: "bad" })
    expect(statsView("doorstep", { status: "ok", raw: ADMIN_STATS_200 }, 4).tiles.map((t) => t.key)).toContain("bookings_needing_attention")
  })
})
