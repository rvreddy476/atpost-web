/**
 * The optimistic settings transitions, pure. Mirrors QaSettingsViewModel.update:
 * the switch moves at once; a failed save restores what was there before and
 * says so; a successful save keeps what the server STORED.
 */
import type { SettingKey } from "@/qa/parse"
import type { QASettings } from "@/qa/wire"

export interface SettingsEdit {
  before: QASettings
  after: QASettings
}

/** The edit a switch press makes, or null when it changes nothing. */
export function editSetting(current: QASettings, key: SettingKey, value: boolean): SettingsEdit | null {
  if (current[key] === value) return null
  return { before: current, after: { ...current, [key]: value } }
}

export function settleSave(edit: SettingsEdit, outcome: { ok: true; stored: QASettings } | { ok: false }): QASettings {
  return outcome.ok ? outcome.stored : edit.before
}
