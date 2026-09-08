/**
 * @momentum/interactions — like, comment, share, save, follow.
 *
 *   import { ActionBar, FollowButton } from "@momentum/interactions"
 *
 * The shared social graph the founder named: the one thing reels, tube and the
 * feed must not each reimplement. It takes handlers and current state, renders
 * the bar, and does the optimistic update AND the rollback — with the failure
 * visible, because a rollback nobody is told about is worse than no optimism
 * at all. There is no network in this package.
 */
export { ActionBar } from "./ActionBar"
export type { ActionBarProps } from "./ActionBar"

export { FollowButton } from "./FollowButton"
export type { FollowButtonProps, FollowState } from "./FollowButton"

export { useOptimisticToggle } from "./useOptimisticToggle"
export type { OptimisticToggle, ToggleResult, ToggleState } from "./useOptimisticToggle"
