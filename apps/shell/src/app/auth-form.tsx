'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import api, { markSignedIn } from '@atpost/api-client'
import { moduleHome, moduleLabel, requestedModule } from '@/lib/moduleRedirect'
import { fieldError, readAuthFailure, type AuthFailure } from '@/lib/authErrors'
import {
  MINIMUM_AGE,
  TERMS_HREF,
  TERMS_VERSION,
  buildRegisterPayload,
  readRegisterOutcome,
  readSession,
  validateDob,
} from '@/lib/registration'

const BRAND = 'Momentum'

interface Verification {
  email: string
  expiresAt: string | null
  token: string | null
}

function expiryWording(expiresAt: string | null): string | null {
  if (!expiresAt) return null
  const when = new Date(expiresAt)
  if (Number.isNaN(when.getTime())) return null
  return when.toLocaleString()
}

/**
 * The platform's only sign-in and sign-up surface. Every zone's /login and
 * /register is a stub that redirects here, so this one component is what an
 * admin, a shopper and a creator all see — which is why it is zone-aware
 * rather than forked. A fork would drift within a sprint.
 */
export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const params = useSearchParams()
  const requested = params.get('redirect')
  const destination = moduleHome(requested)
  const zone = requestedModule(requested)
  const zoneLabel = moduleLabel(requested)

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [dob, setDob] = useState('')
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [failure, setFailure] = useState<AuthFailure | null>(null)
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({})
  const [verification, setVerification] = useState<Verification | null>(null)
  const [loading, setLoading] = useState(false)

  const isRegister = mode === 'register'

  /** Server complaint first — it saw the real rules — then our own pre-flight one. */
  function errorFor(...names: string[]): string | undefined {
    return fieldError(failure, ...names) ?? names.map((n) => localErrors[n]).find(Boolean)
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setFailure(null)
    setLocalErrors({})

    if (isRegister) {
      const problems: Record<string, string> = {}
      const dobProblem = validateDob(dob)
      if (dobProblem) problems.dob = dobProblem
      if (!acceptedTerms) {
        problems.accepted_terms = `Please accept the terms to create a ${BRAND} account.`
      }
      if (Object.keys(problems).length > 0) {
        setLocalErrors(problems)
        return
      }
    }

    setLoading(true)
    try {
      if (isRegister) {
        const payload = buildRegisterPayload({
          email: identifier,
          password,
          firstName,
          lastName,
          dob,
        })
        const response = await api.post('/v1/auth/register', payload)
        const outcome = readRegisterOutcome(response.data, payload.email)

        // The ordinary answer carries no tokens on purpose: an unconfirmed
        // address is not an identity anyone should be able to act as yet. That
        // is a success, and the success state is "go and confirm it" — not a
        // session invented on the client, and not an error dressed up as one,
        // which is what this form used to do.
        if (outcome?.kind === 'verify') {
          setVerification({
            email: outcome.email,
            expiresAt: outcome.expiresAt,
            token: outcome.token,
          })
          return
        }
        if (outcome?.kind === 'session') {
          markSignedIn()
          window.location.assign(destination)
          return
        }
        setFailure({
          message: 'Your account may have been created, but the server did not say so clearly. Try signing in.',
          fields: {},
        })
        return
      }

      const response = await api.post('/v1/auth/login', { identifier, password, platform: 'web' })
      // The body is still read, and still has to contain a real session, but
      // nothing in it is kept. auth-service set access_token, refresh_token and
      // csrf_token on this very response and the zone's proxy forwarded them,
      // so by the time this line runs the browser already holds the session —
      // for every zone and every tab at once, because cookies ignore the port.
      // `readSession` is now purely a check that the server did what it said.
      const session = readSession(response.data)
      if (!session) {
        setFailure({ message: 'Authentication response was incomplete.', fields: {} })
        return
      }
      markSignedIn()
      window.location.assign(destination)
    } catch (cause) {
      setFailure(readAuthFailure(cause, isRegister ? 'We could not create your account.' : 'Authentication failed.'))
    } finally {
      setLoading(false)
    }
  }

  const switchPath = isRegister ? '/login' : '/register'
  const switchHref = requested
    ? `${switchPath}?redirect=${encodeURIComponent(destination)}`
    : switchPath
  const loginHref = requested ? `/login?redirect=${encodeURIComponent(destination)}` : '/login'

  const kicker = zoneLabel ? `Continue to ${zoneLabel}` : 'One account, every part of the platform'

  if (verification) {
    const expires = expiryWording(verification.expiresAt)
    return (
      <main className="auth-page">
        <section className="auth-card" data-zone={zone ?? 'platform'}>
          <Link href="/" className="auth-brand"><i aria-hidden="true">M</i>{BRAND}</Link>
          <p className="auth-kicker">Almost there</p>
          <h1>Confirm your email</h1>
          <p className="auth-lede">
            Your {BRAND} account for <strong>{verification.email}</strong> exists, but it is not
            usable yet. The address has to be confirmed before you can sign in.
          </p>
          <p className="auth-lede">
            {expires
              ? `Open the confirmation link we generated for it — it stops working on ${expires}.`
              : 'Open the confirmation link we generated for it.'}
          </p>
          {/* Honest whichever way the mail question lands: this build cannot see
              whether the environment it is talking to actually delivers mail, so
              it does not promise an inbox it has no knowledge of. */}
          <p className="auth-note">
            Confirmation mail is sent by the platform&apos;s mail service, which is not wired up in
            every environment. If nothing arrives, ask whoever runs the stack you are pointed at to
            confirm the address.
          </p>
          {process.env.NODE_ENV !== 'production' && verification.token ? (
            <details className="auth-dev">
              <summary>Development build: confirmation token</summary>
              <p>
                The server returned this token in the registration response, so it is already in
                this browser either way. It is what a confirmation link carries, and it is the only
                way to confirm an address on a stack with no mail delivery. Never rendered in a
                production build.
              </p>
              <code>{verification.token}</code>
            </details>
          ) : null}
          <p className="auth-switch">
            Already confirmed? <Link href={loginHref}>Sign in</Link>
          </p>
        </section>
      </main>
    )
  }

  const emailError = errorFor('email', 'identifier')
  const passwordError = errorFor('password')
  const firstNameError = errorFor('first_name')
  const lastNameError = errorFor('last_name')
  const dobError = errorFor('dob')
  const termsError = errorFor('accepted_terms', 'terms_version')

  return (
    <main className="auth-page">
      <section className="auth-card" data-zone={zone ?? 'platform'}>
        <Link href="/" className="auth-brand"><i aria-hidden="true">M</i>{BRAND}</Link>
        <p className="auth-kicker">{kicker}</p>
        <h1>{isRegister ? 'Create your account' : 'Welcome back'}</h1>
        <p className="auth-lede">
          {zoneLabel
            ? `One ${BRAND} account signs you in to ${zoneLabel} and everything else on the platform.`
            : `One ${BRAND} account signs you in everywhere on the platform.`}
        </p>
        <form onSubmit={submit} className="auth-form" noValidate>
          {isRegister ? (
            <div className="auth-name-row">
              <label>
                First name
                <input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  autoComplete="given-name"
                  aria-invalid={firstNameError ? true : undefined}
                  required
                />
                {firstNameError ? <span className="auth-field-error">{firstNameError}</span> : null}
              </label>
              <label>
                Last name
                <input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  autoComplete="family-name"
                  aria-invalid={lastNameError ? true : undefined}
                />
                {lastNameError ? <span className="auth-field-error">{lastNameError}</span> : null}
              </label>
            </div>
          ) : null}

          <label>
            {isRegister ? 'Email' : 'Email or phone'}
            <input
              type={isRegister ? 'email' : 'text'}
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              autoComplete="username"
              aria-invalid={emailError ? true : undefined}
              required
            />
            {emailError ? <span className="auth-field-error">{emailError}</span> : null}
          </label>

          {isRegister ? (
            <label>
              Date of birth
              <input
                type="date"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
                autoComplete="bday"
                aria-invalid={dobError ? true : undefined}
                required
              />
              <span className="auth-hint">
                {BRAND} is for people aged {MINIMUM_AGE} and over. We use this to check that and
                nothing else.
              </span>
              {dobError ? <span className="auth-field-error">{dobError}</span> : null}
            </label>
          ) : null}

          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              minLength={8}
              aria-invalid={passwordError ? true : undefined}
              required
            />
            {passwordError ? <span className="auth-field-error">{passwordError}</span> : null}
          </label>

          {isRegister ? (
            <>
              <label className="auth-terms" htmlFor="accepted-terms">
                <input
                  id="accepted-terms"
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                  aria-invalid={termsError ? true : undefined}
                />
                <span>
                  I agree to the{' '}
                  <Link href={TERMS_HREF} target="_blank" rel="noreferrer">
                    {BRAND} Terms of Service
                  </Link>{' '}
                  (version {TERMS_VERSION}).
                </span>
              </label>
              {termsError ? <p className="auth-field-error">{termsError}</p> : null}
            </>
          ) : null}

          {failure ? <p role="alert" className="auth-error">{failure.message}</p> : null}
          <button disabled={loading}>
            {loading ? 'Please wait…' : isRegister ? 'Create account' : 'Sign in'}
          </button>
        </form>
        <p className="auth-switch">
          {isRegister ? 'Already registered?' : `New to ${BRAND}?`}{' '}
          <Link href={switchHref}>{isRegister ? 'Sign in' : 'Create account'}</Link>
        </p>
      </section>
    </main>
  )
}
