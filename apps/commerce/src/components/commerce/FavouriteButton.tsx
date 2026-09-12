"use client"

import { Heart } from "lucide-react"
import { useToggleFavourite } from "@/hooks/useCommerce"
import { isFavourited } from "@/lib/favourites"
import type { ProductCardData } from "./ProductGrid"

/**
 * The heart. On a card it sits on the plate's top-right corner; on the detail
 * page it sits beside the title. Same button, same rule: press it and the
 * heart fills NOW, and un-fills again only if the server refuses.
 *
 * Filled hearts are ember. Not gold: gold in this zone means money, and
 * wanting something is not yet paying for it. The filled glyph is a non-text
 * mark, so ember's 4.03 on the ground is enough for it.
 */
export function FavouriteButton({ product, size = 18, className }: {
  product: ProductCardData
  size?: number
  className?: string
}) {
  const toggle = useToggleFavourite()
  const on = isFavourited(product)
  return (
    <button
      type="button"
      className={["fav-btn", on ? "is-on" : "", className ?? ""].filter(Boolean).join(" ")}
      aria-pressed={on}
      aria-label={on ? `Remove ${product.title} from favourites` : `Add ${product.title} to favourites`}
      title={on ? "Remove from favourites" : "Add to favourites"}
      onClick={(event) => {
        // The heart lives inside a card that is itself a link.
        event.preventDefault()
        event.stopPropagation()
        toggle.mutate({ product, isFavourite: !on })
      }}
    >
      <Heart size={size} aria-hidden="true" fill={on ? "currentColor" : "none"} />
    </button>
  )
}
