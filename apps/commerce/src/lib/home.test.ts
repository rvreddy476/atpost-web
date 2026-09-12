import { describe, expect, it } from 'vitest'
import { bannerHref, liveBanners, orderHomeSections, type HomeBanner, type HomeSection } from './home'

const product = (id: string) => ({ id, title: id })

const section = (key: string, count: number, title = key): HomeSection => ({
  key,
  title,
  products: Array.from({ length: count }, (_, i) => product(`${key}-${i}`)),
})

describe('orderHomeSections', () => {
  it('puts the rails in the decided order whatever order they arrive in', () => {
    const out = orderHomeSections([section('new_arrivals', 2), section('deals', 2), section('best_sellers', 2)])
    expect(out.map((s) => s.key)).toEqual(['deals', 'best_sellers', 'new_arrivals'])
  })

  it('drops a rail with nothing in it', () => {
    const out = orderHomeSections([section('deals', 0), section('best_sellers', 3), section('new_arrivals', 0)])
    expect(out.map((s) => s.key)).toEqual(['best_sellers'])
  })

  it('appends a rail it does not know, after the known ones, in arrival order', () => {
    const out = orderHomeSections([
      section('trending', 1),
      section('new_arrivals', 1),
      section('staff_picks', 1),
      section('deals', 1),
    ])
    expect(out.map((s) => s.key)).toEqual(['deals', 'new_arrivals', 'trending', 'staff_picks'])
  })

  it('answers an empty list for nothing at all', () => {
    expect(orderHomeSections(undefined)).toEqual([])
    expect(orderHomeSections(null)).toEqual([])
    expect(orderHomeSections([])).toEqual([])
  })

  it('tolerates a section whose products field is missing', () => {
    const broken = { key: 'deals', title: 'Deals' } as unknown as HomeSection
    expect(orderHomeSections([broken, section('best_sellers', 1)]).map((s) => s.key)).toEqual(['best_sellers'])
  })
})

const banner = (over: Partial<HomeBanner>): HomeBanner => ({
  id: 'b',
  title: 'Sale',
  target_type: 'search',
  target_id: 'sale',
  position: 0,
  active: true,
  image_url: 'https://cdn/x.jpg',
  ...over,
})

describe('liveBanners', () => {
  it('keeps only active banners that have a picture, in position order', () => {
    const out = liveBanners([
      banner({ id: 'late', position: 5 }),
      banner({ id: 'blank', image_url: '' }),
      banner({ id: 'off', active: false }),
      banner({ id: 'first', position: 1 }),
    ])
    expect(out.map((b) => b.id)).toEqual(['first', 'late'])
  })

  it('is empty for no banners', () => {
    expect(liveBanners(undefined)).toEqual([])
  })
})

describe('bannerHref', () => {
  it('routes each target type inside the zone', () => {
    expect(bannerHref({ target_type: 'product', target_id: 'p1' })).toBe('/products/p1')
    expect(bannerHref({ target_type: 'category', target_id: 'c1' })).toBe('/?category=c1')
    expect(bannerHref({ target_type: 'search', target_id: 'red shoes' })).toBe('/?q=red%20shoes')
    expect(bannerHref({ target_type: 'url', target_id: 'https://x.y/z' })).toBe('https://x.y/z')
    expect(bannerHref({ target_type: 'mystery', target_id: 'q' })).toBe('/')
  })
})
