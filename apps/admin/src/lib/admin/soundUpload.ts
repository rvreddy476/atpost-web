import { isRecord, str, unwrap } from "./data"

/**
 * Getting an audio file into the sound library's storage, in two steps the
 * console drives itself:
 *
 *   1. POST /v1/admin/sounds/library/uploads {filename, content_type, size_bytes}
 *      → a presigned PUT (upload_url, headers, storage_key), valid 15 minutes
 *   2. PUT the file to upload_url with exactly those headers, straight to
 *      storage (not through admin-service), with progress and a Cancel
 *
 * The storage_key then goes into the create call with the details form. The
 * file is checked here first — type and size — so an admin learns at once
 * that a 40 MB FLAC will not do, without a round trip. The server checks the
 * same things again, and measures the duration (5 minutes at most).
 */

export const MAX_SOUND_BYTES = 20 * 1024 * 1024

/** The content types the uploads route accepts. */
export const SOUND_CONTENT_TYPES = ["audio/mpeg", "audio/mp4", "audio/aac", "audio/x-m4a", "audio/wav", "audio/ogg"] as const
export type SoundContentType = (typeof SOUND_CONTENT_TYPES)[number]

/** What a file input should offer. */
export const SOUND_ACCEPT = [...SOUND_CONTENT_TYPES, ".mp3", ".m4a", ".aac", ".wav", ".ogg", ".oga"].join(",")

/** Browsers report some audio under other names, or none at all (Windows often leaves .m4a blank). */
const TYPE_ALIASES: Record<string, SoundContentType> = {
  "audio/mp3": "audio/mpeg",
  "audio/mpeg3": "audio/mpeg",
  "audio/x-mpeg": "audio/mpeg",
  "audio/m4a": "audio/x-m4a",
  "audio/x-aac": "audio/aac",
  "audio/x-wav": "audio/wav",
  "audio/wave": "audio/wav",
  "audio/vnd.wave": "audio/wav",
}

const BY_EXTENSION: Record<string, SoundContentType> = {
  mp3: "audio/mpeg",
  m4a: "audio/x-m4a",
  aac: "audio/aac",
  wav: "audio/wav",
  ogg: "audio/ogg",
  oga: "audio/ogg",
}

export interface FileLike {
  name: string
  type: string
  size: number
}

/** The accepted content type for a file, from its reported type or, failing that, its extension; null when it is not one. */
export function soundContentType(file: FileLike): SoundContentType | null {
  const reported = file.type.trim().toLowerCase().split(";")[0]
  if ((SOUND_CONTENT_TYPES as readonly string[]).includes(reported)) return reported as SoundContentType
  if (TYPE_ALIASES[reported]) return TYPE_ALIASES[reported]
  // Only a missing or generic type falls back to the extension: a file the browser calls video/mp4 is not audio.
  if (reported && reported !== "application/octet-stream") return null
  const ext = file.name.toLowerCase().split(".").pop() ?? ""
  return BY_EXTENSION[ext] ?? null
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} bytes`
}

export type FileCheck = { ok: true; contentType: SoundContentType } | { ok: false; message: string }

export function checkSoundFile(file: FileLike): FileCheck {
  const contentType = soundContentType(file)
  if (!contentType) {
    return { ok: false, message: `“${file.name}” is not a supported audio file. Choose an MP3, M4A/AAC, WAV or OGG file.` }
  }
  if (file.size <= 0) return { ok: false, message: `“${file.name}” is empty.` }
  if (file.size > MAX_SOUND_BYTES) {
    return { ok: false, message: `“${file.name}” is ${formatBytes(file.size)}. Sounds can be at most 20 MB.` }
  }
  return { ok: true, contentType }
}

export interface PresignedUpload {
  uploadUrl: string
  method: "PUT"
  headers: Record<string, string>
  storageKey: string
  expiresAt: string | null
}

/** The uploads answer, or null when it lacks what the PUT needs. */
export function readPresignedUpload(raw: unknown): PresignedUpload | null {
  const body = unwrap(raw)
  if (!isRecord(body)) return null
  const uploadUrl = str(body.upload_url)
  const storageKey = str(body.storage_key)
  if (!uploadUrl || !storageKey) return null
  const method = str(body.method)?.toUpperCase() ?? "PUT"
  if (method !== "PUT") return null
  const headers: Record<string, string> = {}
  if (isRecord(body.headers)) {
    for (const [name, value] of Object.entries(body.headers)) {
      if (typeof value === "string") headers[name] = value
      else if (Array.isArray(value) && typeof value[0] === "string") headers[name] = value[0]
    }
  }
  return { uploadUrl, method: "PUT", headers, storageKey, expiresAt: str(body.expires_at) }
}

export class SoundUploadError extends Error {
  constructor(
    readonly kind: "invalid" | "cancelled" | "presign" | "put",
    message: string,
    readonly cause?: unknown,
  ) {
    super(message)
    this.name = "SoundUploadError"
  }
}

export interface UploadDeps {
  /** POST …/uploads (with the console's step-up handling); resolves the raw answer, or null when the admin dismissed a 2FA prompt. */
  presign: (body: { filename: string; content_type: SoundContentType; size_bytes: number }) => Promise<unknown | null>
  /** PUT the file to the presigned URL; rejects with an AbortError when `signal` aborts. */
  put: (target: PresignedUpload, file: Blob, options: { signal: AbortSignal; onProgress: (fraction: number) => void }) => Promise<void>
}

const isAbort = (err: unknown) => isRecord(err) && (err as { name?: unknown }).name === "AbortError"

/**
 * Step 1 and 2. Resolves the storage key; rejects with a SoundUploadError
 * saying which step failed. Nothing is requested for a file that fails the
 * local check, and nothing is PUT once `signal` has aborted.
 */
export async function uploadSoundFile(
  file: Blob & FileLike,
  deps: UploadDeps,
  { signal, onProgress = () => undefined }: { signal: AbortSignal; onProgress?: (fraction: number) => void },
): Promise<PresignedUpload> {
  const check = checkSoundFile(file)
  if (!check.ok) throw new SoundUploadError("invalid", check.message)
  if (signal.aborted) throw new SoundUploadError("cancelled", "Upload cancelled.")

  let raw: unknown | null
  try {
    raw = await deps.presign({ filename: file.name, content_type: check.contentType, size_bytes: file.size })
  } catch (err) {
    throw new SoundUploadError("presign", "The upload could not be started.", err)
  }
  if (raw === null) throw new SoundUploadError("cancelled", "The upload needs a fresh 2FA code.")
  const target = readPresignedUpload(raw)
  if (!target) throw new SoundUploadError("presign", "The server's upload answer could not be read.")
  if (signal.aborted) throw new SoundUploadError("cancelled", "Upload cancelled.")

  // The PUT's Content-Type must match the type the URL was signed for.
  const headers = { ...target.headers }
  if (!Object.keys(headers).some((h) => h.toLowerCase() === "content-type")) headers["Content-Type"] = check.contentType
  try {
    await deps.put({ ...target, headers }, file, { signal, onProgress })
  } catch (err) {
    if (signal.aborted || isAbort(err)) throw new SoundUploadError("cancelled", "Upload cancelled.")
    throw new SoundUploadError("put", "The file could not be sent to storage. Check your connection and try again.", err)
  }
  onProgress(1)
  return { ...target, headers }
}

/**
 * The browser's PUT, on XMLHttpRequest for its upload progress events. It
 * goes straight to storage: no cookies, no CSRF header, nothing but the
 * presigned headers.
 */
export function xhrPut(target: PresignedUpload, file: Blob, { signal, onProgress }: { signal: AbortSignal; onProgress: (fraction: number) => void }): Promise<void> {
  return new Promise((resolve, reject) => {
    const abortError = () => Object.assign(new Error("Upload cancelled."), { name: "AbortError" })
    if (signal.aborted) {
      reject(abortError())
      return
    }
    const xhr = new XMLHttpRequest()
    xhr.open(target.method, target.uploadUrl)
    xhr.withCredentials = false
    for (const [name, value] of Object.entries(target.headers)) xhr.setRequestHeader(name, value)
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress(Math.min(1, event.loaded / event.total))
    }
    const onAbort = () => xhr.abort()
    signal.addEventListener("abort", onAbort, { once: true })
    const done = () => signal.removeEventListener("abort", onAbort)
    xhr.onload = () => {
      done()
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      else reject(Object.assign(new Error(`Storage answered ${xhr.status}.`), { status: xhr.status }))
    }
    xhr.onerror = () => {
      done()
      reject(new Error("The upload failed."))
    }
    xhr.onabort = () => {
      done()
      reject(abortError())
    }
    xhr.send(file)
  })
}
