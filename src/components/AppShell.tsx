import { NavLink, Outlet } from 'react-router-dom'

const tabs = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/ledger', label: 'Ledger' },
  { to: '/transfers', label: 'Transfers' },
  { to: '/budget', label: 'Budget' },
  { to: '/more', label: 'More' },
] as const

export function AppShell() {
  return (
    <div className="relative mx-auto flex min-h-dvh w-full max-w-lg flex-col">
      <main className="flex-1 overflow-y-auto px-4 pb-32 pt-5">
        <Outlet />
      </main>

      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 px-3"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        <div className="mx-auto max-w-lg rounded-[22px] border border-hairline/80 bg-surface/85 p-1.5 shadow-[var(--glow-flow)] backdrop-blur-xl">
          <ul className="grid grid-cols-5 gap-0.5">
            {tabs.map((tab) => (
              <li key={tab.to}>
                <NavLink
                  to={tab.to}
                  end={'end' in tab ? tab.end : false}
                  className={({ isActive }) =>
                    [
                      'relative flex h-12 flex-col items-center justify-center rounded-[16px] px-1 text-center text-[11px] font-semibold tracking-tight transition-all duration-150',
                      isActive
                        ? 'bg-flow text-white shadow-[0_8px_20px_-10px_rgba(107,63,232,0.9)]'
                        : 'text-ink-muted hover:bg-paper hover:text-ink',
                    ].join(' ')
                  }
                >
                  {tab.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      </nav>
    </div>
  )
}
