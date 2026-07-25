import { useEffect, useState } from 'react'
import { useSettings, useUpdateSettings } from '@/hooks/useSettings'
import { useCategories } from '@/hooks/useCategories'
import {
  downloadBackupJson,
  exportLedgerBackup,
  restorePhase1Backup,
  type LedgerBackup,
} from '@/lib/backup'
import { parseDollarsToCents, formatAud } from '@/lib/money'

export function SettingsPage() {
  const { data: settings, isLoading } = useSettings()
  const { data: categories = [] } = useCategories()
  const updateSettings = useUpdateSettings()

  const [periodType, setPeriodType] = useState('calendar_month')
  const [payday, setPayday] = useState('')
  const [savingsFixed, setSavingsFixed] = useState('')
  const [savingsPercent, setSavingsPercent] = useState('')
  const [cadence, setCadence] = useState('14')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

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

  const parentCategories = categories.filter((c) => c.parent_id == null)

  return (
    <section className="space-y-8">
      <div>
        <h1 className="font-display text-[28px] font-semibold tracking-tight text-ink">
          Settings
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          Budget period, savings target, and ledger backup.
        </p>
      </div>

      {isLoading ? (
        <p className="text-sm text-ink-muted">Loading…</p>
      ) : (
        <div className="space-y-3 rounded-lg bg-surface p-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-muted">Period</span>
            <select
              className="field"
              value={periodType}
              onChange={(e) => setPeriodType(e.target.value)}
            >
              <option value="calendar_month">Calendar month</option>
              <option value="pay_cycle">Pay cycle</option>
            </select>
          </label>
          {periodType === 'pay_cycle' && (
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink-muted">
                Payday anchor
              </span>
              <input
                type="date"
                className="field"
                value={payday}
                onChange={(e) => setPayday(e.target.value)}
              />
            </label>
          )}
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-muted">
              Savings target (fixed $)
            </span>
            <input
              className="field ledger-mono"
              value={savingsFixed}
              onChange={(e) => setSavingsFixed(e.target.value)}
              placeholder="500.00"
            />
            {settings?.savings_target_cents != null && (
              <span className="mt-1 block text-xs text-ink-muted">
                Current: {formatAud(settings.savings_target_cents)}
              </span>
            )}
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-muted">
              Savings target (% of income)
            </span>
            <input
              className="field ledger-mono"
              value={savingsPercent}
              onChange={(e) => setSavingsPercent(e.target.value)}
              placeholder="20"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-muted">
              Reminder cadence (days)
            </span>
            <select
              className="field"
              value={cadence}
              onChange={(e) => setCadence(e.target.value)}
            >
              <option value="7">Weekly</option>
              <option value="14">Fortnightly</option>
              <option value="30">Monthly</option>
            </select>
          </label>
          <button
            type="button"
            className="rounded-md bg-flow px-3 py-2 text-sm font-medium text-white"
            onClick={() => void save()}
          >
            Save settings
          </button>
        </div>
      )}

      <div className="rounded-lg bg-surface p-4">
        <h2 className="text-sm font-medium text-ink">Categories</h2>
        <p className="mt-1 text-xs text-ink-muted">
          Seeded on first sign-in. {parentCategories.length} top-level groups.
        </p>
        <ul className="mt-3 columns-2 gap-x-4 text-xs text-ink-muted">
          {parentCategories.map((c) => (
            <li key={c.id} className="mb-1">
              {c.name}
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-3 rounded-lg bg-surface p-4">
        <h2 className="text-sm font-medium text-ink">Backup</h2>
        <p className="text-xs text-ink-muted">
          Export the full ledger JSON. Restore currently reloads Phase 1 tables (accounts,
          categories, settings, rules, aliases, commitments, budgets).
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            className="rounded-md border border-hairline px-3 py-2 text-sm"
            onClick={() => void handleExport()}
          >
            Export JSON
          </button>
          <label className="rounded-md border border-hairline px-3 py-2 text-sm">
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

      {message && (
        <p className="text-sm text-inbound" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="text-sm text-signal" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
