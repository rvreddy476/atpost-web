// The registration wire contract, kept out of the component so both halves of
// it — what we send, and what the server sends back — can be reasoned about and
// tested without mounting a form.

/**
 * The terms revision this build asks people to accept.
 *
 * auth-service compares `terms_version` against its own CurrentTermsVersion by
 * exact string match. Not "at least this new", not "ignored when
 * accepted_terms is true": an exact match, or the registration is refused. So
 * when the platform publishes a new revision, this constant and the sentence
 * beside the checkbox move together, and a mismatch here is a 100% failure
 * rate rather than a subtle one — which is why it is a constant with a comment
 * and not something derived at runtime.
 */
export const TERMS_VERSION = '2026-08-01'

/** Where the checkbox's link points. Opened in a new tab; a half-typed form survives. */
export const TERMS_HREF = '/terms'

/**
 * The age floor this form applies before it will send anything.
 *
 * The backend enforces its own minimum and remains the authority — its
 * complaint arrives on the `dob` field and is shown verbatim. This exists so
 * that someone plainly under age is told in place instead of after a round
 * trip, and so `dob` is never sent blank or half-selected.
 */
export const MINIMUM_AGE = 13

export interface RegisterInput {
  email: string
  password: string
  firstName: string
  lastName: string
  /** `YYYY-MM-DD`, as an <input type="date"> produces it. */
  dob: string
}

export interface RegisterPayload {
  email: string
  password: string
  first_name: string
  last_name: string
  dob: string
  accepted_terms: true
  terms_version: string
  platform: 'web'
}

/**
 * Exactly what `POST /v1/auth/register` requires. `accepted_terms` is typed as
 * the literal `true` because there is no request to make when it is false —
 * the form does not submit, so this function is never asked to encode a
 * refusal.
 */
export function buildRegisterPayload(input: RegisterInput): RegisterPayload {
  return {
    email: input.email.trim(),
    password: input.password,
    first_name: input.firstName.trim(),
    last_name: input.lastName.trim(),
    dob: input.dob,
    accepted_terms: true,
    terms_version: TERMS_VERSION,
    platform: 'web',
  }
}

/** Null when the date is usable, otherwise the sentence to show under the field. */
export function validateDob(value: string, minimumAge = MINIMUM_AGE): string | null {
  if (!value) return 'Enter your date of birth.'
  const [y, m, d] = value.split('-').map((part) => Number.parseInt(part, 10))
  if (!y || !m || !d) return 'Enter a complete date of birth.'
  const dob = new Date(y, m - 1, d)
  if (dob.getFullYear() !== y || dob.getMonth() !== m - 1 || dob.getDate() !== d) {
    return 'That date does not exist.'
  }
  const today = new Date()
  const hadBirthday =
    today >= new Date(today.getFullYear(), dob.getMonth(), dob.getDate())
  const age = today.getFullYear() - y - (hadBirthday ? 0 : 1)
  if (age < 0) return 'That date is in the future.'
  if (age < minimumAge) return `You need to be at least ${minimumAge} to create an account.`
  if (age > 120) return 'Enter a valid date of birth.'
  return null
}

export interface SessionResult {
  accessToken: string
  refreshToken: string
  user: { id: string } & Record<string, unknown>
}

export type RegisterOutcome =
  | {
      kind: 'verify'
      /** The address the server says has to be confirmed. */
      email: string
      /** ISO timestamp, or null when the server did not say. */
      expiresAt: string | null
      /**
       * The token the server handed back in the response body. Only ever shown
       * behind a development-build check — see the auth form.
       */
      token: string | null
    }
  | { kind: 'session'; session: SessionResult }

type Envelope = Record<string, unknown>

/** Responses arrive either bare or wrapped in `{ data: ... }`, depending on route. */
function unwrap(body: unknown): Envelope {
  const outer = (body ?? {}) as Envelope
  const inner = outer.data
  return (inner && typeof inner === 'object' ? inner : outer) as Envelope
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

/**
 * A login or register body that genuinely carries a usable session, or null.
 *
 * "Usable" means both a token and a user id. Neither is stored any more — the
 * session travels as the cookies auth-service set on the very same response —
 * but both are still REQUIRED, because a body missing either came from a
 * server that did not actually authenticate anybody, and calling that a
 * success would redirect someone into a zone that is about to 401 them.
 */
export function readSession(body: unknown): SessionResult | null {
  const data = unwrap(body)
  const tokens = (data.tokens ?? data) as Envelope
  const accessToken = asString(tokens.access_token) ?? asString(tokens.accessToken)
  const user = data.user as ({ id?: unknown } & Record<string, unknown>) | undefined
  if (!accessToken || typeof user?.id !== 'string' || user.id === '') return null
  const refreshToken = asString(tokens.refresh_token) ?? asString(tokens.refreshToken) ?? ''
  return { accessToken, refreshToken, user: user as SessionResult['user'] }
}

/**
 * What actually happened on a successful `POST /v1/auth/register`.
 *
 * The important case is the ordinary one: the server answers 201 and
 * deliberately withholds tokens, because an address nobody has confirmed is
 * not yet an identity anyone should be able to act as. That is a success, and
 * the only honest thing to render is "now go confirm it".
 *
 * The token-bearing branch exists for the day the backend decides some
 * registrations (an invited admin, say) arrive pre-verified and says so with
 * `requires_verification: false`. It is never inferred: no flag plus no tokens
 * is still the verification path, and a session is only ever built out of
 * credentials the server actually sent. Nothing here fabricates one.
 */
export function readRegisterOutcome(body: unknown, fallbackEmail: string): RegisterOutcome | null {
  const data = unwrap(body)
  const requiresVerification = data.requires_verification
  const user = data.user as ({ email?: unknown } & Record<string, unknown>) | undefined

  if (requiresVerification !== true) {
    const session = readSession(body)
    if (session) return { kind: 'session', session }
  }

  if (requiresVerification === true || user) {
    return {
      kind: 'verify',
      email: asString(user?.email) ?? fallbackEmail,
      expiresAt: asString(data.verification_expires_at),
      token: asString(data.verification_token),
    }
  }

  return null
}
