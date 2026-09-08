import { describe, expect, it } from 'vitest'
import { DEFAULT_LANDING, moduleHome, moduleLabel, requestedModule } from './moduleRedirect'

describe('moduleHome', () => {
  it.each([
    ['/shop', '/shop'], ['/shop/cart', '/shop'], ['/admin/products', '/admin'],
    ['/social/feed', '/social'], ['/apps?id=1', '/apps'],
  ])('keeps the explicit destination %s, landing on %s', (requested, expected) =>
    expect(moduleHome(requested)).toBe(expected))

  // The six deleted zones are no longer allowlisted destinations. Accepting
  // one would sign someone in and then hand them a 404 in a zone that is gone.
  it.each(['/match/profile', '/messenger?thread=1', '/community', '/creator', '/live', '/memories'])(
    'refuses %s, a zone that no longer exists, and lands on the shop',
    (requested) => {
      expect(requestedModule(requested)).toBeNull()
      expect(moduleHome(requested)).toBe('/shop')
    },
  )

  // Everything that is not an explicit, allowlisted destination lands on the
  // shop — including an admin who opened /login themselves. Nobody arrives
  // holding console powers they did not navigate to.
  it.each(['https://evil.example', '//evil.example', '/\\evil', '/unknown', '', null])(
    'falls back to the shop for unsafe or unknown destination %s',
    (requested) => expect(moduleHome(requested)).toBe('/shop'),
  )

  it('lands on the shop by default', () => expect(DEFAULT_LANDING).toBe('/shop'))
})

describe('requestedModule', () => {
  it('reports null when nothing was asked for, so a default is not mistaken for a journey', () => {
    expect(requestedModule(null)).toBeNull()
    expect(requestedModule('/unknown')).toBeNull()
    expect(requestedModule('//evil.example')).toBeNull()
  })

  it('reports the module an explicit redirect names', () => {
    expect(requestedModule('/admin/sellers')).toBe('/admin')
    expect(requestedModule('/shop')).toBe('/shop')
  })
})

describe('moduleLabel', () => {
  it('names an explicitly requested zone', () => {
    expect(moduleLabel('/admin')).toBe('the admin console')
    expect(moduleLabel('/shop/cart')).toBe('the shop')
  })

  it('names nothing when no zone was requested', () => {
    expect(moduleLabel(null)).toBeNull()
    expect(moduleLabel('/unknown')).toBeNull()
  })
})
