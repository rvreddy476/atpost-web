"use client"

import { useState } from "react"
import Link from "next/link"
import { Tabs } from "@atpost/ui"
import { kwitSignInHref } from "@/chrome/links"
import { COPY } from "@/qa/copy"
import { useMyQuestions, useSavedQuestions, useViewer } from "@/qa/hooks"
import { QuestionList } from "@/ui/QuestionList"
import { ListSkeleton, SignInPrompt } from "@/ui/states"
import { H1 } from "@/ui/styles"

type MeTab = "mine" | "saved"

/** `/kwit/me` — My questions and Saved. Signed-in only. */
export function MeScreen() {
  const viewer = useViewer()
  const [tab, setTab] = useState<MeTab>("mine")

  if (!viewer.known) return <ListSkeleton />
  if (!viewer.signedIn) return <SignInPrompt title={COPY.signInForMe} body={COPY.signInForMeBody} href={kwitSignInHref("/me")} />

  return (
    <div className="space-y-5">
      <h1 className={H1}>{COPY.meTitle}</h1>
      <Tabs
        aria-label={COPY.meTitle}
        items={[
          { id: "mine", label: COPY.tabMine },
          { id: "saved", label: COPY.tabSaved },
        ]}
        value={tab}
        onChange={(id) => setTab(id as MeTab)}
      >
        {tab === "mine" ? <MineList viewerId={viewer.userId} /> : <SavedList viewerId={viewer.userId} />}
      </Tabs>
    </div>
  )
}

function MineList({ viewerId }: { viewerId: string | null }) {
  const query = useMyQuestions()
  return (
    <QuestionList
      query={query}
      viewerId={viewerId}
      emptyTitle={COPY.emptyMineTitle}
      emptyBody={COPY.emptyMineBody}
      emptyAction={
        <Link href="/new" className="text-sm font-semibold text-mo-cyan hover:underline">
          {COPY.askTitle}
        </Link>
      }
    />
  )
}

function SavedList({ viewerId }: { viewerId: string | null }) {
  const query = useSavedQuestions()
  return <QuestionList query={query} viewerId={viewerId} emptyTitle={COPY.emptySavedTitle} emptyBody={COPY.emptySavedBody} />
}
