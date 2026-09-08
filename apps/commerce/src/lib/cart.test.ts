import { describe, expect, it } from 'vitest'
import type { CartView, CartViewLine } from '@atpost/types/commerce'
import {
  cartBlockReason,
  isMixedSellerCart,
  lineImage,
  overstockedLines,
  repricedLines,
  unavailableLines,
} from './cart'

const SELLER_A = '11111111-1111-4111-8111-111111111111'
const SELLER_B = '22222222-2222-4222-8222-222222222222'

// Shaped on the real payload from GET /v1/commerce/cart, not on a guess:
//   {"cart_id":"4e81396f-…","items":[{"variant_id":"aa77ef7b-…",
//    "title":"Malgudi Days Annotated Edition","sku":"STEP15-121142",
//    "quantity":2,"unit_price_minor":74900,"line_total_minor":149800,
//    "available_qty":11,"seller_id":"bd7b7530-…","seller_name":"E2E Merged
//    Store","sellable":true}],"subtotal_minor":799700,"item_count":3,…}
function line(over: Partial<CartViewLine> = {}): CartViewLine {
  return {
    variant_id: 'aa77ef7b-cbea-47da-bf5a-468ca6241a9d',
    product_id: '78923755-0fd2-4847-9c52-b28e7c02c916',
    title: 'Malgudi Days Annotated Edition',
    sku: 'STEP15-121142',
    quantity: 2,
    unit_price_minor: 74900,
    line_total_minor: 149800,
    available_qty: 11,
    seller_id: SELLER_A,
    seller_name: 'E2E Merged Store',
    sellable: true,
    ...over,
  }
}

function cart(items: CartViewLine[], over: Partial<CartView> = {}): CartView {
  const sellers = new Set(items.map((l) => l.seller_id))
  return {
    cart_id: '4e81396f-c19e-4928-865a-db8377b70a17',
    items,
    subtotal_minor: items.reduce((total, l) => total + l.line_total_minor, 0),
    item_count: items.reduce((total, l) => total + l.quantity, 0),
    // The service sets these only for a single-seller cart; the fixture has to
    // behave the same way or the mixed-cart tests prove nothing.
    ...(sellers.size === 1
      ? { seller_id: items[0].seller_id, seller_name: items[0].seller_name }
      : {}),
    ...over,
  }
}

describe('sellable', () => {
  it('finds the lines that have left the catalogue', () => {
    const c = cart([line(), line({ variant_id: 'v2', sellable: false })])
    expect(unavailableLines(c).map((l) => l.variant_id)).toEqual(['v2'])
  })

  it('names the one item checkout would refuse with ErrProductUnavailable', () => {
    const c = cart([line({ title: 'Aurora ANC Headphones', sellable: false })])
    expect(cartBlockReason(c)).toBe(
      'Aurora ANC Headphones is no longer available. Remove it to continue.',
    )
  })

  it('counts them when there is more than one', () => {
    const c = cart([
      line({ sellable: false }),
      line({ variant_id: 'v2', sellable: false }),
    ])
    expect(cartBlockReason(c)).toBe('2 items are no longer available. Remove them to continue.')
  })
})

describe('available_qty', () => {
  it('flags a line asking for more than the seller can supply', () => {
    const c = cart([line({ quantity: 4, available_qty: 2 })])
    expect(overstockedLines(c)).toHaveLength(1)
    expect(cartBlockReason(c)).toBe(
      'Only 2 of Malgudi Days Annotated Edition are left. Reduce the quantity to continue.',
    )
  })

  it('says out of stock rather than "only 0 left"', () => {
    const c = cart([line({ quantity: 1, available_qty: 0 })])
    expect(cartBlockReason(c)).toBe(
      'Malgudi Days Annotated Edition is out of stock. Remove it to continue.',
    )
  })

  it('reads the singular correctly', () => {
    const c = cart([line({ quantity: 2, available_qty: 1 })])
    expect(cartBlockReason(c)).toContain('Only 1 of Malgudi Days Annotated Edition is left')
  })

  it('is silent when the quantity fits', () => {
    expect(cartBlockReason(cart([line({ quantity: 11, available_qty: 11 })]))).toBeNull()
  })
})

describe('mixed-seller cart', () => {
  it('is read off the absence of cart.seller_id, not off the lines', () => {
    const mixed = cart([line(), line({ variant_id: 'v2', seller_id: SELLER_B, seller_name: 'Another Shop' })])
    expect(mixed.seller_id).toBeUndefined()
    expect(isMixedSellerCart(mixed)).toBe(true)
  })

  it('refuses to name either shop', () => {
    const mixed = cart([line(), line({ variant_id: 'v2', seller_id: SELLER_B, seller_name: 'Another Shop' })])
    const reason = cartBlockReason(mixed)
    expect(reason).toBe(
      'Your bag has items from more than one shop. An order can only be placed with one shop at a time.',
    )
    // Naming one of the two would tell the buyer the wrong thing about why
    // checkout answers ErrMultipleSellers.
    expect(reason).not.toContain('E2E Merged Store')
    expect(reason).not.toContain('Another Shop')
  })

  it('leaves a single-seller cart alone', () => {
    const single = cart([line(), line({ variant_id: 'v2' })])
    expect(isMixedSellerCart(single)).toBe(false)
    expect(cartBlockReason(single)).toBeNull()
  })

  it('does not call an empty cart mixed', () => {
    expect(isMixedSellerCart(cart([]))).toBe(false)
    expect(cartBlockReason(cart([]))).toBeNull()
  })
})

describe('price_was_minor', () => {
  it('is absent in the ordinary case', () => {
    expect(repricedLines(cart([line()]))).toHaveLength(0)
  })

  it('treats zero as a real price, not as absent', () => {
    // Nil means "nothing to warn about". Zero means the item used to be free,
    // and `was ₹0.00` is a thing the cart must be able to say — so the test
    // is on `!= null`, never on falsiness.
    const c = cart([line({ price_was_minor: 0 })])
    expect(repricedLines(c)).toHaveLength(1)
  })

  it('picks up a moved price', () => {
    const c = cart([line({ unit_price_minor: 74900, price_was_minor: 99900 })])
    expect(repricedLines(c)[0].price_was_minor).toBe(99900)
  })

  it('is not on its own a reason checkout is blocked', () => {
    // Checkout re-prices to the current figure and refuses only if the buyer
    // was shown the old one. Warning is the cart's whole job here.
    expect(cartBlockReason(cart([line({ price_was_minor: 99900 })]))).toBeNull()
  })
})

describe('image_url', () => {
  it('passes a resolved URL through', () => {
    expect(lineImage(line({ image_url: 'https://media/x.jpg' })).image_url).toBe('https://media/x.jpg')
  })

  it('turns an absent or empty URL into null, so the placeholder renders', () => {
    // The live payload omits image_url entirely on a product with no media —
    // that is the service saying "render a placeholder".
    expect(lineImage(line()).image_url).toBeNull()
    expect(lineImage(line({ image_url: '' })).image_url).toBeNull()
    expect(lineImage(line()).image_media_id).toBeNull()
  })

  it('prefers the media id, which productImage resolves through the gateway', () => {
    const source = lineImage(line({ image_media_id: '144bd761-216a-45a7-9a78-74e693b48d1a' }))
    expect(source.image_media_id).toBe('144bd761-216a-45a7-9a78-74e693b48d1a')
  })
})

describe('order of precedence', () => {
  it('reports the unavailable item before the mixed bag', () => {
    const c = cart([
      line({ sellable: false }),
      line({ variant_id: 'v2', seller_id: SELLER_B, seller_name: 'Another Shop' }),
    ])
    expect(cartBlockReason(c)).toContain('no longer available')
  })

  it('has nothing to say about a cart that is fine', () => {
    expect(cartBlockReason(cart([line()]))).toBeNull()
    expect(cartBlockReason(null)).toBeNull()
    expect(cartBlockReason(undefined)).toBeNull()
  })
})
