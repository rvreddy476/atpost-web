import { ImageOff } from "lucide-react"

export interface ProductPhotoProps {
  src?: string | null
  alt: string
  /** Squeeze the padding — used for thumbnails and the hero feature. */
  tight?: boolean
  /** Rendered top-left, on the plate. Navy pill, gold type. */
  badge?: React.ReactNode
  priority?: boolean
  className?: string
}

/**
 * One product photograph, on its plate.
 *
 * Every catalogue image in the shop goes through here so the treatment is
 * identical everywhere: same square ratio, same padding, same lit rim — see
 * the `.photo-plate` block in globals.css for why a dark storefront needs it.
 * Missing images get the same plate with a muted mark rather than a hole in
 * the layout, which is what keeps a sparse catalogue looking deliberate.
 */
export function ProductPhoto({ src, alt, tight, badge, priority, className }: ProductPhotoProps) {
  const classes = ["photo-plate", tight && "photo-plate--tight", className].filter(Boolean).join(" ")
  return (
    <div className={classes}>
      {badge}
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} loading={priority ? "eager" : "lazy"} decoding="async" />
      ) : (
        <span className="photo-plate-empty">
          <ImageOff size={22} aria-hidden="true" />
          No image
        </span>
      )}
    </div>
  )
}
