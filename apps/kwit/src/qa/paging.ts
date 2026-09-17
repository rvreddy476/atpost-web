/** Offset paging over qa-service listings. Pure. */
import { PAGE_SIZE } from "./rules"
import type { AskQuestionSummary } from "./wire"

/** The next offset when a page came back full, else the end. */
export function nextOffset(lastPage: readonly unknown[], allPages: readonly (readonly unknown[])[]): number | undefined {
  return lastPage.length < PAGE_SIZE ? undefined : allPages.reduce((n, page) => n + page.length, 0)
}

/** Flattens pages, dropping a question a later page repeats (offset paging over a moving list). */
export function flattenPages(pages: readonly (readonly AskQuestionSummary[])[] | undefined): AskQuestionSummary[] {
  const seen = new Set<string>()
  const out: AskQuestionSummary[] = []
  for (const page of pages ?? []) {
    for (const q of page) {
      if (seen.has(q.id)) continue
      seen.add(q.id)
      out.push(q)
    }
  }
  return out
}
