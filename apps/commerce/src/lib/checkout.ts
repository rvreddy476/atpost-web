export type CheckoutQuoteState = {
  serviceable: boolean
  cod_eligible: boolean
}

export function getCheckoutBlockReason(input: {
  selectedAddress: string | null
  isProcessing: boolean
  isQuoteFetching: boolean
  paymentMethod: 'prepaid' | 'cod' | 'credit'
  quote: CheckoutQuoteState | null | undefined
}): string | null {
  if (!input.selectedAddress) return 'Select a delivery address.'
  if (input.isProcessing) return 'Your order is already being processed.'
  if (input.paymentMethod === 'credit') return null
  if (input.isQuoteFetching) return 'Updating price and delivery eligibility.'
  if (!input.quote) return 'Price and availability must be verified before ordering.'
  if (!input.quote.serviceable) return 'Some items cannot be delivered to this address.'
  if (input.paymentMethod === 'cod' && !input.quote.cod_eligible) {
    return 'Cash on delivery is not available for this order.'
  }
  return null
}
