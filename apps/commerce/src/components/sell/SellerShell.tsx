"use client"

import { useEffect } from "react"
import { StoreHeader } from "@/components/StoreHeader"
import { useSession } from "@/hooks/useCommerce"
import { useOnboardingStatus } from "@/hooks/useSellerOnboarding"
import { OnboardingForm } from "./OnboardingForm"
import { SellerNav } from "./SellerNav"

interface SellerShellProps {
  /**
   * Where the login page should send the viewer back to, as the full path
   * including the zone's basePath (the login page lives outside it). The
   * products page has always passed `/shop`; the deeper pages pass themselves.
   */
  redirectTo: string
  children: React.ReactNode
}

/**
 * The frame every MSeller page shares, and the two gates in front of it.
 *
 * Selling requires an account. If nobody is signed in, send them to the one
 * auth page and bring them straight back here afterwards. `known` is the
 * guard that matters: it is true on the first paint now that the layout seeds
 * the session from the request's cookies, so a signed-in seller no longer
 * sees "Redirecting to sign in…" for a frame. It can still be false in a zone
 * that has not wired the provider, and redirecting on a question nobody has
 * answered yet would bounce a signed-in seller to login.
 *
 * Past that, the onboarding status decides between the section and the
 * "Become a seller" form. This is exactly what app/sell/page.tsx did inline;
 * it lives here now so four pages ask the question the same way.
 */
export function SellerShell({ redirectTo, children }: SellerShellProps) {
  const { signedIn, known } = useSession()

  useEffect(() => {
    if (known && !signedIn) window.location.replace(`/login?redirect=${encodeURIComponent(redirectTo)}`)
  }, [known, signedIn, redirectTo])

  const status = useOnboardingStatus()

  return (
    <div className="min-h-screen bg-shop-bg">
      <StoreHeader />
      <main className="shop-page-narrow">
        {!signedIn ? (
          <p className="text-shop-faint">{known ? "Redirecting to sign in…" : "Checking your account…"}</p>
        ) : status.isLoading ? (
          <p className="text-shop-faint">Loading…</p>
        ) : status.data && !status.isError ? (
          <>
            <SellerNav />
            {children}
          </>
        ) : (
          <OnboardingForm />
        )}
      </main>
    </div>
  )
}
