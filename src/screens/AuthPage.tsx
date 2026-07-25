import { useState, type FormEvent } from 'react'
import { useAuth } from '@/lib/auth'

type Mode = 'signin' | 'signup'

export function AuthPage() {
  const { signIn, signUp, configured } = useAuth()
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setInfo(null)
    setSubmitting(true)

    const result =
      mode === 'signin'
        ? await signIn(email.trim(), password)
        : await signUp(email.trim(), password)

    setSubmitting(false)

    if (result.error) {
      setError(result.error)
      return
    }

    if (mode === 'signup') {
      setInfo('Check your email to confirm the account, then sign in.')
      setMode('signin')
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-4 py-10">
      <header className="mb-10">
        <p className="font-display text-4xl font-semibold tracking-tight text-ink">
          Randall Finance Tracker
        </p>
        <p className="mt-2 text-sm text-ink-muted">
          Sign in to your ledger. Transfers stay out of spending maths.
        </p>
      </header>

      {!configured && (
        <div className="mb-6 rounded-md border border-caution/40 bg-surface px-3 py-3 text-sm text-ink">
          Supabase keys are missing. Copy <span className="ledger-mono">.env.example</span> to{' '}
          <span className="ledger-mono">.env.local</span> and add your project URL and anon key.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 rounded-lg bg-surface p-5 shadow-sm">
        <div>
          <label htmlFor="email" className="mb-1 block text-xs font-medium text-ink-muted">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-hairline bg-paper px-3 py-2.5 text-ink outline-none focus:border-flow"
          />
        </div>

        <div>
          <label htmlFor="password" className="mb-1 block text-xs font-medium text-ink-muted">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-hairline bg-paper px-3 py-2.5 text-ink outline-none focus:border-flow"
          />
        </div>

        {error && (
          <p className="text-sm text-signal" role="alert">
            {error}
          </p>
        )}
        {info && (
          <p className="text-sm text-inbound" role="status">
            {info}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-flow px-4 py-2.5 text-sm font-medium text-white transition-opacity duration-120 disabled:opacity-60"
        >
          {submitting ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-muted">
        {mode === 'signin' ? 'Need an account?' : 'Already have an account?'}{' '}
        <button
          type="button"
          className="font-medium text-flow"
          onClick={() => {
            setMode(mode === 'signin' ? 'signup' : 'signin')
            setError(null)
            setInfo(null)
          }}
        >
          {mode === 'signin' ? 'Create one' : 'Sign in'}
        </button>
      </p>
    </div>
  )
}
