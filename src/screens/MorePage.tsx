import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/lib/auth'
import { useAccounts } from '@/hooks/useAccounts'
import { useCategories } from '@/hooks/useCategories'
import { supabase } from '@/lib/supabase'

export function MorePage() {
  const { user, signOut } = useAuth()
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()
  const { data: pendingTransfers = 0 } = useQuery({
    queryKey: ['transfers', 'pending', 'count'],
    queryFn: async (): Promise<number> => {
      if (!supabase) throw new Error('Supabase is not configured')
      const { count, error } = await supabase
        .from('transfers')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending')
      if (error) throw error
      return count ?? 0
    },
  })

  return (
    <section>
      <h1 className="font-display text-[28px] font-semibold tracking-tight text-ink">
        More
      </h1>
      <p className="mt-3 text-sm text-ink-muted">
        Accounts, settings, and import tools for Phase 1–2.
      </p>

      <nav className="mt-8 space-y-2">
        <MoreLink to="/accounts" label="Accounts" meta={`${accounts.length} accounts`} />
        <MoreLink
          to="/transfers"
          label="Transfers"
          meta={pendingTransfers > 0 ? `${pendingTransfers} pending` : 'Review queue'}
        />
        <MoreLink to="/import" label="Import CSV" meta="Map columns, commit rows" />
        <MoreLink to="/imports" label="Import history" meta="Undo a bad import" />
        <MoreLink to="/insights" label="Insights" meta="Trends and merchants" />
        <MoreLink
          to="/settings"
          label="Settings & backup"
          meta={`${categories.filter((c) => !c.parent_id).length} category groups`}
        />
      </nav>

      <div className="mt-8 space-y-3 rounded-lg bg-surface p-4">
        <p className="text-xs uppercase tracking-wide text-ink-muted">Signed in</p>
        <p className="text-sm text-ink">{user?.email ?? '—'}</p>
        <button
          type="button"
          onClick={() => void signOut()}
          className="mt-2 rounded-md border border-hairline px-3 py-2 text-sm font-medium text-ink transition-colors duration-120 hover:border-flow"
        >
          Sign out
        </button>
      </div>
    </section>
  )
}

function MoreLink({ to, label, meta }: { to: string; label: string; meta: string }) {
  return (
    <Link
      to={to}
      className="flex items-center justify-between rounded-lg bg-surface px-4 py-3 transition-colors duration-120 hover:bg-white"
    >
      <span className="text-sm font-medium text-ink">{label}</span>
      <span className="text-xs text-ink-muted">{meta}</span>
    </Link>
  )
}
