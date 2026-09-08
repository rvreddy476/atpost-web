import { Suspense } from 'react'
import { AuthForm } from '../auth-form'

// The fallback wears the same ground and the same card, so the boundary
// resolving is not a visible flash of a differently shaped page.
export default function LoginPage() {
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
      <AuthForm mode="login" />
    </Suspense>
  )
}
