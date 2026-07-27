import { useEffect, useState } from 'react'
import { useSettings, useUpdateSettings } from '@/hooks/useSettings'
import { useCategories } from '@/hooks/useCategories'
import { CategoryManager } from '@/components/CategoryManager'
import { useAuth } from '@/lib/auth'
import {
  downloadBackupJson,
  exportLedgerBackup,
  restorePhase1Backup,
  type LedgerBackup,
} from '@/lib/backup'
import { downloadTransactionsCsv, exportTransactionsCsv } from '@/lib/csv/export'
import { parseDollarsToCents, formatAud } from '@/lib/money'
import {
  useCreateSavingsGoal,
  useDeleteSavingsGoal,
  useSavingsGoals,
  useUpdateSavingsGoal,
} from '@/hooks/useSavingsGoals'
import { toast } from '@/lib/toastBus'

export function SettingsPage() {
  const { data: settings, isLoading } = useSettings()
  const { data: categories = [] } = useCategories()
  const updateSettings = useUpdateSettings()
  const { changePassword } = useAuth()
  const { data: goals = [] } = useSavingsGoals()
  const createGoal = useCreateSavingsGoal()
  const updateGoal = useUpdateSavingsGoal()
  const deleteGoal = useDeleteSavingsGoal()

  const [periodType, setPeriodType] = useState('calendar_month')
  const [payday, setPayday] = useState('')
  const [savingsFixed, setSavingsFixed] = useState('')
  const [savingsPercent, setSavingsPercent] = useState('')
  const [cadence, setCadence] = useState('14')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordBusy, setPasswordBusy] = useState(false)

  const [goalName, setGoalName] = useState('')
  const [goalTarget, setGoalTarget] = useState('')
  const [goalCurrent, setGoalCurrent] = useState('')
  const [goalDate, setGoalDate] = useState('')

  useEffect(() => {
    if (!settings) return
    setPeriodType(settings.period_type)
    setPayday(settings.payday ?? '')
    setSavingsFixed(
      settings.savings_target_cents != null
        ? (settings.savings_target_cents / 100).toFixed(2)
        : '',
    )
    setSavingsPercent(
      settings.savings_target_percent != null ? String(settings.savings_target_percent) : '',
    )
    setCadence(String(settings.reminder_cadence_days))
  }, [settings])

  useEffect(() => {
    if (window.location.hash === '#savings-goals') {
      document.getElementById('savings-goals')?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [])

  async function save() {
    setError(null)
    setMessage(null)
    const fixed =
      savingsFixed.trim() === '' ? null : parseDollarsToCents(savingsFixed)
    if (savingsFixed.trim() !== '' && fixed == null) {
      setError('Savings target must look like 500.00')
      return
    }
    const percent =
      savingsPercent.trim() === '' ? null : Number(savingsPercent)
    if (percent != null && (Number.isNaN(percent) || percent < 0 || percent > 100)) {
      setError('Savings percent must be between 0 and 100')
      return
    }

    try {
      await updateSettings.mutateAsync({
        period_type: periodType,
        payday: payday || null,
        savings_target_cents: fixed,
        savings_target_percent: percent,
        reminder_cadence_days: Number(cadence) || 14,
      })
      setMessage('Settings saved.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save settings')
    }
  }

  async function handleExport() {
    setBusy(true)
    setError(null)
    try {
      const backup = await exportLedgerBackup()
      downloadBackupJson(backup)
      setMessage('Backup downloaded.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleExportCsv() {
    setBusy(true)
    setError(null)
    try {
      const blob = await exportTransactionsCsv()
      downloadTransactionsCsv(blob)
      setMessage('Transactions CSV downloaded.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'CSV export failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleImportFile(file: File) {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const text = await file.text()
      const parsed = JSON.parse(text) as LedgerBackup
      if (
        !confirm(
          'Restore this backup? Phase 1 data (accounts, categories, settings, rules) will be replaced. Transactions are not restored in this phase.',
        )
      ) {
        setBusy(false)
        return
      }
      const result = await restorePhase1Backup(parsed)
      setMessage(`Restored: ${result.restored.join(', ')}. Reload to refresh.`)
      window.location.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Restore failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleAddGoal() {
    const target = parseDollarsToCents(goalTarget)
    const current = goalCurrent.trim() ? parseDollarsToCents(goalCurrent) : 0
    if (!goalName.trim() || target == null || target <= 0) {
      toast.error('Goal needs a name and target amount')
      return
    }
    if (current == null) {
      toast.error('Current amount looks invalid')
      return
    }
    await createGoal.mutateAsync({
      name: goalName,
      targetCents: target,
      currentCents: current,
      targetDate: goalDate || null,
    })
    setGoalName('')
    setGoalTarget('')
    setGoalCurrent('')
    setGoalDate('')
    toast.success('Goal added')
  }

  async function handleChangePassword() {
    setPasswordBusy(true)
    setPasswordError(null)
    setPasswordMessage(null)
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match')
      setPasswordBusy(false)
      return
    }
    const result = await changePassword(currentPassword, newPassword)
    setPasswordBusy(false)
    if (result.error) {
      setPasswordError(result.error)
      return
    }
    setPasswordMessage('Password updated.')
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
  }

  if (isLoading) {
    return <p className="text-sm text-ink-muted">Loading settings…</p>
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 className="font-display text-[28px] font-semibold tracking-tight text-ink">
          Settings
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          Period, savings, categories, backup, and account security.
        </p>
      </div>

      <div className="space-y-3 rounded-lg bg-surface p-4">
        <h2 className="text-sm font-medium text-ink">Budget period</h2>
        <label className="block text-xs text-ink-muted">
          Period type
          <select className="field mt-1" value={periodType} onChange={(e) => setPeriodType(e.target.value)}>
            <option value="calendar_month">Calendar month</option>
            <option value="pay_cycle">Pay cycle</option>
          </select>
        </label>
        <label className="block text-xs text-ink-muted">
          Payday
          <input className="field mt-1" type="date" value={payday} onChange={(e) => setPayday(e.target.value)} />
        </label>
        <label className="block text-xs text-ink-muted">
          Overall savings target ($)
          <input className="field mt-1" inputMode="decimal" value={savingsFixed} onChange={(e) => setSavingsFixed(e.target.value)} />
        </label>
        <label className="block text-xs text-ink-muted">
          Or savings % of income
          <input className="field mt-1" inputMode="decimal" value={savingsPercent} onChange={(e) => setSavingsPercent(e.target.value)} />
        </label>
        <label className="block text-xs text-ink-muted">
          Reminder cadence (days)
          <input className="field mt-1" inputMode="numeric" value={cadence} onChange={(e) => setCadence(e.target.value)} />
        </label>
        <button
          type="button"
          onClick={() => void save()}
          className="min-h-11 rounded-xl bg-flow px-4 text-sm font-semibold text-white"
        >
          Save settings
        </button>
      </div>

      <div id="savings-goals" className="space-y-3 rounded-lg bg-surface p-4">
        <h2 className="text-sm font-medium text-ink">Savings goals</h2>
        <p className="text-xs text-ink-muted">
          Multiple sinking funds (holiday, car, Christmas). Overall budget target above still feeds
          the discretionary pool.
        </p>
        <ul className="space-y-3">
          {goals.map((g) => {
            const pct = Math.min(100, Math.round((g.current_cents / g.target_cents) * 100))
            return (
              <li key={g.id} className="rounded-lg border border-hairline p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-ink">{g.name}</p>
                    <p className="money mt-1 text-sm text-ink-muted">
                      {formatAud(g.current_cents)} / {formatAud(g.target_cents)} · {pct}%
                    </p>
                  </div>
                  <button
                    type="button"
                    className="min-h-11 text-xs text-signal"
                    onClick={() => {
                      if (confirm(`Delete “${g.name}”?`)) void deleteGoal.mutateAsync(g.id)
                    }}
                  >
                    Delete
                  </button>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-paper-deep">
                  <div className="h-full rounded-full bg-flow" style={{ width: `${Math.max(pct > 0 ? 4 : 0, pct)}%` }} />
                </div>
                <label className="mt-2 block text-xs text-ink-muted">
                  Update current ($)
                  <input
                    className="field mt-1"
                    inputMode="decimal"
                    defaultValue={(g.current_cents / 100).toFixed(2)}
                    onBlur={(e) => {
                      const cents = parseDollarsToCents(e.target.value)
                      if (cents == null) return
                      void updateGoal.mutateAsync({ id: g.id, currentCents: cents })
                    }}
                  />
                </label>
              </li>
            )
          })}
        </ul>
        <div className="space-y-2 border-t border-hairline pt-3">
          <p className="text-xs font-medium text-ink">Add goal</p>
          <input className="field" placeholder="Name" value={goalName} onChange={(e) => setGoalName(e.target.value)} />
          <input className="field" placeholder="Target $" inputMode="decimal" value={goalTarget} onChange={(e) => setGoalTarget(e.target.value)} />
          <input className="field" placeholder="Current $" inputMode="decimal" value={goalCurrent} onChange={(e) => setGoalCurrent(e.target.value)} />
          <input className="field" type="date" value={goalDate} onChange={(e) => setGoalDate(e.target.value)} />
          <button
            type="button"
            disabled={createGoal.isPending}
            onClick={() => void handleAddGoal()}
            className="min-h-11 rounded-xl border border-hairline px-4 text-sm font-medium text-ink"
          >
            Add goal
          </button>
        </div>
      </div>

      <div className="space-y-3 rounded-lg bg-surface p-4">
        <h2 className="text-sm font-medium text-ink">Categories</h2>
        <CategoryManager />
        <p className="text-xs text-ink-muted">{categories.length} categories</p>
      </div>

      <div className="space-y-3 rounded-lg bg-surface p-4">
        <h2 className="text-sm font-medium text-ink">Password</h2>
        <input className="field" type="password" autoComplete="current-password" placeholder="Current" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
        <input className="field" type="password" autoComplete="new-password" placeholder="New" minLength={6} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        <input className="field" type="password" autoComplete="new-password" placeholder="Confirm new" minLength={6} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
        <button
          type="button"
          disabled={passwordBusy || !currentPassword || !newPassword || !confirmPassword}
          className="min-h-11 rounded-xl bg-flow px-4 text-sm font-semibold text-white disabled:opacity-60"
          onClick={() => void handleChangePassword()}
        >
          {passwordBusy ? 'Changing…' : 'Change password'}
        </button>
        {passwordMessage && <p className="text-sm text-inbound" role="status">{passwordMessage}</p>}
        {passwordError && <p className="text-sm text-signal" role="alert">{passwordError}</p>}
      </div>

      <div className="space-y-3 rounded-lg bg-surface p-4">
        <h2 className="text-sm font-medium text-ink">Backup & export</h2>
        <p className="text-xs text-ink-muted">
          JSON backup is full-fidelity for settings/rules. CSV is spreadsheet-friendly transactions.
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} className="min-h-11 rounded-xl border border-hairline px-4 text-sm" onClick={() => void handleExport()}>
            Export JSON
          </button>
          <button type="button" disabled={busy} className="min-h-11 rounded-xl border border-hairline px-4 text-sm" onClick={() => void handleExportCsv()}>
            Export CSV
          </button>
          <label className="inline-flex min-h-11 items-center rounded-xl border border-hairline px-4 text-sm">
            Restore JSON
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void handleImportFile(file)
                e.target.value = ''
              }}
            />
          </label>
        </div>
      </div>

      {message && <p className="text-sm text-inbound" role="status">{message}</p>}
      {error && <p className="text-sm text-signal" role="alert">{error}</p>}
    </section>
  )
}
