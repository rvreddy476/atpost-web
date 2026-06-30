"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { StoreHeader } from "@/components/StoreHeader"
import { useCreateProduct } from "@/hooks/useSellerDashboard"
import { Button, Input } from "@atpost/ui"

const RETURN_POLICIES = ["no_return", "7_days", "15_days", "30_days"] as const

export default function NewProductPage() {
  const router = useRouter()
  const create = useCreateProduct()
  const [error, setError] = useState("")

  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [returnPolicy, setReturnPolicy] = useState<string>("7_days")
  const [sku, setSku] = useState("")
  const [mrp, setMrp] = useState("")
  const [price, setPrice] = useState("")
  const [stock, setStock] = useState("")

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    try {
      await create.mutateAsync({
        title,
        description,
        product_type: "physical",
        condition: "new",
        return_policy_type: returnPolicy,
        return_policy_days: returnPolicy === "no_return" ? 0 : Number(returnPolicy.split("_")[0]),
        variants: [
          {
            sku,
            mrp: Number(mrp),
            selling_price: Number(price),
            stock_qty: Number(stock || 0),
          },
        ],
      } as Parameters<typeof create.mutateAsync>[0])
      router.push("/sell")
    } catch (err: unknown) {
      const e2 = err as { response?: { data?: { error?: { message?: string } } } }
      setError(e2?.response?.data?.error?.message ?? "Could not create product")
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <StoreHeader />
      <main className="mx-auto max-w-xl px-4 py-8">
        <Link href="/sell" className="text-sm text-gray-500 hover:text-gray-900">
          ← Back to my products
        </Link>
        <h1 className="mt-2 text-xl font-semibold">Add product</h1>

        <form onSubmit={submit} className="mt-4 flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-6">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Title</span>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Description</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-gray-900"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Return policy</span>
            <select
              value={returnPolicy}
              onChange={(e) => setReturnPolicy(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-gray-900"
            >
              {RETURN_POLICIES.map((p) => (
                <option key={p} value={p}>
                  {p.replace("_", " ")}
                </option>
              ))}
            </select>
          </label>

          <fieldset className="rounded-lg border border-gray-200 p-4">
            <legend className="px-1 text-sm font-medium">Variant</legend>
            <div className="grid grid-cols-2 gap-3">
              <label className="col-span-2 flex flex-col gap-1 text-sm">
                <span>SKU</span>
                <Input value={sku} onChange={(e) => setSku(e.target.value)} required />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span>MRP</span>
                <Input type="number" value={mrp} onChange={(e) => setMrp(e.target.value)} required />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span>Selling price</span>
                <Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} required />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span>Stock qty</span>
                <Input type="number" value={stock} onChange={(e) => setStock(e.target.value)} />
              </label>
            </div>
          </fieldset>

          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? "Creating…" : "Create product"}
          </Button>
          <p className="text-xs text-gray-500">
            Created as a draft — submit it for review from “My products”, then an admin approves it before it appears in the shop.
          </p>
        </form>
      </main>
    </div>
  )
}
