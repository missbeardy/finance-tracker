import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { BootstrapGate } from '@/components/BootstrapGate'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { AccountsPage } from '@/screens/AccountsPage'
import { AuthPage } from '@/screens/AuthPage'
import { BudgetPage } from '@/screens/BudgetPage'
import { CommitmentsPage } from '@/screens/CommitmentsPage'
import { DashboardPage } from '@/screens/DashboardPage'
import { ImportPage } from '@/screens/ImportPage'
import { ImportsPage } from '@/screens/ImportsPage'
import { InsightsPage } from '@/screens/InsightsPage'
import { LedgerPage } from '@/screens/LedgerPage'
import { MorePage } from '@/screens/MorePage'
import { SettingsPage } from '@/screens/SettingsPage'
import { TransfersPage } from '@/screens/TransfersPage'
import { useAuth } from '@/lib/auth'

export function App() {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-paper">
        <p className="text-sm text-ink-muted">Loading…</p>
      </div>
    )
  }

  return (
    <Routes>
      <Route
        path="/auth"
        element={session ? <Navigate to="/" replace /> : <AuthPage />}
      />
      <Route
        element={
          <ProtectedRoute>
            <BootstrapGate>
              <AppShell />
            </BootstrapGate>
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="ledger" element={<LedgerPage />} />
        <Route path="transfers" element={<TransfersPage />} />
        <Route path="budget" element={<BudgetPage />} />
        <Route path="commitments" element={<CommitmentsPage />} />
        <Route path="more" element={<MorePage />} />
        <Route path="accounts" element={<AccountsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="import" element={<ImportPage />} />
        <Route path="imports" element={<ImportsPage />} />
        <Route path="insights" element={<InsightsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
