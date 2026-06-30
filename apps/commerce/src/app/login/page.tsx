"use client"

import { Suspense, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import api, { saveSession } from "@atpost/api-client"
import { Button, Input } from "@atpost/ui"

// Email/phone + password login. Honors ?redirect=<path> so auth-gated actions
// (e.g. "Sell") return the user where they intended after signing in.
function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const redirect = params.get("redirect") || "/"
  const [identifier, setIdentifier] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      const res = await api.post("/v1/auth/login", { identifier, password, platform: "web" })
      const d = res.data?.data ?? res.data
      const access = d?.tokens?.access_token ?? d?.tokens?.accessToken
      const refresh = d?.tokens?.refresh_token ?? d?.tokens?.refreshToken ?? ""
      if (!access) throw new Error("login response had no access token")
      saveSession({ accessToken: access, refreshToken: refresh }, d?.user ?? { id: "" })
      router.push(redirect)
    } catch (err: unknown) {
      const e2 = err as { response?: { data?: { error?: { message?: string } } }; message?: string }
      setError(e2?.response?.data?.error?.message ?? e2?.message ?? "Login failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-6">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <Input
          placeholder="Email or phone"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          autoComplete="username"
          required
        />
        <Input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      <p className="text-sm text-gray-600">
        New here?{" "}
        <Link
          href={`/register${redirect !== "/" ? `?redirect=${encodeURIComponent(redirect)}` : ""}`}
          className="font-medium underline"
        >
          Create an account
        </Link>
      </p>
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="p-8 text-gray-500">Loading…</div>}>
      <LoginForm />
    </Suspense>
  )
}
