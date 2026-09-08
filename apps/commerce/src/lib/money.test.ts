import { describe, expect, it } from 'vitest'
import { inr, inrMinor } from './money'

// The cart sends integer paise; the quote sends rupee floats. Rendering one
// with the other's function is the failure this file exists to catch: a cart
// that shows ₹12.99 as ₹1,299 is worse than a cart that crashes, because
// nobody notices it until the money is wrong.
describe('inrMinor — integer paise', () => {
  it('renders whole rupees without paise', () => {
    expect(inrMinor(129900)).toBe('₹1,299')
    expect(inrMinor(0)).toBe('₹0')
  })

  it('renders paise when there are any', () => {
    expect(inrMinor(1299)).toBe('₹12.99')
    expect(inrMinor(1)).toBe('₹0.01')
    expect(inrMinor(74990)).toBe('₹749.90')
  })

  it('groups in the Indian style', () => {
    expect(inrMinor(1234567890)).toBe('₹1,23,45,678.90')
    expect(inrMinor(799700)).toBe('₹7,997')
  })

  it('is not the rupee formatter — the same number reads differently', () => {
    // 1299 paise is ₹12.99. 1299 rupees is ₹1,299. Both are legitimate
    // inputs to their own function and neither may be fed to the other.
    expect(inrMinor(1299)).not.toBe(inr(1299))
  })

  it('never loses a paisa to float arithmetic', () => {
    // 1234.56 * 100 is 123455.99999999999 in a JS float. Coming the other way
    // the same value has to land exactly on the hundredth.
    expect(inrMinor(123456)).toBe('₹1,234.56')
    expect(inrMinor(1000000000000)).toBe('₹10,00,00,00,000')
  })

  it('carries a negative sign', () => {
    expect(inrMinor(-525)).toBe('−₹5.25')
  })

  it('says nothing rather than ₹0 for a value it cannot read', () => {
    expect(inrMinor(Number.NaN)).toBe('—')
  })
})

describe('inr — rupees, unchanged', () => {
  it('still renders the quote endpoint the way it always did', () => {
    expect(inr(1299)).toBe('₹1,299')
    expect(inr(12.99)).toBe('₹12.99')
  })
})
