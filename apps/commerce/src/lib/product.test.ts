import { describe, expect, it } from 'vitest'
import { discountLabel, displayPrice } from './product'

describe('discountLabel', () => {
  it('is the server figure and nothing else', () => {
    expect(discountLabel({ discount_pct: 25 })).toBe('25% OFF')
  })

  it('draws no badge when the server sent none, even when the prices would allow one', () => {
    // ₹1,000 down to ₹749 is a 25% deal by arithmetic. The badge is still
    // absent: the client does not do this sum, because the grid and the
    // detail page used to disagree about the answer.
    expect(discountLabel({ min_price_minor: 74900, mrp_minor: 100000 } as never)).toBeNull()
    expect(discountLabel({ min_selling_price: 749, min_mrp: 1000 } as never)).toBeNull()
  })

  it('treats zero, negatives and nonsense as no deal', () => {
    expect(discountLabel({ discount_pct: 0 })).toBeNull()
    expect(discountLabel({ discount_pct: -5 })).toBeNull()
    expect(discountLabel({ discount_pct: Number.NaN })).toBeNull()
    expect(discountLabel({ discount_pct: null })).toBeNull()
    expect(discountLabel(undefined)).toBeNull()
  })
})

describe('displayPrice', () => {
  it('reads paise first', () => {
    expect(displayPrice({ min_price_minor: 74900, mrp_minor: 99900 })).toEqual({ price: '₹749', was: '₹999' })
  })

  it('strikes the MRP only when it is higher', () => {
    expect(displayPrice({ min_price_minor: 99900, mrp_minor: 99900 })).toEqual({ price: '₹999', was: null })
    expect(displayPrice({ min_price_minor: 99900 })).toEqual({ price: '₹999', was: null })
  })

  it('falls back to the rupee floats only when the paise pair is absent', () => {
    expect(displayPrice({ min_selling_price: 749, min_mrp: 999 })).toEqual({ price: '₹749', was: '₹999' })
    // Both present: paise wins, and a disagreeing float pair is ignored.
    expect(displayPrice({ min_price_minor: 74900, mrp_minor: 99900, min_selling_price: 1, min_mrp: 2 }))
      .toEqual({ price: '₹749', was: '₹999' })
  })

  it('draws nothing rather than ₹0 for a summary with no price', () => {
    expect(displayPrice({})).toBeNull()
    expect(displayPrice(null)).toBeNull()
  })
})
