"use client"

/**
 * Who you are, and where you can go.
 *
 * ── Two sources, because they answer different questions ──────────────────
 * `useSession()` owns "is anyone signed in, and which account" — it reads the
 * presence cookie and `GET /v1/auth/me`, and the layout seeds it from the
 * request's own cookies so this rail is the right SHAPE in the first byte of
 * HTML rather than one effect later. What it does not carry is a name: /me is
 * identity (id, email, roles, account status) and has no display name, no
 * avatar and no counts in it at all. Those come from `/v1/profiles/me`, which
 * is fetched once by the frame and handed down — see ./AppFrame.
 *
 * So the rail renders in two beats and neither of them is wrong: the account
 * appears immediately with its email, and the name and the counts fill in when
 * the profile lands. That is the same trade `session.tsx` makes for the whole
 * app, and it is what removes the layout jump.
 *
 * ── Sticky, and scrollable on its own ─────────────────────────────────────
 * `top-14` is the header's height, so the rail parks directly under it. Its
 * own `overflow-y-auto` matters more than it looks: without it, a rail taller
 * than the window can never reach its own bottom rows, because a sticky
 * element does not scroll with the page once it has stuck.
 */

import { Smartphone } from "lucide-react"
import { BRAND } from "@momentum/brand"
import { useSession } from "@atpost/api-client/session"
import { Avatar } from "@momentum/content"
import { APP_ONLY_REASON, DESTINATIONS, isActionable } from "./destinations"
import { RailNavItem } from "./NavItem"
import type { ViewerProfile } from "./api"

/**
 * A plain constant rather than `useId()`, because every phone-marked row in
 * the list points `aria-describedby` at it and there is exactly one rail on
 * the page. `useId()` would be the right answer for a component that can
 * appear twice; this one cannot, and a generated id would have to be threaded
 * through props to reach the rows anyway.
 */
const APP_ONLY_ID = "mo-rail-app-only"

/** How many rows the web cannot open. Decides whether the note is shown. */
const appOnlyCount = DESTINATIONS.filter((d) => !isActionable(d)).length

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0">
      {/* A count is display type, so it is set in the display face and large
          enough that the eye lands on the number rather than the word. */}
      <p className="font-mo-display text-base font-semibold tabular-nums text-mo-ink">
        {value.toLocaleString()}
      </p>
      <p className="truncate text-xs text-mo-body">{label}</p>
    </div>
  )
}

export function LeftRail({
  profile,
  currentId,
}: {
  profile: ViewerProfile | null
  currentId: string | null
}) {
  const { signedIn, user } = useSession()

  return (
    <aside
      aria-label="You and your destinations"
      className="sticky top-14 hidden max-h-[calc(100vh-3.5rem)] overflow-y-auto py-5 pr-2 lg:block"
    >
      {signedIn ? (
        <section className="rounded-mo border border-mo bg-mo-surface p-4 shadow-mo">
          <div className="flex items-center gap-3">
            <Avatar name={profile?.display_name} id={user?.id} />
            <div className="min-w-0">
              <p className="truncate font-semibold text-mo-ink">
                {/* The email is not a placeholder for the name, it is the other
                    true thing we have until the profile lands. */}
                {profile?.display_name || user?.email || "Your account"}
              </p>
              {profile?.bio ? (
                <p className="truncate text-xs text-mo-body">{profile.bio}</p>
              ) : (
                <p className="truncate text-xs text-mo-body">On {BRAND.name}</p>
              )}
            </div>
          </div>

          {profile && (
            <div className="mt-4 grid grid-cols-3 gap-2 border-t border-mo pt-3">
              <Stat label="Posts" value={profile.post_count} />
              <Stat label="Followers" value={profile.follower_count} />
              <Stat label="Friends" value={profile.friend_count} />
            </div>
          )}
        </section>
      ) : (
        <section className="rounded-mo border border-mo bg-mo-surface p-4 shadow-mo">
          <p className="font-semibold text-mo-ink">You are signed out</p>
          <p className="mt-1 text-sm text-mo-body">
            Sign in to see your feed and the people you follow.
          </p>
          <a
            href="/login?redirect=%2Fsocial"
            className="mt-3 inline-block rounded-mo-pill border border-mo-strong px-4 py-2 text-sm font-semibold text-mo-cyan transition-colors duration-150 ease-mo hover:bg-mo-raised"
          >
            Sign in
          </a>
        </section>
      )}

      <nav aria-label="Destinations" className="mt-4">
        <ul className="space-y-0.5">
          {DESTINATIONS.map((destination) => (
            <RailNavItem
              key={destination.id}
              destination={destination}
              current={destination.id === currentId}
              reasonId={APP_ONLY_ID}
            />
          ))}
        </ul>
        {/* One note for every phone-marked row, exactly as RoleSwitcher does
            it — and rendered only when there is a row that needs it, so the
            day Reels and Tube get web zones this sentence disappears on its
            own rather than becoming a lie nobody noticed. */}
        {appOnlyCount > 0 && (
          <p
            id={APP_ONLY_ID}
            className="mt-3 flex items-start gap-2 border-t border-mo px-3 pt-3 text-xs leading-snug text-mo-body"
          >
            <Smartphone aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-mo-muted-lg" />
            <span>{APP_ONLY_REASON}</span>
          </p>
        )}
      </nav>

      <p className="mt-5 px-3 text-xs text-mo-body">
        One {BRAND.name} account, every part of the platform.
      </p>
    </aside>
  )
}
