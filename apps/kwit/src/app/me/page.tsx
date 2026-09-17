import type { Metadata } from "next"
import { MeScreen } from "@/me/MeScreen"

export const metadata: Metadata = { title: "Your questions" }

export default function MePage() {
  return <MeScreen />
}
