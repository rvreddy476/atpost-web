/**
 * Who a post is by, as the reader sees it. Mirrors Android's QaRules.byline.
 *
 * "Anonymous" is decided by the FLAG and only by the flag. A missing author
 * means the server could not look the name up, and calling that post
 * anonymous would misstate the one attribute Ask must never get wrong. A named
 * post with no author reads "Member".
 */
import { EMPTY_UUID, type QAAuthor } from "./wire"

export const ANONYMOUS_AUTHOR = "Anonymous"
export const UNKNOWN_AUTHOR = "Member"

export function byline(isAnonymous: boolean, author: QAAuthor | null | undefined): string {
  if (isAnonymous) return ANONYMOUS_AUTHOR
  const name = author?.display_name?.trim()
  if (name) return name
  const handle = author?.username?.trim()
  if (handle) return `@${handle}`
  return UNKNOWN_AUTHOR
}

/** A real user id, i.e. neither blank nor the masked empty UUID. */
export function isRealUserId(id: string | null | undefined): id is string {
  return !!id && id !== EMPTY_UUID
}

/** The reader wrote this post. Anonymous posts carry the author's id only for the author. */
export function isOwnPost(authorId: string | null | undefined, viewerId: string | null | undefined): boolean {
  return isRealUserId(authorId) && isRealUserId(viewerId) && authorId === viewerId
}

/** Show "Posted anonymously" to the author of an anonymous post, and to nobody else. */
export function showsPostedAnonymously(
  post: { is_anonymous: boolean; author_id: string },
  viewerId: string | null | undefined,
): boolean {
  return post.is_anonymous && isOwnPost(post.author_id, viewerId)
}

/** A profile handle to link to, or null — never for anonymous posts or the masked id. */
export function authorHandle(isAnonymous: boolean, author: QAAuthor | null | undefined): string | null {
  if (isAnonymous) return null
  const handle = author?.username?.trim()
  return handle ? handle : null
}
