"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Search } from "lucide-react"
import { COPY } from "@/qa/copy"
import { canSearch } from "@/qa/rules"
import { INPUT } from "./styles"

/** Question search. Submits to `/ask/search?q=`; refuses a query shorter than the server accepts. */
export function SearchBox({ initial = "" }: { initial?: string }) {
  const router = useRouter()
  const [value, setValue] = useState(initial)

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault()
        const q = value.trim()
        if (!canSearch(q)) return
        router.push(`/search?q=${encodeURIComponent(q)}`)
      }}
      className="relative"
    >
      <label htmlFor="ask-search" className="sr-only">
        {COPY.searchHint}
      </label>
      <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mo-body" />
      <input
        id="ask-search"
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={COPY.searchHint}
        className={`${INPUT} h-11 pl-9`}
        enterKeyHint="search"
      />
    </form>
  )
}
