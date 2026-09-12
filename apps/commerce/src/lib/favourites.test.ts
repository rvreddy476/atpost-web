import { describe, expect, it } from 'vitest'
import {
  favouriteCount,
  favouritesAfterToggle,
  isFavourited,
  markFavouriteIn,
  withFavourite,
  type FavouritesPage,
} from './favourites'
import type { ProductCardData } from '@/components/commerce/ProductGrid'

const product = (id: string, is_favourite?: boolean): ProductCardData => ({ id, title: id, is_favourite })

describe('withFavourite', () => {
  it('returns the same object when nothing changes, so caches stay clean', () => {
    const p = product('a', true)
    expect(withFavourite(p, true)).toBe(p)
    const q = product('b')
    expect(withFavourite(q, false)).toBe(q)
  })

  it('returns a new object with the heart flipped otherwise', () => {
    const p = product('a')
    const out = withFavourite(p, true)
    expect(out).not.toBe(p)
    expect(out.is_favourite).toBe(true)
    expect(p.is_favourite).toBeUndefined()
  })
})

describe('markFavouriteIn', () => {
  it('flips every copy of the product in a list and leaves the rest alone', () => {
    const list = [product('a'), product('b'), product('a')]
    const out = markFavouriteIn(list, 'a', true)
    expect(out.map((p) => p.is_favourite)).toEqual([true, undefined, true])
    expect(out[1]).toBe(list[1])
  })

  it('answers an empty list for nothing', () => {
    expect(markFavouriteIn(undefined, 'a', true)).toEqual([])
  })
})

describe('favouritesAfterToggle', () => {
  const page: FavouritesPage = { items: [product('b', true), product('c', true)], next_cursor: 'k' }

  it('puts a newly hearted product at the front and marks it hearted', () => {
    const out = favouritesAfterToggle(page, product('a'), true)
    expect(out.items.map((p) => p.id)).toEqual(['a', 'b', 'c'])
    expect(out.items[0].is_favourite).toBe(true)
    expect(out.next_cursor).toBe('k')
  })

  it('does not duplicate a product hearted twice', () => {
    const out = favouritesAfterToggle(page, product('b'), true)
    expect(out.items.map((p) => p.id)).toEqual(['b', 'c'])
  })

  it('drops every copy of an un-hearted product', () => {
    const out = favouritesAfterToggle({ items: [product('a', true), product('b', true), product('a', true)] }, product('a'), false)
    expect(out.items.map((p) => p.id)).toEqual(['b'])
  })

  it('un-hearting something not on the list is a no-op rather than an error', () => {
    const out = favouritesAfterToggle(page, product('zz'), false)
    expect(out.items.map((p) => p.id)).toEqual(['b', 'c'])
  })

  it('starts from nothing when there is no cached page yet', () => {
    const out = favouritesAfterToggle(undefined, product('a'), true)
    expect(out.items.map((p) => p.id)).toEqual(['a'])
  })

  // The optimistic round trip: apply, then put the snapshot back on failure.
  // The reducer never mutates its input, so the snapshot IS the rollback.
  it('leaves the snapshot untouched so a failed request can restore it', () => {
    const before = JSON.stringify(page)
    favouritesAfterToggle(page, product('a'), true)
    favouritesAfterToggle(page, product('b'), false)
    expect(JSON.stringify(page)).toBe(before)
  })
})

describe('favouriteCount and isFavourited', () => {
  it('counts the loaded items and nothing more', () => {
    expect(favouriteCount({ items: [product('a'), product('b')], next_cursor: 'more' })).toBe(2)
    expect(favouriteCount(undefined)).toBe(0)
  })

  it('reads an absent heart as not hearted, not as unknown', () => {
    expect(isFavourited(product('a'))).toBe(false)
    expect(isFavourited(product('a', false))).toBe(false)
    expect(isFavourited(product('a', true))).toBe(true)
    expect(isFavourited(null)).toBe(false)
  })
})
