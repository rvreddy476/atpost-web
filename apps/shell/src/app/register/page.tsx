import { Suspense } from 'react'
import { AuthForm } from '../auth-form'

export default function RegisterPage() {
  return <Suspense fallback={<main className="auth-page">Loading…</main>}><AuthForm mode="register" /></Suspense>
}
