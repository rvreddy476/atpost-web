import { describe, expect, it } from 'vitest'
import { fieldError, readAuthFailure } from './authErrors'

const axiosish = (status: number, data: unknown) => ({
  response: { status, data },
  message: `Request failed with status code ${status}`,
})

describe('readAuthFailure', () => {
  it('reads the gateway envelope and keeps the per-field complaints', () => {
    const failure = readAuthFailure(
      axiosish(422, {
        error: {
          code: 'VALIDATION_FAILED',
          message: 'We could not create your account.',
          details: {
            fields: [
              { code: 'dob', reason: 'You must be at least 13 years old.' },
              { code: 'terms_version', reason: 'Accept the current terms to continue.' },
            ],
          },
        },
      }),
      'fallback',
    )
    expect(failure.message).toBe('We could not create your account.')
    expect(failure.fields).toEqual({
      dob: 'You must be at least 13 years old.',
      terms_version: 'Accept the current terms to continue.',
    })
  })

  it('reads a plain field→message map as well as the [{code, reason}] array', () => {
    const failure = readAuthFailure(
      axiosish(422, { error: { details: { fields: { email: 'That address is already registered.' } } } }),
      'fallback',
    )
    expect(failure.fields.email).toBe('That address is already registered.')
    // No summary from the server, but the inputs already say everything.
    expect(failure.message).toBe('Some of these details need fixing.')
  })

  it('never surfaces the axios transport message as the banner', () => {
    const failure = readAuthFailure(axiosish(500, {}), 'fallback')
    expect(failure.message).not.toMatch(/status code/)
    expect(failure.message).toMatch(/having trouble/)
  })

  it('says the request never landed when there is no response at all', () => {
    const failure = readAuthFailure(new Error('Network Error'), 'fallback')
    expect(failure.message).toMatch(/could not reach/i)
    expect(failure.fields).toEqual({})
  })

  it('names rate limiting rather than blaming the credentials', () => {
    expect(readAuthFailure(axiosish(429, {}), 'fallback').message).toMatch(/Too many attempts/)
  })

  it('uses the caller fallback for an otherwise mute 4xx', () => {
    expect(readAuthFailure(axiosish(400, {}), 'fallback').message).toBe('fallback')
  })
})

describe('fieldError', () => {
  const failure = { message: 'nope', fields: { terms_version: 'Accept the current terms.' } }

  it('resolves a wire name that has no box of its own onto the control that does', () => {
    expect(fieldError(failure, 'accepted_terms', 'terms_version')).toBe('Accept the current terms.')
  })

  it('returns undefined when nothing matched', () => {
    expect(fieldError(failure, 'email')).toBeUndefined()
    expect(fieldError(null, 'email')).toBeUndefined()
  })
})
