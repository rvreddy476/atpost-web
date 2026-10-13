import { describe, expect, it, vi } from 'vitest'
vi.mock('@/hooks/useAdminMutation', () => ({ useAdminMutation: () => ({}) }))
vi.mock('@/hooks/useAdminQuery', () => ({ adminKey: () => [], useAdminList: () => ({}), useAdminObject: () => ({}) }))
vi.mock('@/components/blocks/PartnerEvidenceButton', () => ({ PartnerEvidenceButton: () => null }))
import { deliveryAreaProblem } from './CommerceDelivery'
const valid = { name: 'Configured area', latitude: '17.4', longitude: '78.5', radius: '5', payout: '75.25', enabled: true }
describe('Explicit Commerce delivery configuration', () => {
  it('requires an explicit payout before enabling', () => {
    expect(deliveryAreaProblem({ ...valid, payout: '' })).not.toBeNull()
    expect(deliveryAreaProblem({ ...valid, enabled: false, payout: '' })).toBeNull()
    expect(deliveryAreaProblem(valid)).toBeNull()
  })
  it.each(['0', '-1', 'NaN', 'Infinity', '1.001'])('rejects invalid payouts %s', payout => expect(deliveryAreaProblem({ ...valid, payout })).not.toBeNull())
  it('rejects missing or invalid coordinates and radius', () => {
    expect(deliveryAreaProblem({ ...valid, latitude: '' })).not.toBeNull()
    expect(deliveryAreaProblem({ ...valid, longitude: '181' })).not.toBeNull()
    expect(deliveryAreaProblem({ ...valid, radius: '0' })).not.toBeNull()
    expect(deliveryAreaProblem({ ...valid, radius: '101' })).not.toBeNull()
  })
})
