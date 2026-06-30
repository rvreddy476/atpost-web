"use client"

import { Suspense, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import api, { saveSession } from "@atpost/api-client"
import { Button, Input } from "@atpost/ui"

// Create an account (email + password). Backend returns the same {tokens, user}
// envelope as login, so we save the session and continue to ?redirect.
function RegisterForm() {
  const router = useRouter()
  const params = useSearchParams()
  const redirect = params.get("redirect") || "/"
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      const res = await api.post("/v1/auth/register", {
        email,
        password,
        first_name: firstName,
        last_name: lastName,
        platform: "web",
      })
      const d = res.data?.data ?? res.data
      const access = d?.tokens?.access_token ?? d?.tokens?.accessToken
      const refresh = d?.tokens?.refresh_token ?? d?.tokens?.refreshToken ?? ""
      if (!access) throw new Error("register response had no access token")
      saveSession({ accessToken: access, refreshToken: refresh }, d?.user ?? { id: "" })
      router.push(redirect)
    } catch (err: unknown) {
      const e2 = err as { response?: { data?: { error?: { message?: string } } }; message?: string }
      setError(e2?.response?.data?.error?.message ?? e2?.message ?? "Sign up failed")
    } finally {
      setLoading(false)
    }
  }

  const loginHref = `/login${redirect !== "/" ? `?redirect=${encodeURIComponent(redirect)}` : ""}`

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-6">
      <h1 className="text-2xl font-semibold">Create account</h1>
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <div className="flex gap-3">
          <Input placeholder="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
          <Input placeholder="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </div>
        <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        <Input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" disabled={loading}>
          {loading ? "Creating…" : "Create account"}
        </Button>
      </form>
      <p className="text-sm text-gray-600">
        Already have an account?{" "}
        <Link href={loginHref} className="font-medium underline">
          Sign in
        </Link>
      </p>
    </main>
  )
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="p-8 text-gray-500">Loading…</div>}>
      <RegisterForm />
    </Suspense>
  )
}
