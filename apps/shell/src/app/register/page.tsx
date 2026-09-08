import { Suspense } from 'react'
import { AuthForm } from '../auth-form'

// Same fallback shape as /login, for the same reason.
export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <main className="auth-page">
          <section className="auth-card" aria-busy="true">
            <p className="auth-lede">Loading…</p>
          </section>
        </main>
      }
    >
      <AuthForm mode="register" />
    </Suspense>
  )
}
