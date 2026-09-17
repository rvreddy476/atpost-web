import type { Metadata } from "next"
import { Suspense } from "react"
import { SearchScreen } from "@/home/SearchScreen"
import { ListSkeleton } from "@/ui/states"

export const metadata: Metadata = { title: "Search" }

/** `/ask/search?q=` — useSearchParams needs a Suspense boundary to build. */
export default function SearchPage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <SearchScreen />
    </Suspense>
  )
}
