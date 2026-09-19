/**
 * The one request in this zone that goes somewhere other than the gateway.
 *
 * ── XMLHttpRequest, and not fetch, on purpose ─────────────────────────────
 * This is the one request in the whole web client that is allowed to take
 * minutes, and it is the one thing on screen a person is watching. `fetch` has
 * no upload progress at all — `ReadableStream` request bodies are Chrome only,
 * require HTTP/2 and force `duplex: "half"`, which is a great deal of
 * fragility to buy a progress bar XHR has had for fifteen years. So: XHR, and
 * the composer gets a real percentage rather than a spinner that lies.
 *
 * ── No api-client, and no headers beyond one ──────────────────────────────
 * `@atpost/api-client` would attach `X-Requested-With` and `X-CSRF-Token` to a
 * PUT and send cookies with it. Every one of those is wrong here:
 *
 *   · this is NOT the gateway, it is object storage on another origin;
 *   · the preflight allows exactly `content-type` and nothing else, so a
 *     second header fails the preflight — and a failed preflight surfaces in
 *     the browser as an opaque network error with no status to report;
 *   · `withCredentials` would send our session cookies to a third-party host,
 *     which is a credential leak for no benefit: the URL is already signed and
 *     is the whole of the authorisation.
 *
 * The signature covers the HOST only (`X-Amz-SignedHeaders=host`), so
 * Content-Type is not signed. It is still sent, and still matched to what
 * `/v1/media/init` was told, because media-service reads it when it decides
 * what to transcode.
 *
 * This is apps/tube's `putObject`, copied rather than imported. A zone may not
 * import another zone — they deploy independently behind the shell's rewrite
 * table and apps/tube's `@/*` alias does not exist here — and the shared home
 * for it would be a package, which is a bigger move than this change. It is
 * ~50 lines with a test-free surface (an XHR against a third-party origin),
 * and the duplication is flagged rather than hidden: **if a third zone needs
 * it, this and `apps/tube/src/tube/uploadApi.ts` become one @momentum package
 * and neither keeps a copy.**
 */

export interface PutProgress {
  loaded: number
  total: number
}

/** A failure of the PUT itself, carrying the storage host's own status. */
export class UploadTransportError extends Error {
  readonly status: number
  constructor(status: number) {
    super(`Storage refused the upload (${status || "no response"}).`)
    this.name = "UploadTransportError"
    this.status = status
  }
}

export function putObject(
  uploadUrl: string,
  body: Blob,
  contentType: string,
  opts: { onProgress?: (p: PutProgress) => void; signal?: AbortSignal } = {}
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (opts.signal?.aborted) {
      reject(new DOMException("Upload cancelled", "AbortError"))
      return
    }

    const xhr = new XMLHttpRequest()
    xhr.open("PUT", uploadUrl, true)
    xhr.setRequestHeader("Content-Type", contentType)

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) opts.onProgress?.({ loaded: e.loaded, total: e.total })
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve()
        return
      }
      // 403 here is almost always the clock: the signed URL's 15 minutes ran
      // out mid-upload. ./draft.ts says so in those words rather than showing
      // "403", because "403" reads as "you are not allowed to upload" and the
      // person IS allowed to upload — right now, again — which is the whole
      // thing worth telling them.
      reject(new UploadTransportError(xhr.status))
    }

    // A cross-origin failure — a failed preflight, a dropped connection, a
    // laptop lid closing — arrives here with status 0 and no body. There is
    // genuinely nothing to report but "the connection to storage failed", and
    // pretending otherwise would be an invented diagnosis.
    xhr.onerror = () => reject(new UploadTransportError(xhr.status || 0))
    xhr.ontimeout = () => reject(new UploadTransportError(0))
    xhr.onabort = () => reject(new DOMException("Upload cancelled", "AbortError"))

    opts.signal?.addEventListener("abort", () => xhr.abort(), { once: true })
    xhr.send(body)
  })
}
