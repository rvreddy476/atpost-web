"use client"

import { useEffect, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Switch, useToast } from "@atpost/ui"
import { kwitSignInHref } from "@/chrome/links"
import { saveSettings } from "@/qa/api"
import { COPY, SETTING_GROUPS } from "@/qa/copy"
import { errorMessage } from "@/qa/errors"
import { qaKeys, useSettings, useViewer } from "@/qa/hooks"
import type { SettingKey } from "@/qa/parse"
import type { QASettings } from "@/qa/wire"
import { ListSkeleton, SignInPrompt, queryFallback } from "@/ui/states"
import { CARD, H1, H2 } from "@/ui/styles"
import { editSetting, settleSave } from "./settingsState"

/**
 * `/kwit/settings` — Know It's own notification and email settings, stored by
 * qa-service. Separate from the app-wide notification settings: turning email
 * off for the whole app does not silence these, and these touch nothing
 * outside Know It.
 */
export function SettingsScreen() {
  const viewer = useViewer()

  return (
    <div className="space-y-5">
      <header>
        <h1 className={H1}>{COPY.settingsTitle}</h1>
        <p className="mt-1 text-sm text-mo-body">{COPY.settingsIntro}</p>
      </header>
      {!viewer.known ? (
        <ListSkeleton count={2} />
      ) : !viewer.signedIn ? (
        <SignInPrompt title={COPY.signInForSettings} body={COPY.signInForSettingsBody} href={kwitSignInHref("/settings")} />
      ) : (
        <SettingsBody />
      )}
    </div>
  )
}

function SettingsBody() {
  const query = useSettings()
  if (!query.data) return <>{queryFallback(query, <ListSkeleton count={2} />)}</>
  return <SettingsForm stored={query.data} />
}

function SettingsForm({ stored }: { stored: QASettings }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [settings, setSettings] = useState(stored)
  const [saving, setSaving] = useState(false)
  // Saves are sequenced: each PUT carries the whole object, so two in flight
  // could land out of order and store the older one.
  const chain = useRef<Promise<void>>(Promise.resolve())
  const current = useRef(settings)

  useEffect(() => {
    current.current = settings
  }, [settings])

  const change = (key: SettingKey, value: boolean) => {
    const edit = editSetting(current.current, key, value)
    if (!edit) return
    current.current = edit.after
    setSettings(edit.after)
    setSaving(true)
    chain.current = chain.current.then(async () => {
      try {
        const saved = await saveSettings(edit.after)
        // Only adopt the server copy if nothing newer has been toggled since.
        if (current.current === edit.after) {
          const next = settleSave(edit, { ok: true, stored: saved })
          current.current = next
          setSettings(next)
        }
        queryClient.setQueryData(qaKeys.settings, saved)
      } catch (error) {
        const next = settleSave(edit, { ok: false })
        current.current = { ...current.current, [key]: next[key] }
        setSettings(current.current)
        toast.error(errorMessage(error))
      } finally {
        setSaving(false)
      }
    })
  }

  return (
    <div className="space-y-5" aria-busy={saving}>
      {SETTING_GROUPS.map((group) => (
        <section key={group.id} aria-labelledby={`ask-settings-${group.id}`} className={`${CARD} space-y-2`}>
          <h2 id={`ask-settings-${group.id}`} className={H2}>
            {group.title}
          </h2>
          {group.rows.map((row) => (
            <Switch
              key={row.key}
              id={`ask-setting-${row.key}`}
              label={row.label}
              description={row.hint}
              checked={settings[row.key]}
              onChange={(value) => change(row.key, value)}
            />
          ))}
        </section>
      ))}
    </div>
  )
}
