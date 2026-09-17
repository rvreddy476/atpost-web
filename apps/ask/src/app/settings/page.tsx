import type { Metadata } from "next"
import { SettingsScreen } from "@/settings/SettingsScreen"

export const metadata: Metadata = { title: "Ask settings" }

export default function SettingsPage() {
  return <SettingsScreen />
}
