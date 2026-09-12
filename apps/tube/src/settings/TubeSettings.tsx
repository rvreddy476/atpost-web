"use client"

/**
 * `/tube/settings`: the four things a Tube viewer can set from a browser.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * FOUR SECTIONS, AND WHERE EACH ONE'S TRUTH LIVES
 *
 * A settings page is a page that lies easily, because every control on it
 * is a claim about state kept somewhere else. So each section here says,
 * on screen, where its state is:
 *
 *   · PLAYBACK. "Autoplay next episode" is localStorage, per viewer, in
 *     ../watch/autoplayPreference.ts, and the same switch the watch page
 *     draws on its countdown card. The line under it says it is stored in
 *     this browser, because a person who turns it off here and finds it on
 *     again on their phone has not found a bug.
 *
 *   · NOTIFICATIONS. The detailed preference row, on the server. Two of its
 *     keys are drawn (push and in-app for new videos from subscribed
 *     channels) and each PUT carries exactly one key, so a switch here can
 *     never overwrite one the phone moved. The push switch goes dark, with
 *     the reason, when the row's master `push_enabled` is off: a push
 *     preference under a push master that is off is a promise nothing
 *     will keep.
 *
 *   · YOUR CHANNEL. `GET /v1/channels/me`, edited with `PATCH
 *     /v1/channels/me`. The rules are the studio's own (./settings.ts
 *     imports them), so the form that edits a channel and the form that
 *     creates one agree. With no channel there is nothing to edit, and the
 *     line says where one is made: the upload page, where the studio's
 *     ChannelGate runs before the picker.
 *
 *   · HISTORY. The same Clear control the History page has, and the
 *     sentence the history page's header carries: removing a video from
 *     history also resets its resume point, because they are one row.
 *
 * ── Optimistic switches, rolled back with a sentence ──────────────────────
 * A switch that waits for the network is a switch that feels stuck. Each
 * one moves on the click and moves back if the PUT fails, and the status
 * line under the section says so. The server's answer, when it comes, is
 * what is kept: it is the row as STORED, and a PUT that succeeded but
 * stored something else is a fact this page should show.
 */

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useSession } from "@atpost/api-client/session"
import { Loader2, Settings as SettingsIcon } from "lucide-react"
import { BRAND } from "@momentum/brand"
import { TUBE_SIGN_IN_HREF } from "@/chrome/links"
import { ClearHistoryControl } from "@/history/ClearHistoryControl"
import { clearHistory } from "@/history/api"
import { CHANNEL_ABOUT_MAX, CHANNEL_HANDLE_MAX, CHANNEL_NAME_MAX } from "@/studio/channelForm"
import { StudioField, StudioSwitch, studioInputClass } from "@/studio/StudioControls"
import { fetchOwnChannel } from "@/tube/channelApi"
import type { TubeChannel } from "@/tube/channels"
import { failureOf } from "@/tube/uploadApi"
import { readAutoplayNext, writeAutoplayNext } from "@/watch/autoplayPreference"
import { AutoplayNextSwitch } from "@/watch/NextEpisodeCountdown"
import { fetchDetailedPrefs, updateDetailedPrefs, updateOwnChannel } from "./api"
import {
  channelFormErrors,
  channelPatchBody,
  channelSaveMessage,
  prefsPutBody,
  type ChannelForm,
  type ChannelFormErrors,
  type NotificationPrefs,
  type PrefKey,
} from "./settings"

const ACTION =
  "mt-5 inline-block rounded-mo-pill border border-mo-strong px-4 py-2 text-sm font-semibold " +
  "text-mo-cyan transition-colors duration-150 ease-mo hover:bg-mo-raised"

export function TubeSettings() {
  const session = useSession()

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-5">
        <h1 className="font-mo-display text-2xl font-semibold tracking-mo-display text-mo-ink">
          Settings
        </h1>
        <p className="mt-1 text-sm text-mo-body">
          Playback, notifications, your channel and your history, for {BRAND.name} Tube.
        </p>
      </header>

      {session.signedOut ? (
        <div className="rounded-mo border border-mo bg-mo-surface p-8 text-center shadow-mo">
          <SettingsIcon aria-hidden="true" className="mx-auto h-8 w-8 text-mo-purple" />
          <h2 className="mt-4 font-mo-display text-xl font-semibold tracking-mo-display text-mo-ink">
            Sign in to change your settings
          </h2>
          <p className="mx-auto mt-2 max-w-sm text-mo-body">
            Everything here is kept against your account, so {BRAND.name} has to know who you
            are.
          </p>
          <a href={TUBE_SIGN_IN_HREF} className={ACTION}>
            Sign in
          </a>
        </div>
      ) : session.status === "unknown" ? (
        <p className="py-8 text-center text-sm text-mo-body">Checking your session…</p>
      ) : (
        <div className="space-y-5">
          <PlaybackSection viewerId={session.userId} />
          <NotificationsSection />
          <ChannelSection />
          <HistorySection />
        </div>
      )}
    </div>
  )
}

/* ── Scaffolding ──────────────────────────────────────────────────────────── */

function Section({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section
      aria-labelledby={`settings-${title}`}
      className="rounded-mo border border-mo bg-mo-surface p-5 shadow-mo"
    >
      <h2
        id={`settings-${title}`}
        className="font-mo-display text-sm uppercase tracking-mo-eyebrow text-mo-body"
      >
        {title}
      </h2>
      {description ? <p className="mt-1 text-xs text-mo-body">{description}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  )
}

/* ── Playback ─────────────────────────────────────────────────────────────── */

function PlaybackSection({ viewerId }: { viewerId: string | null }) {
  // Read after mount for the reason the watch page reads it after mount: it
  // lives in localStorage, which the server does not have, and the first
  // paint must not claim a value it has not read.
  const [autoplayNext, setAutoplayNext] = useState(true)
  useEffect(() => {
    setAutoplayNext(readAutoplayNext(viewerId))
  }, [viewerId])

  return (
    <Section title="Playback">
      <AutoplayNextSwitch
        checked={autoplayNext}
        onChange={(next) => {
          setAutoplayNext(next)
          writeAutoplayNext(viewerId, next)
        }}
      />
      <p className="mt-1 text-xs text-mo-body">
        When an episode ends, the next one in its series starts after a ten-second countdown.
        This choice is stored in this browser, for this account, and nowhere else.
      </p>
    </Section>
  )
}

/* ── Notifications ────────────────────────────────────────────────────────── */

function NotificationsSection() {
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    fetchDetailedPrefs()
      .then((row) => {
        if (live) setPrefs(row)
      })
      .catch(() => {
        if (live) setProblem("Your notification settings could not be loaded.")
      })
    return () => {
      live = false
    }
  }, [])

  const move = useCallback(
    (key: PrefKey, value: boolean) => {
      if (!prefs) return
      const before = prefs
      setNotice(null)
      setPrefs({ ...prefs, [key]: value })
      updateDetailedPrefs(prefsPutBody(key, value))
        .then((stored) => {
          // The row as stored wins over the row as asked for.
          if (stored) setPrefs(stored)
        })
        .catch(() => {
          setPrefs(before)
          setNotice("That change could not be saved. The switch is back where it was.")
        })
    },
    [prefs]
  )

  return (
    <Section
      title="Notifications"
      description="New videos from channels you subscribe to. Subscribing turns both on; this is where you turn one off."
    >
      {problem ? (
        <p role="alert" className="text-sm text-mo-bad">
          {problem}
        </p>
      ) : !prefs ? (
        <p className="flex items-center gap-2 text-sm text-mo-body">
          <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
          Loading…
        </p>
      ) : (
        <div className="divide-y divide-mo">
          <StudioSwitch
            label="Push notifications for new videos"
            description={
              prefs.pushEnabled
                ? "On your phone, when a channel you subscribe to publishes."
                : "Push notifications are turned off for your whole account, so this cannot be turned on from here. Turn them on in the app first."
            }
            checked={prefs.pushEnabled && prefs.pushNewVideos}
            disabled={!prefs.pushEnabled}
            onChange={(next) => move("pushNewVideos", next)}
          />
          <StudioSwitch
            label="In-app notifications for new videos"
            description="In your notifications list, on every device."
            checked={prefs.inappNewVideos}
            onChange={(next) => move("inappNewVideos", next)}
          />
        </div>
      )}
      {notice ? (
        <p role="status" className="mt-2 text-xs text-mo-body">
          {notice}
        </p>
      ) : null}
    </Section>
  )
}

/* ── Your channel ─────────────────────────────────────────────────────────── */

function formOf(channel: TubeChannel): ChannelForm {
  return { name: channel.name ?? "", handle: channel.handle ?? "", about: channel.about ?? "" }
}

function ChannelSection() {
  /** undefined: not answered yet. null: no channel. */
  const [channel, setChannel] = useState<TubeChannel | null | undefined>(undefined)
  const [problem, setProblem] = useState<string | null>(null)
  const [form, setForm] = useState<ChannelForm>({ name: "", handle: "", about: "" })
  const [errors, setErrors] = useState<ChannelFormErrors | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let live = true
    fetchOwnChannel()
      .then((row) => {
        if (!live) return
        setChannel(row)
        if (row) setForm(formOf(row))
      })
      .catch(() => {
        if (live) setProblem("Your channel could not be loaded.")
      })
    return () => {
      live = false
    }
  }, [])

  const save = useCallback(async () => {
    if (!channel) return
    setSaved(false)
    setSaveError(null)
    const shape = channelFormErrors(form)
    setErrors(shape)
    if (shape) return
    const body = channelPatchBody(formOf(channel), form)
    if (!body) {
      setSaved(true)
      return
    }
    setSaving(true)
    try {
      const row = await updateOwnChannel(body)
      const next = row ?? { ...channel, ...body }
      setChannel(next)
      setForm(formOf(next))
      setSaved(true)
    } catch (error) {
      setSaveError(channelSaveMessage(failureOf(error)))
    } finally {
      setSaving(false)
    }
  }, [channel, form])

  const dirty = channel ? channelPatchBody(formOf(channel), form) !== null : false

  return (
    <Section title="Your channel" description="The name and handle your long videos are published under.">
      {problem ? (
        <p role="alert" className="text-sm text-mo-bad">
          {problem}
        </p>
      ) : channel === undefined ? (
        <p className="flex items-center gap-2 text-sm text-mo-body">
          <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
          Loading…
        </p>
      ) : channel === null ? (
        <p className="text-sm text-mo-body">
          You have not created a channel yet. A long video is published by a channel, and one
          is created on the{" "}
          {/* next/link: /upload is this app's own route, so the transition is
              a client one and the shell stays mounted. */}
          <Link href="/upload" className="font-semibold text-mo-cyan underline underline-offset-2">
            upload page
          </Link>{" "}
          the first time you publish.
        </p>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            void save()
          }}
        >
          <StudioField
            label="Channel name"
            hint={`${form.name.trim().length}/${CHANNEL_NAME_MAX}`}
            error={errors?.name}
          >
            {({ id, describedBy }) => (
              <input
                id={id}
                aria-describedby={describedBy}
                className={studioInputClass}
                value={form.name}
                maxLength={CHANNEL_NAME_MAX}
                autoComplete="off"
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            )}
          </StudioField>

          <StudioField
            label="Handle"
            hint={`${form.handle.length}/${CHANNEL_HANDLE_MAX}`}
            error={errors?.handle}
            description="Changing it changes your channel's address. Links to the old one stop working."
          >
            {({ id, describedBy }) => (
              <div className="flex items-center gap-2">
                <span aria-hidden className="text-sm text-mo-body">
                  @
                </span>
                <input
                  id={id}
                  aria-describedby={describedBy}
                  className={studioInputClass}
                  value={form.handle}
                  maxLength={CHANNEL_HANDLE_MAX}
                  autoComplete="off"
                  spellCheck={false}
                  // Lowercased as it is typed, the way the studio's gate does
                  // it: the pattern forbids capitals and somebody typing
                  // their own name has done nothing wrong.
                  onChange={(e) => setForm({ ...form, handle: e.target.value.toLowerCase().trim() })}
                />
              </div>
            )}
          </StudioField>

          <StudioField label="About" hint={`${form.about.length}/${CHANNEL_ABOUT_MAX}`} error={errors?.about}>
            {({ id, describedBy }) => (
              <textarea
                id={id}
                aria-describedby={describedBy}
                className={`${studioInputClass} min-h-24 resize-y py-2`}
                value={form.about}
                maxLength={CHANNEL_ABOUT_MAX}
                onChange={(e) => setForm({ ...form, about: e.target.value })}
              />
            )}
          </StudioField>

          {saveError ? (
            <p role="alert" className="text-sm text-mo-bad">
              {saveError}
            </p>
          ) : saved ? (
            <p role="status" className="text-sm text-mo-good">
              Saved.
            </p>
          ) : null}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving || !dirty}
              className="mo-btn-primary inline-flex h-10 items-center justify-center gap-2 rounded-mo-pill px-5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : null}
              Save changes
            </button>
            {dirty ? (
              <button
                type="button"
                onClick={() => {
                  setForm(formOf(channel))
                  setErrors(null)
                  setSaveError(null)
                }}
                className="text-sm font-semibold text-mo-body underline underline-offset-2 hover:text-mo-ink"
              >
                Discard
              </button>
            ) : null}
          </div>
        </form>
      )}
    </Section>
  )
}

/* ── History ──────────────────────────────────────────────────────────────── */

function HistorySection() {
  return (
    <Section title="History" description="What you have watched, and where each video resumes from.">
      <ClearHistoryControl onClear={clearHistory} />
      <p className="mt-3 text-xs text-mo-body">
        Your history and your resume points are one record. Clearing it, or removing a video
        from the{" "}
        <Link href="/history" className="font-semibold text-mo-cyan underline underline-offset-2">
          History page
        </Link>
        , also means that video starts from the beginning next time.
      </p>
    </Section>
  )
}
