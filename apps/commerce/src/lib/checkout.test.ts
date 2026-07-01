import { describe, expect, it } from 'vitest'
import { getCheckoutBlockReason } from './checkout'

const readyQuote = { serviceable: true, cod_eligible: true }

describe('getCheckoutBlockReason', () => {
  it('requires an address', () => {
    expect(getCheckoutBlockReason({ selectedAddress: null, isProcessing: false, isQuoteFetching: false, paymentMethod: 'prepaid', quote: readyQuote })).toBe('Select a delivery address.')
  })

  it('prevents duplicate submissions', () => {
    expect(getCheckoutBlockReason({ selectedAddress: 'address-1', isProcessing: true, isQuoteFetching: false, paymentMethod: 'prepaid', quote: readyQuote })).toBe('Your order is already being processed.')
  })

  it('requires a server quote for prepaid orders', () => {
    expect(getCheckoutBlockReason({ selectedAddress: 'address-1', isProcessing: false, isQuoteFetching: false, paymentMethod: 'prepaid', quote: null })).toContain('verified')
  })

  it('blocks unserviceable addresses', () => {
    expect(getCheckoutBlockReason({ selectedAddress: 'address-1', isProcessing: false, isQuoteFetching: false, paymentMethod: 'prepaid', quote: { serviceable: false, cod_eligible: true } })).toContain('cannot be delivered')
  })

  it('blocks COD when the quote disallows it', () => {
    expect(getCheckoutBlockReason({ selectedAddress: 'address-1', isProcessing: false, isQuoteFetching: false, paymentMethod: 'cod', quote: { serviceable: true, cod_eligible: false } })).toContain('Cash on delivery')
  })

  it('allows a verified, serviceable prepaid order', () => {
    expect(getCheckoutBlockReason({ selectedAddress: 'address-1', isProcessing: false, isQuoteFetching: false, paymentMethod: 'prepaid', quote: readyQuote })).toBeNull()
  })

  it('allows approved credit checkout without a retail quote', () => {
    expect(getCheckoutBlockReason({ selectedAddress: 'address-1', isProcessing: false, isQuoteFetching: false, paymentMethod: 'credit', quote: null })).toBeNull()
  })
})
