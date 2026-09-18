"use client"

/**
 * `/tube/explore` — the whole taxonomy, one card per topic.
 *
 * `GET /v1/posts/categories` is the list and `?category=<slug>` is what it
 * drives, on the same call the home grid makes. Both are PUBLIC, so this page
 * works signed out, which is the point of it existing at all: the chip rail on
 * Home is a horizontal scroller that shows four or five topics at a time, and
 * a person who does not know what this platform HAS cannot discover it through
 * a control they have to drag.
 *
 * ── What this page is NOT ─────────────────────────────────────────────────
 * It is not Podcasts / Movies / Music / Gaming. Those are four rows in
 * YouTube's rail and four separate corpora on YouTube's server. Here the whole
 * taxonomy is one flat list of slugs — `comedy`, `music`, `dance`, `food`,
 * `travel`, `sports`, … — so a page with four invented tabs over it would be
 * four names for the same query. ../chrome/rail.ts records the same decision
 * where the rows would have gone.
 *
 * ── Picking a topic goes HOME, not to a page of its own ───────────────────
 * `/tube?category=comedy` rather than `/tube/explore/comedy`. Three reasons,
 * and the third is the one that decides it:
 *
 *   · the home grid already does this, with the chip rail showing which topic
 *     is selected and offering every other one beside it. A second grid would
 *     be a second implementation of the same query with a worse control.
 *   · a person who lands on a topic wants to change it, and on Home they can.
 *   · the chip rail is where the selected state LIVES. A dedicated page would
 *     have to hold the same state twice and they would drift.
 *
 * So this page is a menu and Home is the meal. ./useExploreRoute.ts is not a
 * file: the home page reads `?category=` itself.
 */

import Link from "next/link"
import { Compass } from "lucide-react"
import { useCategories } from "@/browse/TubeCategories"
import { EmptyCard, PageHeader } from "@/browse/states"

/**
 * A topic tile's ground, cycling through four surfaces.
 *
 * Not a random colour per topic and not a gradient per topic: both mean the
 * same topic looks different on two visits, or that a new slug from the server
 * gets a colour nobody chose. Four tokens in a fixed rotation is stable — the
 * third topic is always the third surface — and every one of them carries
 * --mo-ink at AAA, which is the property that matters. The same reasoning
 * @momentum/content's Avatar applies to its initial tiles.
 */
const SURFACES = ["bg-mo-surface", "bg-mo-raised", "bg-mo-sunken", "bg-mo-overlay"] as const

export function TubeExplore() {
  const categories = useCategories()

  return (
    <div>
      <PageHeader
        title="Explore"
        lede="Every topic on Momentum Tube. Pick one and the home grid narrows to it."
      />

      {categories.length === 0 ? (
        /* `useCategories` treats a failed request and an empty taxonomy
           identically — it is a narrowing of something already on screen, and
           it swallows the error. That is right for the chip rail on Home and
           it is why this page cannot tell the two apart either, so the
           sentence covers both without claiming which. */
        <EmptyCard
          icon={Compass}
          title="No topics to show"
          body="The topic list could not be read just now. Everything on Momentum Tube is still on the home page."
        />
      ) : (
        <ul
          aria-label="Topics"
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5"
        >
          {categories.map((category, at) => (
            <li key={category.id}>
              {/* Inside the zone, so `next/link` and a zone-relative href —
                  Next adds the basePath itself, and "/tube?category=" here
                  would ask for "/tube/tube". */}
              <Link
                href={`/?category=${encodeURIComponent(category.id)}`}
                className={[
                  "flex h-24 items-end rounded-mo border border-mo p-4",
                  SURFACES[at % SURFACES.length],
                  "transition-colors duration-150 ease-mo hover:border-mo-strong",
                  "outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-mo",
                ].join(" ")}
              >
                <span className="font-mo-display text-base font-semibold tracking-mo-display text-mo-ink">
                  {category.label}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
