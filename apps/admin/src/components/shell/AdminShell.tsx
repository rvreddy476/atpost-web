"use client"

import { createContext, useContext, useState } from "react"
import { usePathname } from "next/navigation"
import { KeyRound, ShieldAlert, ShieldQuestion, Smartphone, TriangleAlert } from "lucide-react"
import { buttonPrimary, buttonSecondary } from "@/components/blocks/buttons"
import { signOut } from "@atpost/api-client"
import { useAdminMe, useMfaEnrolled } from "@/hooks/useAdminMe"
import type { AdminMe, AdminNavModel } from "@/lib/admin/me"
import { ProductMark, TopBar } from "./TopBar"
import { SideNav } from "./SideNav"
import { StepUpProvider } from "./StepUpProvider"

/**
 * THIS IS A UX BOUNDARY, NOT A SECURITY ONE. admin-service enforces every
 * permission, MFA and step-up rule on every request. What the shell adds is
 * that nobody sees a screen — or a link — the server would refuse.
 *
 * Unlike the old AdminGate it FAILS CLOSED: when `/v1/admin/me` cannot be
 * read, no navigation and no page render, because the navigation itself is
 * derived from that answer and there is nothing honest to show without it.
 */

interface AdminContextValue {
  me: AdminMe
  nav: AdminNavModel
}

const AdminContext = createContext<AdminContextValue | null>(null)

export function useAdmin(): AdminContextValue {
  const ctx = useContext(AdminContext)
  if (!ctx) throw new Error("useAdmin must be used inside <AdminShell>")
  return ctx
}

const SIGN_IN_URL = process.env.NEXT_PUBLIC_ADMIN_SIGN_IN_URL ?? ""

/** Routes that render without the console chrome (they explain how to get in). */
const BARE_ROUTES = ["/login", "/register"]

function Screen({ icon: Icon, title, children }: { icon: typeof ShieldAlert; title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <div className="border-b border-mo px-4 py-3">
        <ProductMark />
      </div>
      <main className="mx-auto max-w-lg px-4 py-20 text-center">
        <Icon className="mx-auto mb-4 h-10 w-10 text-mo-body" aria-hidden="true" />
        <h1 className="font-mo-display text-2xl font-semibold text-mo-ink">{title}</h1>
        <div className="mt-3 space-y-3 text-sm text-mo-body">{children}</div>
      </main>
    </div>
  )
}

export function SignInLink() {
  if (!SIGN_IN_URL) {
    return (
      <p className="text-mo-warn">
        No admin sign-in page is configured for this host. Set NEXT_PUBLIC_ADMIN_SIGN_IN_URL when building the console.
      </p>
    )
  }
  return (
    // A plain <a>: the sign-in page is outside this app's base path.
    <a href={SIGN_IN_URL} className={`${buttonPrimary} mt-3`}>
      Sign in
    </a>
  )
}

/**
 * The blocking screen for an admin whose session is not 2FA-verified. Whether
 * they must first ENROL an authenticator or just VERIFY with one comes from
 * identity (`admin.mfa_enrolled`); when that is unknown, both steps are shown.
 */
function MfaRequiredScreen({ onRecheck, checking }: { onRecheck: () => void; checking: boolean }) {
  const enrolled = useMfaEnrolled(true)
  const known = enrolled.data ?? null
  return (
    <Screen icon={Smartphone} title="Two-factor authentication is required">
      <p>
        Every admin account must use an authenticator app. The console stays closed until this session has been verified
        with a 2FA code.
      </p>
      {known !== true ? (
        <p data-testid="mfa-enrol">
          {known === false ? "Your account has no authenticator enrolled yet. " : "If your account has no authenticator yet, "}
          enrol one from your account security settings, then sign out and sign in again.
        </p>
      ) : null}
      {known !== false ? (
        <p data-testid="mfa-verify">Sign out and sign in again, entering the code from your authenticator app when asked.</p>
      ) : null}
      <div className="flex justify-center gap-2">
        <button type="button" className={buttonSecondary} onClick={onRecheck} disabled={checking}>
          Check again
        </button>
        <button
          type="button"
          className={buttonSecondary}
          onClick={() => void signOut().then(() => window.location.reload())}
        >
          Sign out
        </button>
      </div>
      <SignInLink />
    </Screen>
  )
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { access, refetch, isFetching } = useAdminMe()
  const [navOpen, setNavOpen] = useState(false)

  if (BARE_ROUTES.includes(pathname)) return <>{children}</>

  // The session cookie is not consulted here: /v1/admin/me answering 401 is
  // the authority, and a stale presence cookie cannot open or close the shell.
  switch (access.status) {
    case "loading":
      return (
        <Screen icon={ShieldQuestion} title="Checking your admin access…">
          <p role="status">One moment.</p>
        </Screen>
      )
    case "signed-out":
      return (
        <Screen icon={ShieldQuestion} title="You are not signed in">
          <p>Your session has ended. Sign in again to continue.</p>
          <SignInLink />
        </Screen>
      )
    case "mfa":
      return <MfaRequiredScreen onRecheck={() => void refetch()} checking={isFetching} />
    case "denied":
      return (
        <Screen icon={ShieldAlert} title="You do not have admin access">
          <p>
            This console is for accounts holding an admin role for at least one application. Ask a platform admin to
            grant one; it takes effect as soon as they do.
          </p>
        </Screen>
      )
    case "error":
      return (
        <Screen icon={TriangleAlert} title="We could not check your admin access">
          <p>
            {access.message ?? "The access check failed."} That says nothing about your permissions, but the console
            stays closed until it can be read.
          </p>
          <button type="button" className={buttonPrimary} onClick={() => void refetch()} disabled={isFetching}>
            {isFetching ? "Checking…" : "Try again"}
          </button>
        </Screen>
      )
    case "ready":
      break
  }

  const { me, nav } = access
  return (
    <AdminContext.Provider value={{ me, nav }}>
      <StepUpProvider windowSeconds={me.stepUpWindowSeconds}>
        <div className="min-h-screen">
          <TopBar me={me} onToggleNav={() => setNavOpen((open) => !open)} />
          <div className="flex">
            <aside
              className={[
                "fixed inset-y-14 left-0 z-30 w-64 overflow-y-auto border-r border-mo bg-mo-bg lg:sticky lg:top-14 lg:block lg:h-[calc(100vh-3.5rem)]",
                navOpen ? "block" : "hidden",
              ].join(" ")}
            >
              <SideNav nav={nav} onNavigate={() => setNavOpen(false)} />
            </aside>
            <main className="min-w-0 flex-1 px-4 py-6 lg:px-8">
              <div className="mx-auto max-w-6xl">{children}</div>
            </main>
          </div>
        </div>
      </StepUpProvider>
    </AdminContext.Provider>
  )
}

export function NoAccessToApp() {
  return (
    <div className="rounded-mo border border-mo bg-mo-surface p-8 text-center">
      <KeyRound className="mx-auto mb-3 h-8 w-8 text-mo-body" aria-hidden="true" />
      <h1 className="font-mo-display text-xl font-semibold text-mo-ink">This area is not available to you</h1>
      <p className="mt-2 text-sm text-mo-body">Your admin roles do not include it. Use the navigation to pick an area you can open.</p>
    </div>
  )
}
