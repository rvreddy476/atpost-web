/**
 * The byline on a question, answer or comment.
 *
 * The name comes from `byline()` — "Anonymous" from the flag only, "Member"
 * for a named post whose author could not be looked up. The author id is
 * never drawn and never linked: on an anonymous post it is the masked empty
 * UUID, which is not a person. The author of an anonymous post sees a
 * "Posted anonymously" marker, because the post is theirs.
 */
import { EyeOff } from "lucide-react"
import { Avatar, relativeTime } from "@momentum/content"
import { byline, showsPostedAnonymously } from "@/qa/byline"
import { COPY } from "@/qa/copy"
import type { QAAuthor } from "@/qa/wire"

export interface BylineProps {
  isAnonymous: boolean
  author: QAAuthor | null
  authorId: string
  viewerId: string | null
  createdAt?: string
  size?: "sm" | "md"
  /** Rendered after the time, e.g. a "Best answer" badge. */
  extra?: React.ReactNode
}

export function Byline({ isAnonymous, author, authorId, viewerId, createdAt, size = "sm", extra }: BylineProps) {
  const name = byline(isAnonymous, author)
  const mine = showsPostedAnonymously({ is_anonymous: isAnonymous, author_id: authorId }, viewerId)
  const avatarKey = isAnonymous ? undefined : author?.user_id || undefined

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      <Avatar name={isAnonymous ? "?" : name} id={avatarKey} size={size} />
      <span className="truncate font-semibold text-mo-ink">{name}</span>
      {mine ? (
        <span className="inline-flex items-center gap-1 rounded-mo-pill border border-mo px-2 py-0.5 text-xs font-semibold text-mo-purple">
          <EyeOff aria-hidden="true" className="h-3 w-3" />
          {COPY.postedAnonymously}
        </span>
      ) : null}
      {createdAt ? (
        <time dateTime={createdAt} className="text-mo-body">
          {relativeTime(createdAt)}
        </time>
      ) : null}
      {extra}
    </div>
  )
}
