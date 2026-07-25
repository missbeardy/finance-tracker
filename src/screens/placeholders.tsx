export function DashboardPage() {
  return (
    <PlaceholderScreen
      title="Dashboard"
      body="Period totals and the Sankey flow arrive in Phase 5 — after the ledger and transfers are correct."
    />
  )
}

export function LedgerPage() {
  return (
    <PlaceholderScreen
      title="Ledger"
      body="Virtualised transactions land in Phase 3. Import CSVs in Phase 2."
    />
  )
}

export function TransfersPage() {
  return (
    <PlaceholderScreen
      title="Transfers"
      body="Review queue and matching ship in Phase 4. Do not skip it."
    />
  )
}

export function BudgetPage() {
  return (
    <PlaceholderScreen
      title="Budget"
      body="Commitments and the discretionary pool arrive in Phase 6."
    />
  )
}

function PlaceholderScreen({ title, body }: { title: string; body: string }) {
  return (
    <section>
      <h1 className="font-display text-[28px] font-semibold tracking-tight text-ink">
        {title}
      </h1>
      <p className="mt-3 max-w-prose text-sm leading-relaxed text-ink-muted">{body}</p>
      <div className="mt-8 border-t border-hairline pt-6">
        <p className="text-xs uppercase tracking-wide text-ink-muted">Figures</p>
        <p className="money mt-2 text-[44px] leading-none text-ink">$0.00</p>
      </div>
    </section>
  )
}
