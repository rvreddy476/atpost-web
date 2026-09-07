import { describe, expect, it } from 'vitest'
import {
  MINIMUM_AGE,
  TERMS_VERSION,
  buildRegisterPayload,
  readRegisterOutcome,
  readSession,
  validateDob,
} from './registration'

const input = {
  email: '  buyer@example.com  ',
  password: 'StrongPassword123!',
  firstName: ' Test ',
  lastName: ' Buyer ',
  dob: '1990-04-11',
}

describe('buildRegisterPayload', () => {
  it('sends every field auth-service requires', () => {
    expect(buildRegisterPayload(input)).toEqual({
      email: 'buyer@example.com',
      password: 'StrongPassword123!',
      first_name: 'Test',
      last_name: 'Buyer',
      dob: '1990-04-11',
      accepted_terms: true,
      terms_version: TERMS_VERSION,
      platform: 'web',
    })
  })

  // An exact-match check on the server: a drift here refuses every single
  // registration, so it is worth a test that fails loudly rather than a
  // constant nobody looks at.
  it('pins the terms version the backend compares against', () => {
    expect(TERMS_VERSION).toBe('2026-08-01')
  })
})

describe('validateDob', () => {
  const yearsAgo = (n: number) => {
    const d = new Date()
    d.setFullYear(d.getFullYear() - n)
    return d.toISOString().slice(0, 10)
  }

  it('accepts an adult', () => expect(validateDob(yearsAgo(30))).toBeNull())
  it('accepts exactly the minimum age', () => expect(validateDob(yearsAgo(MINIMUM_AGE))).toBeNull())
  it('refuses someone below the minimum', () =>
    expect(validateDob(yearsAgo(MINIMUM_AGE - 1))).toMatch(/at least/))
  it('refuses an empty date rather than sending a blank field', () =>
    expect(validateDob('')).toMatch(/date of birth/i))
  it('refuses a date that does not exist', () => expect(validateDob('2001-02-30')).toMatch(/does not exist/))
  it('refuses a future date', () => expect(validateDob('3000-01-01')).toMatch(/future/))
})

describe('readRegisterOutcome', () => {
  const user = { id: 'u-1', email: 'buyer@example.com' }

  it('reads the real backend answer — no tokens — as the verification success it is', () => {
    const outcome = readRegisterOutcome(
      {
        data: {
          user,
          requires_verification: true,
          verification_token: 'vt-123',
          verification_expires_at: '2026-09-08T10:00:00Z',
        },
      },
      'fallback@example.com',
    )
    expect(outcome).toEqual({
      kind: 'verify',
      email: 'buyer@example.com',
      expiresAt: '2026-09-08T10:00:00Z',
      token: 'vt-123',
    })
  })

  it('works on an unwrapped body too', () => {
    const outcome = readRegisterOutcome({ user, requires_verification: true }, 'fallback@example.com')
    expect(outcome).toMatchObject({ kind: 'verify', expiresAt: null, token: null })
  })

  it('falls back to the address that was typed when the server echoes no user', () => {
    const outcome = readRegisterOutcome({ requires_verification: true }, 'typed@example.com')
    expect(outcome).toMatchObject({ kind: 'verify', email: 'typed@example.com' })
  })

  it('never turns a verification answer into a session, even if tokens ride along', () => {
    const outcome = readRegisterOutcome(
      { data: { user, requires_verification: true, tokens: { access_token: 'a', refresh_token: 'r' } } },
      'fallback@example.com',
    )
    expect(outcome?.kind).toBe('verify')
  })

  it('honours a pre-verified registration only when the server says so explicitly', () => {
    const outcome = readRegisterOutcome(
      { data: { user, requires_verification: false, tokens: { access_token: 'a', refresh_token: 'r' } } },
      'fallback@example.com',
    )
    expect(outcome).toEqual({
      kind: 'session',
      session: { accessToken: 'a', refreshToken: 'r', user },
    })
  })

  it('reports nothing usable for an empty body', () =>
    expect(readRegisterOutcome({}, 'a@b.c')).toBeNull())
})

describe('readSession', () => {
  it('accepts both snake_case and camelCase token spellings', () => {
    expect(readSession({ data: { user: { id: 'u-1' }, tokens: { accessToken: 'a', refreshToken: 'r' } } }))
      .toEqual({ accessToken: 'a', refreshToken: 'r', user: { id: 'u-1' } })
  })

  it('tolerates a missing refresh token', () => {
    expect(readSession({ user: { id: 'u-1' }, tokens: { access_token: 'a' } }))
      .toEqual({ accessToken: 'a', refreshToken: '', user: { id: 'u-1' } })
  })

  it('refuses half a session — a token with no user id would send a header with nothing behind it', () => {
    expect(readSession({ tokens: { access_token: 'a' } })).toBeNull()
    expect(readSession({ user: { id: 'u-1' } })).toBeNull()
  })
})
