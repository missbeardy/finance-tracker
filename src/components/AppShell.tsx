import { NavLink, Outlet } from 'react-router-dom'
import { ThemeToggle } from '@/components/ThemeToggle'

const tabs = [
  { to: '/', label: 'Home', end: true, icon: '◈' },
  { to: '/ledger', label: 'Ledger', end: false, icon: '☰' },
  { to: '/insights', label: 'Insights', end: false, icon: '◎' },
  { to: '/budget', label: 'Budget', end: false, icon: '▣' },
  { to: '/more', label: 'More', end: false, icon: '⋯' },
] as const

export function AppShell() {
  return (
    <div className="relative mx-auto flex min-h-dvh w-full max-w-lg flex-col bg-paper">
      <div
        className="pointer-events-none fixed right-3 top-3 z-50"
        style={{ paddingTop: 'max(0.25rem, env(safe-area-inset-top))' }}
      >
        <div className="theme-chip pointer-events-auto rounded-2xl backdrop-blur-xl">
          <ThemeToggle />
        </div>
      </div>

      <main className="flex-1 overflow-y-auto px-4 pb-32 pt-5">
        <Outlet />
      </main>

      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 px-3"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        <div className="nav-pill mx-auto max-w-lg rounded-[22px] p-1.5 backdrop-blur-xl">
          <ul className="grid grid-cols-5 gap-0.5">
            {tabs.map((tab) => (
              <li key={tab.to}>
                <NavLink
                  to={tab.to}
                  end={tab.end}
                  className={({ isActive }) =>
                    [
                      'relative flex h-12 flex-col items-center justify-center rounded-[16px] px-1 text-center text-[11px] font-semibold tracking-tight transition-all duration-150',
                      isActive
                        ? 'bg-flow text-on-accent shadow-[var(--glow-flow)]'
                        : 'text-ink-muted hover:bg-paper-deep hover:text-ink',
                    ].join(' ')
                  }
                >
                  <span className="text-[14px] leading-none" aria-hidden>
                    {tab.icon}
                  </span>
                  <span className="mt-0.5">{tab.label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      </nav>
    </div>
  )
}
