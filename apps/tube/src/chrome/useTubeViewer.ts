"use client"

/**
 * Everything the shell knows about the viewer, fetched once for the whole app.
 *
 * ── Three requests here, and not three per component ──────────────────────
 * The top bar wants a display name, the profile menu wants the viewer's own
 * channel, and the rail wants both plus the channels they subscribe to. Three
 * components each calling their own hook is how a page ends up making the same
 * request twice on every mount — the session's own `/me` is deduped by a
 * module-level in-flight promise for exactly that reason, and this is the
 * cheaper version of the same discipline. @momentum/chrome's AppFrame does it
 * this way too, with one request; this shell needs three, which makes the
 * argument stronger rather than weaker.
 *
 * ── Each one fails alone ──────────────────────────────────────────────────
 * A profile that did not load is a missing NAME, not a missing session: the
 * menu already has the email from `useSession()` and blanking it over a failed
 * side request would be a bigger lie than the gap. A channel lookup that
 * failed leaves "Your videos" dark with the reason it already carries. A
 * subscribed-channel list that failed leaves the rail's channel section empty
 * with the sentence it already has. None of the three can take the
 * application down, which is the property that matters for a SHELL — the
 * chrome must survive its own optional data.
 *
 * ── Nothing is asked for while signed out ─────────────────────────────────
 * `/v1/profiles/me`, `/v1/channels/me` and the Following feed are all 401 for
 * an anonymous browser. Asking anyway would put three guaranteed failures in
 * the console on every signed-out page load, which is how a real error stops
 * being noticed.
 */

import { useEffect, useState } from "react"
import { useSession } from "@atpost/api-client/session"
import type { ChannelRef, TubeChannel } from "@/tube/channels"
import { channelRef } from "@/tube/channels"
import {
  fetchOwnChannel,
  fetchSubscribedChannels,
} from "@/tube/channelApi"
import api from "@atpost/api-client"

interface ViewerProfileRow {
  user_id: string
  display_name: string
}

export interface TubeViewer {
  displayName: string | null
  ownChannel: TubeChannel | null
  /** The handle (or id) to address the viewer's own channel by, or null. */
  ownChannelRef: string | null
  channels: ChannelRef[]
  channelsLoading: boolean
}

export function useTubeViewer(): TubeViewer {
  const { signedIn, status, user } = useSession()
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [ownChannel, setOwnChannel] = useState<TubeChannel | null>(null)
  const [channels, setChannels] = useState<ChannelRef[]>([])
  const [channelsLoading, setChannelsLoading] = useState(false)

  useEffect(() => {
    // "unknown" is the beat before the session has read its own cookie. Not
    // the same as signed out, and firing here would race the refresh.
    if (status === "unknown") return
    if (!signedIn) {
      setDisplayName(null)
      setOwnChannel(null)
      setChannels([])
      setChannelsLoading(false)
      return
    }

    let live = true
    setChannelsLoading(true)

    api
      .get<{ data?: ViewerProfileRow }>("/v1/profiles/me")
      .then((res) => {
        if (live) setDisplayName(res.data?.data?.display_name?.trim() || null)
      })
      .catch(() => {
        /* A missing name, not a missing session. See the header. */
      })

    fetchOwnChannel()
      .then((channel) => {
        if (live) setOwnChannel(channel)
      })
      .catch(() => {
        /* "Your videos" stays dark with the reason it already carries. */
      })

    fetchSubscribedChannels(user?.id ?? null)
      .then((rows) => {
        if (live) setChannels(rows)
      })
      .catch(() => {
        /* The rail's channel section stays empty with its own sentence. */
      })
      .finally(() => {
        if (live) setChannelsLoading(false)
      })

    return () => {
      live = false
    }
  }, [signedIn, status, user?.id])

  return {
    displayName,
    ownChannel,
    ownChannelRef: channelRef(ownChannel),
    channels,
    channelsLoading,
  }
}
