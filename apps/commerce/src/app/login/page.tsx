"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import api, { saveSession } from "@atpost/api-client"
import { Button, Input } from "@atpost/ui"

// Minimal email/phone + password login for the commerce zone. Posts to the
// gateway via the same /api/proxy the rest of the app uses, then persists the
// session through @atpost/api-client so every subsequent call is authenticated.
export default function LoginPage() {
  const router = useRouter()
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
      router.push("/")
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
    </main>
  )
}
