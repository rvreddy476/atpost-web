"use client"

/**
 * The one client component between the layout and the page.
 *
 * ── Why the layout grew a wrapper ─────────────────────────────────────────
 * Two things needed an owner that is above every route in the zone and below
 * the server layout, and neither could go in either place:
 *
 *   · The composer's OPEN STATE. The button that opens it is in the left rail,
 *     which is inside `AppFrame`, which is in the layout — and the dialog has
 *     to outlive a route change, because closing it by navigating would lose a
 *     half-written post. A server component cannot hold state or pass a
 *     handler, so `onCreatePost` needs a client component to be created in.
 *   · The right rail's "Trending Topics" card. @momentum/chrome owns three
 *     URLs and all three have the viewer as their subject; trending hashtags
 *     are this zone's endpoint, so the card is built here and handed to the
 *     frame as `rightRailExtra`. Its own note carries that argument.
 *
 * ── The viewer is read HERE and not inside the dialog ─────────────────────
 * The optimistic row needs a name and a face, or the post somebody has just
 * written appears at the top of their own feed under a stranger's byline.
 * `useSession()` has the id; `/v1/profiles/me` has the name and the avatar and
 * `AppFrame` already fetches it once for the header and the rail — so rather
 * than making the same request a second time from the dialog, the frame asks
 * for it and this component reads the same one. That is the same discipline
 * `AppFrame`'s own header states: one request for the viewer, not two.
 *
 * ── The children are still the server's ───────────────────────────────────
 * `{children}` arrives as a prop, so the page under this stays a server
 * component and nothing about the route's rendering changes by being wrapped.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { AppFrame, fetchViewerProfile, type ViewerProfile } from "@momentum/chrome"
import { useSession } from "@atpost/api-client/session"
import { avatarSrc } from "@momentum/content"
import { ComposerDialog } from "@/composer/ComposerDialog"
import { TrendingTopics } from "@/feed/TrendingTopics"

/** Where this zone is mounted. The same value axios uses as its baseURL. */
const ZONE = "/social"

export function SocialFrame({ children }: { children: React.ReactNode }) {
  const { signedIn, status: sessionStatus, userId } = useSession()
  const [composerOpen, setComposerOpen] = useState(false)
  const [profile, setProfile] = useState<ViewerProfile | null>(null)

  /**
   * Where focus goes when the dialog closes.
   *
   * It cannot be the rail's button directly — that button is inside
   * `AppFrame`, several components down, and threading a ref through the frame
   * to the rail to the button would be three new props for one restore. So it
   * is the element that had focus when the composer was opened, captured on
   * the press. That is the rail's button when the rail's button opened it, and
   * it is the drawer's when the drawer did.
   *
   * `document.activeElement` is unreliable in exactly one case — Safari does
   * not focus a <button> on press, so it reports <body> — and the consequence
   * here is a no-op restore rather than focus landing somewhere wrong. The
   * drawer's own note takes the other route (a ref to a known trigger) because
   * it HAS one; this one does not, and a no-op on one browser is a smaller
   * cost than three props.
   */
  const triggerRef = useRef<HTMLElement | null>(null)

  const openComposer = useCallback(() => {
    triggerRef.current = (document.activeElement as HTMLElement | null) ?? null
    setComposerOpen(true)
  }, [])

  useEffect(() => {
    if (sessionStatus === "unknown") return
    if (!signedIn) {
      setProfile(null)
      return
    }
    let live = true
    fetchViewerProfile()
      .then((next: ViewerProfile | null) => {
        if (live) setProfile(next)
      })
      .catch(() => {
        // A profile that did not load is a missing NAME, not a missing
        // session. The composer's optimistic row falls back to initials, which
        // is what `Avatar` draws for everybody whose face has not arrived.
      })
    return () => {
      live = false
    }
  }, [signedIn, sessionStatus])

  return (
    <>
      <AppFrame
        basePath={ZONE}
        // Gated on `userId` and NOT on `signedIn`, which is a correction worth
        // recording because the first version had it wrong and the symptom was
        // exactly the fault this whole change is about.
        //
        // The layout seeds `signedIn` from the request's own cookie, so it is
        // true in the first byte of HTML — while `userId` comes from
        // `/v1/auth/me` and is null until that lands. In that window the rail
        // drew a Create Post button and the dialog below, gated on `userId`,
        // rendered nothing: a prominent control that did nothing on press.
        //
        // The dialog genuinely needs the id — the optimistic row's
        // `author_id` is what `isOwnPost` compares — so the fix is for the
        // BUTTON to wait for the same thing the dialog does. Absent, not
        // disabled: it appears when it works.
        onCreatePost={userId ? openComposer : undefined}
        rightRailExtra={<TrendingTopics />}
        // Fetched once, here, and handed down — the frame then does not fetch
        // at all. See `AppFrameProps.viewerProfile`.
        viewerProfile={profile}
      >
        {children}
      </AppFrame>

      {/* `userId` gates the dialog rather than `signedIn`: the optimistic row
          needs an author id and `/v1/auth/me` is what supplies it, so a
          composer opened in the beat before that lands would publish a row
          with an empty `author_id` — which is the field `isOwnPost` compares
          and the one every "your own post" menu depends on. */}
      {userId && (
        <ComposerDialog
          open={composerOpen}
          onClose={() => setComposerOpen(false)}
          returnFocusTo={triggerRef}
          viewer={{
            id: userId,
            displayName: profile?.display_name,
            // `?? undefined`: `avatarSrc` answers null for "there is no face",
            // and `Avatar` takes undefined for the same thing and draws
            // initials. One absent value, not two spellings of it.
            avatarUrl: avatarSrc({ mediaId: profile?.avatar_media_id }, ZONE) ?? undefined,
          }}
        />
      )}
    </>
  )
}
