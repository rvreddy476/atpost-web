"use client"

import { useState } from "react"
import Link from "next/link"
import { StoreHeader } from "@/components/StoreHeader"
import { useOnboardingStatus, useStartOnboarding } from "@/hooks/useSellerOnboarding"
import { useMyProducts, useSubmitProduct } from "@/hooks/useSellerDashboard"
import { Button, Input } from "@atpost/ui"

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
      {isLoading ? (
        <p className="text-gray-500">Loading…</p>
      ) : !products || products.length === 0 ? (
        <p className="text-gray-500">No products yet. Add your first one.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-500">
              <tr>
                <th className="px-4 py-2">Title</th>
                <th className="px-4 py-2">Approval</th>
                <th className="px-4 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-t border-gray-100">
                  <td className="px-4 py-3 font-medium">{p.title}</td>
                  <td className="px-4 py-3 text-gray-600">{p.approval_status}</td>
                  <td className="px-4 py-3 text-right">
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function SellPage() {
  const status = useOnboardingStatus()

  return (
    <div className="min-h-screen bg-gray-50">
      <StoreHeader />
      <main className="mx-auto max-w-4xl px-4 py-8">
        {status.isLoading ? (
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
