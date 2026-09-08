/**
 * @momentum/content — the post card, media, the pager, and the states.
 *
 *   import { PostCard, InfiniteFeed, FeedSkeleton } from "@momentum/content"
 *
 * The boundary: everything here is presentation. It composes @momentum/player
 * and @momentum/interactions — both of which are also network-free — and takes
 * data and handlers from the zone. That is what makes a profile grid or a
 * search result page able to render the same card without inheriting the
 * feed's fetching, and what makes the blurhash decoder testable as arithmetic
 * rather than as a screenshot.
 */
export { PostCard } from "./PostCard"
export type { PostCardHandlers, PostCardProps } from "./PostCard"

export { MediaFrame, PostMedia } from "./PostMedia"
export type { PostMediaProps } from "./PostMedia"

/**
 * The multi-page media frame, and its arithmetic.
 *
 * Exported on its own so reels, tube and a profile grid get a carousel without
 * inheriting the feed card around it — which is why it lives in this package
 * rather than in apps/social.
 */
export { PostCarousel } from "./PostCarousel"
export type { PostCarouselProps } from "./PostCarousel"
export {
  carouselLabel,
  dragTarget,
  isPageActive,
  isPageRendered,
  keyTarget,
  pageFromScroll,
  pillLabel,
  slideLabel,
} from "./carousel"

/**
 * The comment surface, and the overflow menu.
 *
 * Both exported on their own for the same reason PostCarousel is: reels, tube
 * and a post detail page need a comment sheet and a "more" menu without
 * inheriting a feed card around them. Both are prop-driven and reach no
 * network — `CommentApi` is two functions the ZONE supplies, because this
 * package may not import api-client and the paths under `/v1/posts` and
 * `/v1/comments` are the zone's business. The contract those functions have to
 * satisfy is written out at the top of `comments.ts`.
 */
export { CommentSheet } from "./CommentSheet"
export type { CommentSheetProps } from "./CommentSheet"
export {
  COMMENT_PAGE_MAX,
  QUICK_REACTIONS,
  canSend,
  commentAuthorName,
  commentErrorMessage,
  mergeComments,
} from "./comments"
export type { CommentApi, CommentAuthor, CommentPage, CommentRow } from "./comments"

export { PostOverflowMenu } from "./PostOverflowMenu"
export type { PostOverflowMenuProps } from "./PostOverflowMenu"
export {
  REPORT_REASONS,
  analyticsReasonFor,
  postMenuGroups,
  reportNeedsDetails,
  saveLabel,
} from "./postMenu"
export type { PostMenuInput, PostMenuRow, PostMenuRowId, ReportReason } from "./postMenu"

export { InfiniteFeed } from "./InfiniteFeed"
export type { InfiniteFeedProps } from "./InfiniteFeed"

export { FeedEmpty, FeedEnd, FeedError, FeedSkeleton } from "./states"

export { useDwellTracker } from "./useDwellTracker"
export type { DwellTracker } from "./useDwellTracker"

export { Avatar } from "./Avatar"
export type { AvatarProps } from "./Avatar"

export { BlurhashCanvas } from "./BlurhashCanvas"
export { blurhashAverageColor, decodeBlurhash, isValidBlurhash } from "./blurhash"

export { aspectRatio, earliestExpiry, isExpired, pickImage, pickThumb } from "./variants"
export { absoluteTime, formatDuration, relativeTime } from "./relativeTime"
