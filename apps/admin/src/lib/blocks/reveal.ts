/**
 * The document viewer's reveal state.
 *
 * A sensitive document (KYC, selfie, ID) starts blurred. "Reveal" calls the
 * page's `onReveal` — which will hit an audited route once admin-service has
 * one — and only a resolved call unblurs it. A failed or step-up-cancelled
 * reveal stays hidden. Nothing re-hides on its own; changing the document
 * starts over.
 */
export type RevealStatus = "hidden" | "revealing" | "revealed" | "failed"

export interface RevealState {
  status: RevealStatus
  error: string | null
}

export type RevealEvent =
  | { type: "request" }
  | { type: "resolved"; revealed: boolean }
  | { type: "failed"; error: string }
  | { type: "hide" }
  | { type: "reset"; sensitive: boolean }

export const initialReveal = (sensitive: boolean): RevealState => ({
  status: sensitive ? "hidden" : "revealed",
  error: null,
})

export function revealReducer(state: RevealState, event: RevealEvent): RevealState {
  switch (event.type) {
    case "request":
      // Double clicks while a reveal is in flight do not fire a second audit.
      return state.status === "hidden" || state.status === "failed" ? { status: "revealing", error: null } : state
    case "resolved":
      if (state.status !== "revealing") return state
      return event.revealed ? { status: "revealed", error: null } : { status: "hidden", error: null }
    case "failed":
      return state.status === "revealing" ? { status: "failed", error: event.error } : state
    case "hide":
      return { status: "hidden", error: null }
    case "reset":
      return initialReveal(event.sensitive)
  }
}

export const isBlurred = (state: RevealState) => state.status !== "revealed"
