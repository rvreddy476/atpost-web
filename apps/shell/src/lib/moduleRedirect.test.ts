import { describe, expect, it } from 'vitest'
import { moduleHome } from './moduleRedirect'

describe('moduleHome', () => {
  it.each([
    ['/shop', '/shop'], ['/shop/cart', '/shop'], ['/admin/products', '/admin'],
    ['/match/profile', '/match'], ['/messenger?thread=1', '/messenger'],
  ])('maps %s to %s', (requested, expected) => expect(moduleHome(requested)).toBe(expected))

  it.each(['https://evil.example', '//evil.example', '/\\evil', '/unknown', '', null])(
    'rejects unsafe or unknown destination %s',
    (requested) => expect(moduleHome(requested)).toBe('/'),
  )
})
