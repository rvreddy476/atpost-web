import { describe, expect, it, vi } from "vitest"
import { SOUNDS, checkSoundForm, soundRequest, EMPTY_SOUND_FORM } from "./sounds"
import {
  MAX_SOUND_BYTES,
  SoundUploadError,
  checkSoundFile,
  readPresignedUpload,
  soundContentType,
  uploadSoundFile,
  type PresignedUpload,
  type UploadDeps,
} from "./soundUpload"

/** A File-shaped Blob without needing the DOM's File constructor. */
function file(name: string, type: string, size: number): Blob & { name: string; size: number; type: string } {
  const blob = new Blob([])
  Object.defineProperties(blob, { name: { value: name }, type: { value: type }, size: { value: size } })
  return blob as Blob & { name: string; size: number; type: string }
}

const PRESIGNED = {
  data: {
    upload_url: "https://media.cleestudio.com/audio-library/abc.mp3?X-Amz-Signature=sig",
    method: "PUT",
    headers: { "Content-Type": "audio/mpeg" },
    storage_key: "audio-library/abc.mp3",
    expires_at: "2026-10-16T12:15:00Z",
  },
}

/** A fake console: records every request in order, as the browser would send them. */
function rig({ presignAnswer = PRESIGNED as unknown, putImpl }: { presignAnswer?: unknown; putImpl?: UploadDeps["put"] } = {}) {
  const calls: { step: string; url: string; body?: unknown; headers?: Record<string, string> }[] = []
  const deps: UploadDeps = {
    presign: vi.fn(async (body) => {
      calls.push({ step: "presign", url: `${SOUNDS}/uploads`, body })
      return presignAnswer
    }),
    put: vi.fn(
      putImpl ??
        (async (target: PresignedUpload, _blob: Blob, { onProgress }: { onProgress: (f: number) => void }) => {
          calls.push({ step: "put", url: target.uploadUrl, headers: target.headers })
          onProgress(0.5)
        }),
    ),
  }
  return { calls, deps }
}

describe("file checks before anything is sent", () => {
  it("accepts the six audio types, and common aliases or a bare extension", () => {
    expect(soundContentType(file("a.mp3", "audio/mpeg", 1))).toBe("audio/mpeg")
    expect(soundContentType(file("a.mp3", "audio/mp3", 1))).toBe("audio/mpeg")
    expect(soundContentType(file("a.wav", "audio/x-wav", 1))).toBe("audio/wav")
    expect(soundContentType(file("a.m4a", "", 1))).toBe("audio/x-m4a")
    expect(soundContentType(file("a.ogg", "application/octet-stream", 1))).toBe("audio/ogg")
  })

  it("refuses other types, even with an audio-looking extension", () => {
    expect(checkSoundFile(file("a.flac", "audio/flac", 10))).toEqual({ ok: false, message: expect.stringMatching(/not a supported audio file/) })
    expect(checkSoundFile(file("clip.mp3", "video/mp4", 10)).ok).toBe(false)
    expect(checkSoundFile(file("notes.pdf", "application/pdf", 10)).ok).toBe(false)
  })

  it("refuses a file over 20 MB, and an empty one", () => {
    expect(checkSoundFile(file("big.mp3", "audio/mpeg", MAX_SOUND_BYTES))).toEqual({ ok: true, contentType: "audio/mpeg" })
    const big = checkSoundFile(file("big.mp3", "audio/mpeg", MAX_SOUND_BYTES + 1))
    expect(big).toEqual({ ok: false, message: expect.stringMatching(/20\.0 MB.*at most 20 MB/) })
    expect(checkSoundFile(file("none.mp3", "audio/mpeg", 0)).ok).toBe(false)
  })
})

describe("upload flow", () => {
  it("presigns, PUTs with the returned headers, then creates with the storage key — in that order", async () => {
    const { calls, deps } = rig()
    const progress: number[] = []
    const upload = await uploadSoundFile(file("Monsoon.mp3", "audio/mpeg", 3_000_000), deps, {
      signal: new AbortController().signal,
      onProgress: (f) => progress.push(f),
    })
    const form = checkSoundForm({ ...EMPTY_SOUND_FORM, title: "Monsoon", artist: "Asha", genre: "Folk", license_type: "original", rights_holder: "Asha" })
    const create = soundRequest({ kind: "create", storageKey: upload.storageKey, fields: form.fields })
    calls.push({ step: "create", url: create.url, body: create.body })

    expect(calls.map((c) => c.step)).toEqual(["presign", "put", "create"])
    expect(calls[0].body).toEqual({ filename: "Monsoon.mp3", content_type: "audio/mpeg", size_bytes: 3_000_000 })
    expect(calls[1]).toEqual({ step: "put", url: PRESIGNED.data.upload_url, headers: { "Content-Type": "audio/mpeg" } })
    expect(create.method).toBe("post")
    expect(calls[2]).toEqual({
      step: "create",
      url: SOUNDS,
      body: { storage_key: "audio-library/abc.mp3", title: "Monsoon", artist: "Asha", genre: "Folk", license_type: "original", rights_holder: "Asha" },
    })
    expect(progress).toEqual([0.5, 1])
  })

  it("adds the Content-Type the URL was signed for when the server sends no headers", async () => {
    const { calls, deps } = rig({ presignAnswer: { data: { ...PRESIGNED.data, headers: {} } } })
    await uploadSoundFile(file("a.m4a", "", 10), deps, { signal: new AbortController().signal })
    expect(calls[1].headers).toEqual({ "Content-Type": "audio/x-m4a" })
  })

  it("sends nothing for a file that is too large or not audio", async () => {
    for (const bad of [file("big.mp3", "audio/mpeg", MAX_SOUND_BYTES + 1), file("x.txt", "text/plain", 10)]) {
      const { calls, deps } = rig()
      await expect(uploadSoundFile(bad, deps, { signal: new AbortController().signal })).rejects.toMatchObject({ kind: "invalid" })
      expect(calls).toEqual([])
    }
  })

  it("cancel during the PUT stops the flow: no create, and it reads as cancelled", async () => {
    const abort = new AbortController()
    const { calls, deps } = rig({
      putImpl: (target, _blob, { signal }) =>
        new Promise((_resolve, reject) => {
          calls.push({ step: "put", url: target.uploadUrl })
          signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })))
        }),
    })
    const pending = uploadSoundFile(file("a.mp3", "audio/mpeg", 10), deps, { signal: abort.signal })
    await vi.waitFor(() => expect(calls.map((c) => c.step)).toEqual(["presign", "put"]))
    abort.abort()
    await expect(pending).rejects.toMatchObject({ kind: "cancelled" })
    expect(calls.map((c) => c.step)).toEqual(["presign", "put"])
  })

  it("cancel before the PUT starts never sends the file", async () => {
    const abort = new AbortController()
    const { calls, deps } = rig()
    deps.presign = vi.fn(async (body) => {
      calls.push({ step: "presign", url: "", body })
      abort.abort()
      return PRESIGNED
    })
    await expect(uploadSoundFile(file("a.mp3", "audio/mpeg", 10), deps, { signal: abort.signal })).rejects.toMatchObject({ kind: "cancelled" })
    expect(calls.map((c) => c.step)).toEqual(["presign"])
  })

  it("a dismissed 2FA prompt cancels without a PUT", async () => {
    const { calls, deps } = rig({ presignAnswer: null })
    const err = await uploadSoundFile(file("a.mp3", "audio/mpeg", 10), deps, { signal: new AbortController().signal }).catch((e) => e)
    expect(err).toBeInstanceOf(SoundUploadError)
    expect(err.kind).toBe("cancelled")
    expect(calls.map((c) => c.step)).toEqual(["presign"])
  })

  it("keeps the presign error for the message, and reports a failed PUT as such", async () => {
    const refusal = { response: { status: 403, data: { error: { code: "PERMISSION_DENIED" } } } }
    const failing = rig()
    failing.deps.presign = vi.fn(async () => {
      throw refusal
    })
    const err = await uploadSoundFile(file("a.mp3", "audio/mpeg", 10), failing.deps, { signal: new AbortController().signal }).catch((e) => e)
    expect(err).toMatchObject({ kind: "presign", cause: refusal })

    const putFails = rig({ putImpl: async () => Promise.reject(new Error("network")) })
    await expect(uploadSoundFile(file("a.mp3", "audio/mpeg", 10), putFails.deps, { signal: new AbortController().signal })).rejects.toMatchObject({ kind: "put" })
  })
})

describe("readPresignedUpload", () => {
  it("needs an upload URL and a storage key, and only PUT", () => {
    expect(readPresignedUpload(PRESIGNED)).toEqual({
      uploadUrl: PRESIGNED.data.upload_url,
      method: "PUT",
      headers: { "Content-Type": "audio/mpeg" },
      storageKey: "audio-library/abc.mp3",
      expiresAt: "2026-10-16T12:15:00Z",
    })
    expect(readPresignedUpload({ data: { upload_url: "https://x", storage_key: "" } })).toBeNull()
    expect(readPresignedUpload({ data: { ...PRESIGNED.data, method: "POST" } })).toBeNull()
    expect(readPresignedUpload({ data: { ...PRESIGNED.data, headers: { "x-amz-acl": ["private"] } } })?.headers).toEqual({ "x-amz-acl": "private" })
  })
})
