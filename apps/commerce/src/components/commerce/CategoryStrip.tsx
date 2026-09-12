"use client"

import Link from "next/link"
import { useState } from "react"
import { Tag } from "lucide-react"
import { mediaUrl } from "@/lib/media"
import type { Category } from "@/hooks/useCommerce"

/**
 * One round category chip, as the phone's strip draws them: the artwork,
 * the name, the live count.
 *
 * `image_url` first, resolved by the server; the media id only as a fallback
 * for a response that predates the resolved fields. A category with nothing
 * in it is DIMMED rather than hidden: the strip is the shop's table of
 * contents, and a table of contents that omits empty chapters looks like a
 * shorter book. It still opens, onto a page that says nothing is listed yet.
 */
function CategoryChip({ category }: { category: Category }) {
  const count = category.product_count ?? 0
  const [artFailed, setArtFailed] = useState(false)
  const src = category.thumbnail_url || category.image_url
    || (category.image_media_id ? mediaUrl(category.image_media_id, { width: 144 }) : null)
  const showArt = !!src && !artFailed
  return (
    <Link
      href={`/?category=${encodeURIComponent(category.id)}`}
      className={`category-chip${count ? "" : " is-empty"}`}
      aria-label={`${category.name}, ${count ? `${count} ${count === 1 ? "product" : "products"}` : "coming soon"}`}
    >
      <span className="category-chip-art">
        {showArt
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={src} alt="" loading="lazy" decoding="async" onError={() => setArtFailed(true)} />
          : <Tag size={22} aria-hidden="true" />}
      </span>
      <strong>{category.name}</strong>
      <small>{count ? `${count} ${count === 1 ? "item" : "items"}` : "Coming soon"}</small>
    </Link>
  )
}

/** The horizontal strip under the search. Hidden when there is nothing to show. */
export function CategoryStrip({ categories }: { categories: Category[] }) {
  if (categories.length === 0) return null
  return (
    <nav className="category-strip" aria-label="Shop by category">
      {categories.map((category) => <CategoryChip key={category.id} category={category} />)}
    </nav>
  )
}
