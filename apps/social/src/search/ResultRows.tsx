"use client"

/**
 * A person, and a tag — the two result kinds that are not posts.
 *
 * Both are rendered the way `NavItem.tsx` and `RoleSwitcher.tsx` render a
 * destination the web cannot open, and for the same reasons written down
 * there:
 *
 *   · `role="link"` with `aria-disabled="true"` and `tabIndex={0}`, never the
 *     `disabled` attribute. `disabled` takes the control out of the focus
 *     order, so the explanation is announced to nobody — which is the silent
 *     drop again, aimed precisely at the people who most need telling.
 *   · The reason reaches a screen reader through `aria-describedby`, pointing
 *     at ONE note under the list rather than being repeated on every row. A
 *     sighted reader gets the same information from the phone glyph plus that
 *     note; nobody is left guessing either way.
 *   · No `href`. The branch that would render an anchor does not exist in this
 *     file, which is what makes "never a link to nowhere" a property rather
 *     than a promise.
 */

import { Hash, Lock, Smartphone } from "lucide-react"
import { Avatar } from "@momentum/content"
import { hashtagLabel, personHandle, personName } from "./contract"
import type { SearchHashtagRow, SearchUserRow } from "./contract"
import { HASHTAG_DESTINATION, PERSON_DESTINATION } from "./destinations"

/**
 * The shared note the rows point at.
 *
 * Rendered visibly, not `sr-only`: unlike the header's icon strip there is
 * room for it here, and a sighted reader who sees a row that does not respond
 * to a click deserves the same sentence a screen-reader user is given.
 */
export function UnreachableNote({ id, reason }: { id: string; reason: string }) {
  return (
    <p id={id} className="flex items-center gap-2 px-1 pt-2 text-xs text-mo-body">
      <Smartphone aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
      {reason}
    </p>
  )
}

/** The frame both rows share, so they cannot drift apart. */
function Row({
  children,
  describedBy,
}: {
  children: React.ReactNode
  describedBy: string
}) {
  return (
    <li>
      <span
        role="link"
        aria-disabled="true"
        tabIndex={0}
        aria-describedby={describedBy}
        className="flex w-full cursor-default items-center gap-3 rounded-mo border border-mo bg-mo-surface p-4 shadow-mo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mo"
      >
        {children}
      </span>
    </li>
  )
}

/**
 * One person.
 *
 * ── The avatar is initials, and that is the SERVICE's doing here ──────────
 * `Avatar` takes a `src` and would draw a real picture. The people rows in the
 * grouped response have no `avatar_url` on them: results.go hydrates avatars
 * for post AUTHORS and for the older `?type=` branch, and does not for the
 * `users` bucket of the grouped one. So there is no URL to pass, and initials
 * are what is left. (Reported; it is a service-side gap, not a component one.)
 *
 * ── The lock is not a filter ──────────────────────────────────────────────
 * `is_private` is a DISPLAY flag. search-service says so explicitly: private
 * accounts stay searchable on purpose, and the flag exists so a client can
 * draw the lock rather than pretend the account is not there. Drawing it is
 * the whole point of it being sent.
 */
export function PersonRow({ user, describedBy }: { user: SearchUserRow; describedBy: string }) {
  const name = personName(user)
  const handle = personHandle(user)

  return (
    <Row describedBy={describedBy}>
      <Avatar name={name} id={user.user_id} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="min-w-0 truncate font-semibold text-mo-ink">{name}</span>
          {user.is_private && (
            <>
              {/* Purple is presence — "this account is closed" is a state of
                  the person, not an error and not an action. 3.87 on a card,
                  over the 3.0 bar this glyph is held to as a non-text mark. */}
              <Lock aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-mo-purple" />
              <span className="sr-only">Private account</span>
            </>
          )}
        </span>
        {/* Only when there is one. Most rows in this corpus index with an
            empty username, and a bare "@" under a name is the exact failure
            `personHandle` exists to prevent. */}
        {handle && <span className="block truncate text-sm text-mo-body">{handle}</span>}
        {user.bio && <span className="mt-0.5 block truncate text-sm text-mo-body">{user.bio}</span>}
      </span>
      <Smartphone aria-hidden="true" className="h-4 w-4 shrink-0 text-mo-muted-lg" />
    </Row>
  )
}

/**
 * One hashtag.
 *
 * `use_count` is printed because it is the only thing that distinguishes one
 * tag row from another, and it is printed as "N posts" rather than a bare
 * number so it cannot be read as a rank.
 */
export function HashtagRow({ tag, describedBy }: { tag: SearchHashtagRow; describedBy: string }) {
  const uses = tag.use_count ?? 0
  return (
    <Row describedBy={describedBy}>
      <span
        aria-hidden="true"
        className="grid h-10 w-10 shrink-0 place-items-center rounded-mo-pill bg-mo-raised text-mo-ink ring-1 ring-mo"
      >
        <Hash className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold text-mo-ink">{hashtagLabel(tag)}</span>
        <span className="block text-sm text-mo-body">
          {uses === 1 ? "1 post" : `${uses.toLocaleString()} posts`}
        </span>
      </span>
      <Smartphone aria-hidden="true" className="h-4 w-4 shrink-0 text-mo-muted-lg" />
    </Row>
  )
}

/** A list of people, with the one note they all point at. */
export function PeopleList({ users, noteId }: { users: SearchUserRow[]; noteId: string }) {
  return (
    <>
      <ul className="space-y-2">
        {users.map((user) => (
          <PersonRow key={user.user_id} user={user} describedBy={noteId} />
        ))}
      </ul>
      <UnreachableNote id={noteId} reason={PERSON_DESTINATION.unavailableReason as string} />
    </>
  )
}

/** A list of tags, with the one note they all point at. */
export function HashtagList({ tags, noteId }: { tags: SearchHashtagRow[]; noteId: string }) {
  return (
    <>
      <ul className="space-y-2">
        {tags.map((tag) => (
          <HashtagRow key={tag.hashtag} tag={tag} describedBy={noteId} />
        ))}
      </ul>
      <UnreachableNote id={noteId} reason={HASHTAG_DESTINATION.unavailableReason as string} />
    </>
  )
}
