// The landing page's non-React half: what `GET /v1/commerce/home` sends and
// the order the founder decided it is shown in.
//
// Pure, so the two rules the page can get wrong on its own (which rail comes
// first, and what happens to a rail with nothing in it) are testable without
// a query client or a fetch.

import type { ProductCardData } from '@/components/commerce/ProductGrid'

/** One merchandising card, as commerce-service's banner rail sends it. */
export interface HomeBanner {
  id: string
  title: string
  subtitle?: string | null
  image_media_id?: string | null
  /** Resolved by the server in one media batch. Empty when it could not be. */
  image_url?: string
  /** `product` | `category` | `url` | `search`: what tapping the card opens. */
  target_type: string
  target_id: string
  position: number
  active: boolean
}

/** One horizontal rail. `key` is the server's stable name; `title` is copy. */
export interface HomeSection {
  key: string
  title: string
  products: ProductCardData[]
}

export interface HomePage {
  banners: HomeBanner[]
  sections: HomeSection[]
}

/**
 * The decided order of the rails: deals, then best sellers, then what is new.
 *
 * The server sends them in this order today, but the order is a merchandising
 * decision made on this side of the wire, not a property of the response, so
 * it is written down here rather than trusted. A rail the server adds later
 * and this list does not know about is appended after the known ones instead
 * of being dropped: an unknown section is still stock somebody chose to show.
 */
export const HOME_SECTION_ORDER = ['deals', 'best_sellers', 'new_arrivals'] as const

/**
 * The rails in the decided order, with the empty ones gone.
 *
 * A section with no products is not "a section that happens to be empty"; it
 * is a heading over a blank strip, which reads as a failed load. The server
 * already omits them (see commerce-service's buildHomeSections) and this
 * drops them again, because a page that renders whatever it is given must not
 * depend on the sender remembering to be tidy.
 */
export function orderHomeSections(sections: readonly HomeSection[] | null | undefined): HomeSection[] {
  if (!sections) return []
  const rank = (key: string) => {
    const at = (HOME_SECTION_ORDER as readonly string[]).indexOf(key)
    return at === -1 ? HOME_SECTION_ORDER.length : at
  }
  return sections
    .filter((section) => Array.isArray(section.products) && section.products.length > 0)
    .map((section, index) => ({ section, index }))
    .sort((a, b) => rank(a.section.key) - rank(b.section.key) || a.index - b.index)
    .map(({ section }) => section)
}

/**
 * The banners the carousel can actually draw: active, with a picture, in
 * merchandiser order. A banner without a resolved image is a blank card with a
 * title on it, and a blank card in a carousel of photographs is worse than one
 * fewer slide.
 */
export function liveBanners(banners: readonly HomeBanner[] | null | undefined): HomeBanner[] {
  if (!banners) return []
  return banners
    .filter((banner) => banner.active !== false && !!banner.image_url)
    .slice()
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
}

/**
 * Where a banner goes when it is tapped. Relative to the zone, so `next/link`
 * resolves it under `/shop`; an external `url` target is returned as-is.
 */
export function bannerHref(banner: Pick<HomeBanner, 'target_type' | 'target_id'>): string {
  switch (banner.target_type) {
    case 'product':
      return `/products/${encodeURIComponent(banner.target_id)}`
    case 'category':
      return `/?category=${encodeURIComponent(banner.target_id)}`
    case 'search':
      return `/?q=${encodeURIComponent(banner.target_id)}`
    case 'url':
      return banner.target_id
    default:
      return '/'
  }
}
