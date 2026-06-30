// Razorpay hosted-checkout helper. Loads the script once on demand and opens
// the payment dialog. Kept separate from the checkout page so the SDK script
// (~80 KB) only loads when the user actually starts a prepaid payment.
//
// Production note: this hits checkout.razorpay.com directly. If you need
// strict CSP or self-hosted assets, swap to a local copy or an npm package
// (razorpay-checkout) — the API surface below is identical.

const RAZORPAY_SCRIPT_URL = "https://checkout.razorpay.com/v1/checkout.js"

let scriptPromise: Promise<void> | null = null

export interface RazorpayHandlerResponse {
  razorpay_payment_id: string
  razorpay_order_id: string
  razorpay_signature: string
}

export interface RazorpayCheckoutOptions {
  // From NEXT_PUBLIC_RAZORPAY_KEY_ID.
  key: string
  // Razorpay order_id returned by payments-service as `provider_ref`.
  order_id: string
  // Amount is in paise (smallest currency unit). For INR, multiply rupees by 100.
  amount: number
  currency: string
  name?: string
  description?: string
  prefill?: { name?: string; email?: string; contact?: string }
  theme?: { color?: string }
  handler: (resp: RazorpayHandlerResponse) => void
  modal?: { ondismiss?: () => void }
}

interface RazorpayInstance {
  open: () => void
  on?: (event: string, cb: (resp: unknown) => void) => void
}

interface RazorpayCtor {
  new (options: RazorpayCheckoutOptions): RazorpayInstance
}

declare global {
  interface Window {
    Razorpay?: RazorpayCtor
  }
}

function loadRazorpayScript(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Razorpay can only load in the browser"))
  }
  if (window.Razorpay) return Promise.resolve()
  if (scriptPromise) return scriptPromise

  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${RAZORPAY_SCRIPT_URL}"]`,
    )
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true })
      existing.addEventListener("error", () => reject(new Error("Razorpay script failed to load")), { once: true })
      return
    }

    const script = document.createElement("script")
    script.src = RAZORPAY_SCRIPT_URL
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => {
      scriptPromise = null
      reject(new Error("Razorpay script failed to load"))
    }
    document.body.appendChild(script)
  })
  return scriptPromise
}

// openRazorpayCheckout loads the SDK if necessary and opens the hosted
// dialog. Resolves with the Razorpay handler response on success, or rejects
// with `payment_cancelled` if the user closes the modal.
export async function openRazorpayCheckout(
  options: Omit<RazorpayCheckoutOptions, "handler" | "modal">,
): Promise<RazorpayHandlerResponse> {
  await loadRazorpayScript()
  if (!window.Razorpay) {
    throw new Error("Razorpay SDK not available")
  }

  return new Promise<RazorpayHandlerResponse>((resolve, reject) => {
    const rz = new window.Razorpay!({
      ...options,
      handler: (resp) => resolve(resp),
      modal: {
        ondismiss: () => reject(new Error("payment_cancelled")),
      },
    })
    rz.open()
  })
}
