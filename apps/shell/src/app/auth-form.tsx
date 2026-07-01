'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import api, { saveSession } from '@atpost/api-client'
import { moduleHome } from '@/lib/moduleRedirect'

export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const params = useSearchParams()
  const destination = moduleHome(params.get('redirect'))
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      const payload = mode === 'login'
        ? { identifier, password, platform: 'web' }
        : { email: identifier, password, first_name: firstName, last_name: lastName, platform: 'web' }
      const response = await api.post(`/v1/auth/${mode}`, payload)
      const data = response.data?.data ?? response.data
      const accessToken = data?.tokens?.access_token ?? data?.tokens?.accessToken
      const refreshToken = data?.tokens?.refresh_token ?? data?.tokens?.refreshToken ?? ''
      const user = data?.user
      if (!accessToken || !user?.id) throw new Error('Authentication response was incomplete.')
      saveSession({ accessToken, refreshToken }, user)
      window.location.assign(destination)
    } catch (cause) {
      const apiError = cause as { response?: { data?: { error?: { message?: string } } }; message?: string }
      setError(apiError.response?.data?.error?.message ?? apiError.message ?? 'Authentication failed.')
    } finally {
      setLoading(false)
    }
  }

  const switchPath = mode === 'login' ? '/register' : '/login'
  const switchHref = `${switchPath}?redirect=${encodeURIComponent(destination)}`
  return (
    <main className="auth-page">
      <section className="auth-card">
        <Link href="/" className="auth-brand">VChat</Link>
        <p className="auth-kicker">{destination === '/' ? 'Your connected platform' : `Continue to ${destination.slice(1)}`}</p>
        <h1>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
        <form onSubmit={submit} className="auth-form">
          {mode === 'register' ? (
            <div className="auth-name-row">
              <label>First name<input value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" required /></label>
              <label>Last name<input value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" /></label>
            </div>
          ) : null}
          <label>{mode === 'login' ? 'Email or phone' : 'Email'}<input type={mode === 'login' ? 'text' : 'email'} value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" required /></label>
          <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={8} required /></label>
          {error ? <p role="alert" className="auth-error">{error}</p> : null}
          <button disabled={loading}>{loading ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
        </form>
        <p className="auth-switch">{mode === 'login' ? 'New to VChat?' : 'Already registered?'} <Link href={switchHref}>{mode === 'login' ? 'Create account' : 'Sign in'}</Link></p>
      </section>
    </main>
  )
}
