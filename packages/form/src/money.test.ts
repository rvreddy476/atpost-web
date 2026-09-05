import { describe, expect, it } from 'vitest'
import { formatMinor, parseMinor } from './money'

describe('parseMinor', () => {
  it('returns null for nothing at all', () => {
    expect(parseMinor(null)).toBeNull()
    expect(parseMinor(undefined)).toBeNull()
    expect(parseMinor('')).toBeNull()
    expect(parseMinor('   ')).toBeNull()
  })

  it('parses whole rupees', () => {
    expect(parseMinor('0')).toBe(0)
    expect(parseMinor('1')).toBe(100)
    expect(parseMinor('12')).toBe(1200)
    expect(parseMinor(' 250 ')).toBe(25000)
  })

  it('parses one and two decimal places exactly', () => {
    expect(parseMinor('12.3')).toBe(1230)
    expect(parseMinor('12.34')).toBe(1234)
    expect(parseMinor('0.01')).toBe(1)
    expect(parseMinor('0.00')).toBe(0)
    expect(parseMinor('.5')).toBe(50)
    expect(parseMinor('5.')).toBe(500)
  })

  it('does not drift the way float arithmetic does', () => {
    // 12.34 * 100 is 1233.9999999999998 — the whole reason this function exists.
    expect(parseMinor('12.34')).toBe(1234)
    expect(parseMinor('1.15')).toBe(115)
    expect(parseMinor('8.29')).toBe(829)
    expect(parseMinor('1299.99')).toBe(129999)
  })

  it('refuses more than two decimal places rather than rounding', () => {
    expect(parseMinor('12.345')).toBeNull()
    expect(parseMinor('0.005')).toBeNull()
    expect(parseMinor('1.9999')).toBeNull()
  })

  it('accepts Indian and Western comma grouping', () => {
    expect(parseMinor('1,234.50')).toBe(123450)
    expect(parseMinor('1,23,456')).toBe(12345600)
    expect(parseMinor('123,456.78')).toBe(12345678)
  })

  it('rejects malformed grouping', () => {
    expect(parseMinor(',123')).toBeNull()
    expect(parseMinor('123,')).toBeNull()
    expect(parseMinor('1,,23')).toBeNull()
    expect(parseMinor('1.5,0')).toBeNull()
  })

  it('strips a currency prefix and internal spaces', () => {
    expect(parseMinor('₹99')).toBe(9900)
    expect(parseMinor('Rs 99')).toBe(9900)
    expect(parseMinor('Rs. 99.50')).toBe(9950)
    expect(parseMinor('INR 1,000')).toBe(100000)
    expect(parseMinor('1 234.50')).toBe(123450)
    expect(parseMinor('1 234')).toBe(123400)
  })

  it('handles a sign on either side of the currency mark', () => {
    expect(parseMinor('-5.25')).toBe(-525)
    expect(parseMinor('+5.25')).toBe(525)
    expect(parseMinor('-₹5')).toBe(-500)
    expect(parseMinor('₹-5')).toBe(-500)
    expect(parseMinor('-0.01')).toBe(-1)
  })

  it('rejects text that is not a number', () => {
    expect(parseMinor('abc')).toBeNull()
    expect(parseMinor('12abc')).toBeNull()
    expect(parseMinor('1.2.3')).toBeNull()
    expect(parseMinor('1e3')).toBeNull()
    expect(parseMinor('.')).toBeNull()
    expect(parseMinor('-')).toBeNull()
    expect(parseMinor('₹')).toBeNull()
    expect(parseMinor('--5')).toBeNull()
    expect(parseMinor('5%')).toBeNull()
  })

  it('accepts numbers, but holds them to the same two-decimal rule', () => {
    expect(parseMinor(12)).toBe(1200)
    expect(parseMinor(12.34)).toBe(1234)
    expect(parseMinor(0)).toBe(0)
    expect(parseMinor(-3.5)).toBe(-350)
    expect(parseMinor(12.345)).toBeNull()
    expect(parseMinor(0.1 + 0.2)).toBeNull() // 0.30000000000000004
    expect(parseMinor(Number.NaN)).toBeNull()
    expect(parseMinor(Number.POSITIVE_INFINITY)).toBeNull()
  })

  it('refuses amounts too large to hold exactly', () => {
    expect(parseMinor('999999999999999999')).toBeNull()
    expect(parseMinor('90071992547409.92')).toBeNull()
  })
})

describe('formatMinor', () => {
  it('renders minor units as plain two-decimal text', () => {
    expect(formatMinor(0)).toBe('0.00')
    expect(formatMinor(1)).toBe('0.01')
    expect(formatMinor(1234)).toBe('12.34')
    expect(formatMinor(129900)).toBe('1299.00')
    expect(formatMinor(-525)).toBe('-5.25')
  })

  it('renders nothing for no amount', () => {
    expect(formatMinor(null)).toBe('')
    expect(formatMinor(undefined)).toBe('')
    expect(formatMinor(Number.NaN)).toBe('')
  })

  it('round-trips through parseMinor', () => {
    for (const minor of [0, 1, 99, 100, 1234, 129999, -525]) {
      expect(parseMinor(formatMinor(minor))).toBe(minor)
    }
  })
})
