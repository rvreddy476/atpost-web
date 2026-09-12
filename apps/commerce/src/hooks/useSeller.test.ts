import { describe, expect, it } from 'vitest'
import { SELLER_PAGE_SIZE, shipRequestBody } from './useSeller'

// The hooks themselves need a QueryClient and a browser; what can be pinned
// without either is the exact JSON the ship action sends, because a field
// name typo there is invisible until the server starts reading the body.
describe('shipRequestBody', () => {
  it('sends courier and tracking_number, trimmed and normalised', () => {
    expect(shipRequestBody({ courier: '  Delhivery ', tracking_number: ' awb 1234 5678 ' })).toEqual({
      courier: 'Delhivery',
      tracking_number: 'AWB12345678',
    })
  })

  it('sends nothing else', () => {
    expect(Object.keys(shipRequestBody({ courier: 'x', tracking_number: 'y' })).sort()).toEqual([
      'courier',
      'tracking_number',
    ])
  })
})

describe('SELLER_PAGE_SIZE', () => {
  it('matches the server default so a page is one server page', () => {
    // clampListPagination in service/service.go defaults limit to 20.
    expect(SELLER_PAGE_SIZE).toBe(20)
  })
})
