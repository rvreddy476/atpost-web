import type { Metadata } from "next"
import { TopicsScreen } from "@/topics/TopicsScreens"

export const metadata: Metadata = { title: "Topics" }

export default function TopicsPage() {
  return <TopicsScreen />
}
