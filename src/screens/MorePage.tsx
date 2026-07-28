import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/lib/auth'
import { useAccounts } from '@/hooks/useAccounts'
import { useCategories } from '@/hooks/useCategories'
import { useUncategorizedCount } from '@/hooks/useUncategorizedTransactions'
import { supabase } from '@/lib/supabase'
import { ThemeToggle } from '@/components/ThemeToggle'
import { useTheme } from '@/lib/theme'

export function MorePage() {
  const { user, signOut } = useAuth()
  const { theme } = useTheme()
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()
  const { data: uncategorizedCount = 0 } = useUncategorizedCount()
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
      <h1 className="font-display pr-14 text-[28px] font-semibold tracking-tight text-ink">
        More
      </h1>
      <p className="mt-3 text-sm text-ink-muted">
        Accounts, settings, and import tools.
      </p>

      <div className="card mt-6 flex items-center justify-between gap-3 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-ink">Appearance</p>
          <p className="text-xs text-ink-muted">
            {theme === 'dark' ? 'Dark navy' : 'Light + gradient'} · tap to switch
          </p>
        </div>
        <ThemeToggle />
      </div>

      <nav className="mt-4 space-y-2">
        <MoreLink
          to="/review"
          label="Review & Categorize"
          meta={
            uncategorizedCount > 0
              ? `${uncategorizedCount} to review`
              : 'Queue clear'
          }
        />
        <MoreLink to="/net-worth" label="Net worth" meta="Balances & assets" />
        <MoreLink to="/debt" label="Debt payoff" meta="Loans & cards" />
        <MoreLink to="/mortgage" label="Mortgage" meta="Balance & amortization" />
        <MoreLink to="/accounts" label="Accounts" meta={`${accounts.length} accounts`} />
        <MoreLink
          to="/transfers"
          label="Transfers"
          meta={pendingTransfers > 0 ? `${pendingTransfers} pending` : 'Review queue'}
        />
        <MoreLink to="/commitments" label="Commitments" meta="Recurring bills & subs" />
        <MoreLink to="/import" label="Import CSV" meta="Map columns, commit rows" />
        <MoreLink to="/imports" label="Import history" meta="Undo a bad import" />
        <MoreLink
          to="/settings"
          label="Settings & backup"
          meta={`${categories.filter((c) => !c.parent_id).length} category groups`}
        />
      </nav>

      <div className="card mt-8 space-y-3 p-4">
        <p className="section-label">Signed in</p>
        <p className="text-sm text-ink">{user?.email ?? '—'}</p>
        <button
          type="button"
          onClick={() => void signOut()}
          className="mt-2 min-h-11 rounded-2xl border border-hairline px-4 text-sm font-medium text-ink transition-colors duration-120 hover:border-flow"
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
      className="card flex min-h-11 items-center justify-between px-4 py-3 transition-transform duration-120 active:scale-[0.99]"
    >
      <span className="text-sm font-medium text-ink">{label}</span>
      <span className="text-xs text-ink-muted">{meta}</span>
    </Link>
  )
}
