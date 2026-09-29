import { humanise, shortId, str, when } from "../../lib/admin/data"
import { STRIKE_STATE_TONE, severityTone, strikeState, type StrikeTone } from "../../lib/admin/trust"

/**
 * The cells of one strike row. Presentation only, on relative imports, so the
 * row can be rendered in a test without the console's shell.
 *
 * A strike has three states the operator must tell apart at a glance: it
 * counts (active, with when it stops), it no longer counts because time
 * passed (expired), or because an admin voided it (voided, with the reason
 * kept on the row — a void never deletes).
 */

const PILL: Record<StrikeTone, string> = {
  bad: "border-mo-bad/50 text-mo-bad",
  warn: "border-mo-warn/50 text-mo-warn",
  good: "border-mo-good/50 text-mo-good",
  normal: "border-mo-strong text-mo-body",
}

function Pill({ value, tone }: { value: string; tone: StrikeTone }) {
  return <span className={`inline-block rounded-full border px-2 py-0.5 text-xs ${PILL[tone]}`}>{humanise(value)}</span>
}

/** Severe strikes red, strikes amber, warnings plain: the order in which they matter. */
export function StrikeSeverityCell({ severity }: { severity: unknown }) {
  return <Pill value={str(severity) ?? "—"} tone={severityTone(severity)} />
}

/** Active with its expiry, expired with when, or voided with when, by whom and why. */
export function StrikeStateCell({ strike, now }: { strike: Record<string, unknown>; now: number }) {
  const state = strikeState(strike, now)
  return (
    <span className="flex flex-col gap-0.5" data-strike-state={state}>
      <Pill value={state} tone={STRIKE_STATE_TONE[state]} />
      {state === "voided" ? (
        <span className="text-xs text-mo-body">
          Voided {when(strike.voided_at)}
          {str(strike.voided_by) ? (
            <>
              {" "}
              by{" "}
              <span className="font-mo-mono" title={str(strike.voided_by) ?? undefined}>
                {shortId(strike.voided_by)}
              </span>
            </>
          ) : null}
          {str(strike.void_reason) ? <> · “{str(strike.void_reason)}”</> : null}
        </span>
      ) : (
        <span className="text-xs text-mo-body">
          {state === "expired" ? "Expired" : "Expires"} {when(strike.expires_at)}
        </span>
      )}
    </span>
  )
}

/** The case a strike came from and the policy that set its expiry; a hand-issued strike has no case. */
export function StrikeOriginCell({ strike }: { strike: Record<string, unknown> }) {
  const caseId = str(strike.case_id)
  return (
    <span className="flex flex-col gap-0.5 text-xs">
      <span>
        {caseId ? (
          <span className="font-mo-mono" title={caseId}>
            {shortId(caseId)}
          </span>
        ) : (
          "Issued by hand"
        )}
      </span>
      {str(strike.policy_version) ? <span className="text-mo-body">Policy {str(strike.policy_version)}</span> : null}
    </span>
  )
}
