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
    <div className="mx-auto max-w-md rounded-xl border border-gray-200 bg-white p-6">
      <h1 className="text-xl font-semibold">Become a seller</h1>
      <p className="mt-1 text-sm text-gray-600">Create your store to start listing products.</p>
      <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
        <Input placeholder="Store name" value={storeName} onChange={(e) => setStoreName(e.target.value)} required />
        <Input type="email" placeholder="Contact email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        {error && <p className="text-sm text-red-600">{error}</p>}
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
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">My products</h1>
        <Link href="/sell/products/new" className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white hover:bg-black">
          + Add product
        </Link>
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
              <TD className="text-gray-600">{p.approval_status}</TD>
              <TD className="text-right">
                {p.approval_status === "draft" ? (
                  <button
                    onClick={() => submit.mutate(p.id)}
                    disabled={submit.isPending}
                    className="rounded-lg border border-gray-300 px-3 py-1 hover:border-gray-400 disabled:opacity-50"
                  >
                    Submit for review
                  </button>
                ) : (
                  <span className="text-xs text-gray-400">—</span>
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
    <div className="min-h-screen bg-gray-50">
      <StoreHeader />
      <main className="mx-auto max-w-4xl px-4 py-8">
        {authed !== true ? (
          <p className="text-gray-500">Redirecting to sign in…</p>
        ) : status.isLoading ? (
          <p className="text-gray-500">Loading…</p>
        ) : status.data && !status.isError ? (
          <MyProducts />
        ) : (
          <OnboardingForm />
        )}
      </main>
    </div>
  )
}
