import { describe, expect, it } from "vitest"
import {
  canPublish,
  initialUploadState,
  isActive,
  phaseLabel,
  ringShape,
  uploadReducer,
  type UploadEvent,
  type UploadState,
} from "./machine"

/** Replay a list of events from the initial state. */
function run(...events: UploadEvent[]): UploadState {
  return events.reduce(uploadReducer, initialUploadState)
}

const reserved: UploadEvent = { type: "reserved", mediaId: "m1", chunked: false }

describe("uploadReducer — the happy path", () => {
  it("walks idle → preparing → uploading → processing → ready → posting → published", () => {
    let state = initialUploadState
    expect(state.phase).toBe("idle")

    state = uploadReducer(state, { type: "start" })
    expect(state.phase).toBe("preparing")

    state = uploadReducer(state, reserved)
    expect(state.phase).toBe("uploading")
    expect(state.mediaId).toBe("m1")

    state = uploadReducer(state, { type: "bytes_in" })
    expect(state.phase).toBe("processing")
    expect(state.progress).toBe(1)

    state = uploadReducer(state, {
      type: "status",
      status: { processing_status: "ready", moderation_status: "passed" },
    })
    expect(state.phase).toBe("ready")

    state = uploadReducer(state, { type: "posting" })
    expect(state.phase).toBe("posting")

    state = uploadReducer(state, { type: "published", postId: "p1", scheduled: false })
    expect(state.phase).toBe("published")
    expect(state.postId).toBe("p1")
  })
})

describe("uploadReducer — progress", () => {
  it("is a fraction of the total", () => {
    const state = run({ type: "start" }, reserved, { type: "progress", loaded: 25, total: 100 })
    expect(state.progress).toBeCloseTo(0.25)
  })

  // The chunked path reports per-part, and a retried part replays bytes that
  // were already counted. A bar that snaps backwards reads as a failure.
  it("never runs backwards", () => {
    const state = run(
      { type: "start" },
      reserved,
      { type: "progress", loaded: 80, total: 100 },
      { type: "progress", loaded: 10, total: 100 }
    )
    expect(state.progress).toBeCloseTo(0.8)
  })

  it("clamps above one", () => {
    const state = run({ type: "start" }, reserved, { type: "progress", loaded: 200, total: 100 })
    expect(state.progress).toBe(1)
  })

  it("survives a zero total rather than producing NaN", () => {
    const state = run({ type: "start" }, reserved, { type: "progress", loaded: 0, total: 0 })
    expect(state.progress).toBe(0)
  })

  it("is ignored once the bytes are in", () => {
    const state = run(
      { type: "start" },
      reserved,
      { type: "bytes_in" },
      { type: "progress", loaded: 1, total: 100 }
    )
    expect(state.progress).toBe(1)
    expect(state.phase).toBe("processing")
  })
})

describe("canPublish", () => {
  // The single expression that is the whole of "never let Publish be
  // pressable before ready + passed".
  it("is true in exactly one phase", () => {
    const phases: UploadState["phase"][] = [
      "idle",
      "preparing",
      "uploading",
      "processing",
      "ready",
      "posting",
      "published",
      "failed",
    ]
    const allowed = phases.filter((phase) => canPublish({ ...initialUploadState, phase }))
    expect(allowed).toEqual(["ready"])
  })

  it("is false while the transcode has finished but moderation has not", () => {
    const state = run({ type: "start" }, reserved, { type: "bytes_in" }, {
      type: "status",
      status: { processing_status: "ready", moderation_status: "pending" },
    })
    expect(state.phase).toBe("processing")
    expect(canPublish(state)).toBe(false)
  })

  it("is false when the encode finished and moderation rejected it", () => {
    const state = run({ type: "start" }, reserved, { type: "bytes_in" }, {
      type: "status",
      status: { processing_status: "ready", moderation_status: "rejected" },
    })
    expect(state.phase).toBe("failed")
    expect(canPublish(state)).toBe(false)
  })
})

describe("uploadReducer — the failures the brief named", () => {
  it("marks a moderation rejection as not worth retrying", () => {
    const state = run({ type: "start" }, reserved, { type: "bytes_in" }, {
      type: "status",
      status: { processing_status: "processing", moderation_status: "rejected" },
    })
    expect(state.phase).toBe("failed")
    expect(state.retryable).toBe(false)
    expect(state.error).toMatch(/rejected/i)
  })

  it("marks a failed transcode as not worth retrying", () => {
    const state = run({ type: "start" }, reserved, { type: "bytes_in" }, {
      type: "status",
      status: { processing_status: "failed", moderation_status: "pending" },
    })
    expect(state.phase).toBe("failed")
    expect(state.retryable).toBe(false)
  })

  it("keeps waiting through manual review", () => {
    const state = run({ type: "start" }, reserved, { type: "bytes_in" }, {
      type: "status",
      status: { processing_status: "ready", moderation_status: "manual_review" },
    })
    expect(state.phase).toBe("processing")
  })

  // The expiring signed URL: the transport fails and the studio offers a
  // retry, because a fresh init mints a fresh URL.
  it("carries a retryable transport failure", () => {
    const state = run({ type: "start" }, reserved, {
      type: "failed",
      error: "The upload link expired before the file finished.",
      retryable: true,
    })
    expect(state.phase).toBe("failed")
    expect(state.retryable).toBe(true)
  })
})

describe("uploadReducer — guards", () => {
  // The poll is on a timer and Publish is a click; a status landing after the
  // post has started must not drag the machine back to `ready`.
  it("ignores a status poll that lands after posting began", () => {
    const posting = run({ type: "start" }, reserved, { type: "bytes_in" }, {
      type: "status",
      status: { processing_status: "ready", moderation_status: "passed" },
    }, { type: "posting" })

    const after = uploadReducer(posting, {
      type: "status",
      status: { processing_status: "ready", moderation_status: "passed" },
    })
    expect(after.phase).toBe("posting")
  })

  it("refuses to post from any phase but ready", () => {
    const uploading = run({ type: "start" }, reserved)
    expect(uploadReducer(uploading, { type: "posting" }).phase).toBe("uploading")
  })

  it("refuses to publish from any phase but posting", () => {
    const ready = run({ type: "start" }, reserved, { type: "bytes_in" }, {
      type: "status",
      status: { processing_status: "ready", moderation_status: "passed" },
    })
    expect(uploadReducer(ready, { type: "published", postId: "p", scheduled: false }).phase).toBe(
      "ready"
    )
  })

  // Picking a new file mid-upload is legitimate. A guard here would strand
  // the machine in `uploading` for a transfer that no longer exists.
  it("restarts from any phase", () => {
    const failed = run({ type: "start" }, reserved, {
      type: "failed",
      error: "nope",
      retryable: true,
    })
    const restarted = uploadReducer(failed, { type: "start" })
    expect(restarted.phase).toBe("preparing")
    expect(restarted.error).toBeNull()
    expect(restarted.mediaId).toBeNull()
  })

  it("resets to the initial state", () => {
    const state = run({ type: "start" }, reserved, { type: "bytes_in" }, { type: "reset" })
    expect(state).toEqual(initialUploadState)
  })
})

describe("isActive", () => {
  it("is true for everything still moving and false at both ends", () => {
    const active: UploadState["phase"][] = ["preparing", "uploading", "processing", "posting"]
    const inactive: UploadState["phase"][] = ["idle", "ready", "published", "failed"]
    for (const phase of active) expect(isActive({ ...initialUploadState, phase })).toBe(true)
    for (const phase of inactive) expect(isActive({ ...initialUploadState, phase })).toBe(false)
  })
})

describe("phaseLabel", () => {
  // PublishRing.kt's exact words, so the two clients describe one upload the
  // same way.
  it("uses the phone's words", () => {
    expect(phaseLabel({ ...initialUploadState, phase: "preparing" })).toBe("Preparing")
    expect(phaseLabel({ ...initialUploadState, phase: "processing" })).toBe("Processing")
    expect(phaseLabel({ ...initialUploadState, phase: "posting" })).toBe("Posting")
    expect(phaseLabel({ ...initialUploadState, phase: "published" })).toBe("Posted")
    expect(phaseLabel({ ...initialUploadState, phase: "failed" })).toBe("Couldn't post")
  })

  it("floors the percentage so it never says 100% while bytes are moving", () => {
    expect(phaseLabel({ ...initialUploadState, phase: "uploading", progress: 0.999 })).toBe(
      "Uploading 99%"
    )
    expect(phaseLabel({ ...initialUploadState, phase: "uploading", progress: 0.425 })).toBe(
      "Uploading 42%"
    )
  })

  it("says Scheduled rather than Posted for a scheduled video", () => {
    expect(
      phaseLabel({ ...initialUploadState, phase: "published", scheduled: true })
    ).toBe("Scheduled")
  })
})

describe("ringShape", () => {
  it("is determinate only where a real fraction exists", () => {
    expect(ringShape({ ...initialUploadState, phase: "uploading", progress: 0.5 })).toEqual({
      kind: "determinate",
      fraction: 0.5,
    })
    // The transcode reports no percentage, so the ring must not invent one.
    expect(ringShape({ ...initialUploadState, phase: "processing" })).toEqual({
      kind: "indeterminate",
    })
    expect(ringShape({ ...initialUploadState, phase: "idle" })).toEqual({ kind: "none" })
  })
})
