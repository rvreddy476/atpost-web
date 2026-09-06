"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { StoreHeader } from "@/components/StoreHeader"
import { useOnboardingStatus, useStartOnboarding } from "@/hooks/useSellerOnboarding"
import { useMyProducts, useSubmitProduct } from "@/hooks/useSellerDashboard"
import { Button, Input, Table, TBody, TD, TH, THead, TR } from "@atpost/ui"
import { getCurrentUserId } from "@atpost/api-client"

function OnboardingForm() {
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
        <Button type="submit" disabled={start.isPending}>
          {start.isPending ? "Creating…" : "Create store"}
        </Button>
      </form>
    </div>
  )
}

function MyProducts() {
  const { data: products, isLoading } = useMyProducts()
  const submit = useSubmitProduct()

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="shop-display text-2xl">My products</h1>
        <div className="flex flex-wrap items-center gap-2">
          {/* The guided route asks the category first and then only what that
              category needs. The plain one below it is unchanged and still the
              fastest path for a seller who knows exactly what they are doing. */}
          <Link
            href="/sell/products/guided"
            className="btn btn-outline btn-sm"
          >
            Start from a category
          </Link>
          <Link href="/sell/products/new" className="btn btn-gold btn-sm">
            + Add product
          </Link>
        </div>
      </div>
      <Table
        loading={isLoading}
        empty={!products || products.length === 0}
        emptyMessage="No products yet. Add your first one."
      >
        <THead>
          <TR>
            <TH>Title</TH>
            <TH>Approval</TH>
            <TH className="text-right">Action</TH>
          </TR>
        </THead>
        <TBody>
          {products?.map((p) => (
            <TR key={p.id}>
              <TD className="font-medium">{p.title}</TD>
              <TD className="text-shop-muted">{p.approval_status}</TD>
              <TD className="text-right">
                {p.approval_status === "draft" ? (
                  <button
                    onClick={() => submit.mutate(p.id)}
                    disabled={submit.isPending}
                    className="btn btn-outline btn-sm"
                  >
                    Submit for review
                  </button>
                ) : (
                  <span className="text-xs text-shop-faint">—</span>
                )}
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  )
}

export default function SellPage() {
  const [authed, setAuthed] = useState<boolean | null>(null)

  // Selling requires an account. If not signed in, send them to login and
  // bring them straight back to /sell afterwards.
  useEffect(() => {
    if (getCurrentUserId()) {
      setAuthed(true)
    } else {
      setAuthed(false)
      window.location.replace("/login?redirect=%2Fshop")
    }
  }, [])

  const status = useOnboardingStatus()

  return (
    <div className="min-h-screen bg-shop-bg">
      <StoreHeader />
      <main className="shop-page-narrow">
        {authed !== true ? (
          <p className="text-shop-faint">Redirecting to sign in…</p>
        ) : status.isLoading ? (
          <p className="text-shop-faint">Loading…</p>
        ) : status.data && !status.isError ? (
          <MyProducts />
        ) : (
          <OnboardingForm />
        )}
      </main>
    </div>
  )
}
