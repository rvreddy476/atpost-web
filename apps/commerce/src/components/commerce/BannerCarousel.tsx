"use client"

import Link from "next/link"
import { useRef } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { bannerHref, type HomeBanner } from "@/lib/home"

/**
 * The offers rail: the merchandiser's banners, in their order, one wide card
 * at a time.
 *
 * Scroll-snap and two buttons rather than a timer. Nothing on this page
 * moves by itself: an auto-advancing carousel on a shop is the thing people
 * reach to stop, and it is the thing a screen reader cannot follow. The
 * buttons scroll by one card, and the track is a plain horizontal scroller
 * for anyone who would rather drag.
 *
 * Renders nothing for no banners. The caller has already filtered to live
 * ones with a picture (see lib/home.ts), and an empty section is hidden
 * rather than shown as a heading over nothing.
 */
export function BannerCarousel({ banners }: { banners: HomeBanner[] }) {
  const track = useRef<HTMLDivElement>(null)
  if (banners.length === 0) return null

  const scrollBy = (direction: 1 | -1) => {
    const el = track.current
    if (!el) return
    const card = el.querySelector<HTMLElement>(".banner-card")
    el.scrollBy({ left: direction * ((card?.offsetWidth ?? el.clientWidth) + 14), behavior: "smooth" })
  }

  return (
    <section className="banner-carousel" aria-label="Offers">
      <div className="banner-track" ref={track}>
        {banners.map((banner) => (
          <Link key={banner.id} href={bannerHref(banner)} className="banner-card">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={banner.image_url} alt="" loading="lazy" decoding="async" />
            <span className="banner-copy">
              <strong>{banner.title}</strong>
              {banner.subtitle ? <span>{banner.subtitle}</span> : null}
            </span>
          </Link>
        ))}
      </div>
      {banners.length > 1 ? (
        <>
          <button type="button" className="banner-nav banner-nav--prev" aria-label="Previous offer" onClick={() => scrollBy(-1)}>
            <ChevronLeft size={20} aria-hidden="true" />
          </button>
          <button type="button" className="banner-nav banner-nav--next" aria-label="Next offer" onClick={() => scrollBy(1)}>
            <ChevronRight size={20} aria-hidden="true" />
          </button>
        </>
      ) : null}
    </section>
  )
}
