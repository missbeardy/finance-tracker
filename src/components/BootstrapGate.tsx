import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useAuth } from '@/lib/auth'
import { ensureUserBootstrap, isBootstrapComplete } from '@/lib/bootstrap'

export function BootstrapGate({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const [ready, setReady] = useState(() => (userId ? isBootstrapComplete(userId) : false))
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [slowHint, setSlowHint] = useState(false)

  const retry = useCallback(() => {
    setError(null)
    setReady(false)
    setSlowHint(false)
    setAttempt((n) => n + 1)
  }, [])

  useEffect(() => {
    if (!userId) {
      setReady(false)
      return
    }

    // Already prepared this session — skip the full-screen seeding flash on remount/nav.
    if (isBootstrapComplete(userId) && attempt === 0) {
      setReady(true)
      setError(null)
      return
    }

    let alive = true
    setReady(false)
    setError(null)
    setSlowHint(false)

    const slowTimer = window.setTimeout(() => {
      if (alive) setSlowHint(true)
    }, 8_000)

    ensureUserBootstrap(userId)
      .then(() => {
        if (alive) setReady(true)
      })
      .catch((err: unknown) => {
        if (alive) {
          setError(err instanceof Error ? err.message : 'Failed to prepare your ledger')
        }
      })
      .finally(() => {
        window.clearTimeout(slowTimer)
      })

    return () => {
      alive = false
      window.clearTimeout(slowTimer)
    }
  }, [userId, attempt])

  if (error) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-paper px-4">
        <p className="max-w-sm text-center text-sm text-signal" role="alert">
          {error}
        </p>
        <p className="max-w-sm text-center text-xs text-ink-muted">
          If this is a new remote project, the schema may not be applied yet. See HANDOFF.md.
        </p>
        <button
          type="button"
          onClick={retry}
          className="min-h-11 rounded-xl bg-flow px-5 text-sm font-semibold text-on-accent"
        >
          Try again
        </button>
      </div>
    )
  }

  if (!ready) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-2 bg-paper px-4">
        <p className="text-sm text-ink-muted">Preparing your ledger…</p>
        <p className="text-xs text-ink-muted/80">
          {slowHint
            ? 'Still working — first login can take a moment…'
            : 'Seeding categories and settings'}
        </p>
      </div>
    )
  }

  return children
}
