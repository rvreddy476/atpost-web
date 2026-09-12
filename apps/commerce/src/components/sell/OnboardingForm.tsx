"use client"

import { useState } from "react"
import { Button, Input } from "@atpost/ui"
import { useStartOnboarding } from "@/hooks/useSellerOnboarding"

/**
 * The call to action a signed-in viewer with no store sees, wherever in
 * MSeller they land. Lifted out of app/sell/page.tsx unchanged so the orders,
 * returns and earnings pages can show the same door instead of a blank gate.
 */
export function OnboardingForm() {
  const start = useStartOnboarding()
  const [storeName, setStoreName] = useState("")
  const [email, setEmail] = useState("")
  const [error, setError] = useState("")

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    try {
      await start.mutateAsync({
        store_name: storeName,
        email,
        seller_type: "individual",
        business_type: "individual",
      } as Parameters<typeof start.mutateAsync>[0])
    } catch (err: unknown) {
      const e2 = err as { response?: { data?: { error?: { message?: string } } } }
      setError(e2?.response?.data?.error?.message ?? "Could not start onboarding")
    }
  }

  return (
    <div className="panel panel-pad mx-auto max-w-md">
      <h1 className="shop-display text-2xl">Become a seller</h1>
      <p className="mt-1 text-sm text-shop-muted">Create your store to start listing products.</p>
      <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
        <Input placeholder="Store name" value={storeName} onChange={(e) => setStoreName(e.target.value)} required />
        <Input type="email" placeholder="Contact email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        {error && <p className="text-sm text-shop-bad">{error}</p>}
        {/* The shop's ONE ember button. Opening a store is the platform-level
            act; it is not a purchase, so it is not gold, and it is the only
            action in this zone that is neither. `.btn-ember` carries the 19px/
            700 the token sheet requires of anything sitting on the gradient:
            dark ink on the red end measures 4.03, which is legible as large
            text only. The plain CSS classes are declared after
            @tailwind utilities, so they out-rank the Button's own
            `bg-brand-text` default variant. */}
        <Button type="submit" disabled={start.isPending} className="btn btn-ember btn-block">
          {start.isPending ? "Creating…" : "Create store"}
        </Button>
      </form>
    </div>
  )
}
