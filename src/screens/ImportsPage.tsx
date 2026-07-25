import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useImports } from '@/hooks/useTransactions'
import { undoImport } from '@/lib/import/commit'

export function ImportsPage() {
  const { data: imports = [], isLoading, error } = useImports()
  const qc = useQueryClient()

  async function handleUndo(id: number, filename: string) {
    if (!confirm(`Undo import “${filename}”? This deletes those transactions.`)) return
    await undoImport(id)
    await qc.invalidateQueries({ queryKey: ['imports'] })
    await qc.invalidateQueries({ queryKey: ['transactions'] })
  }

  return (
    <section className="space-y-6">
      <div>
        <Link to="/import" className="text-xs font-medium text-flow">
          ← Import CSV
        </Link>
        <h1 className="mt-2 font-display text-[28px] font-semibold tracking-tight text-ink">
          Import history
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          Undo removes exactly the rows from that import and unwinds transfer links.
        </p>
      </div>

      {isLoading && <p className="text-sm text-ink-muted">Loading…</p>}
      {error && (
        <p className="text-sm text-signal" role="alert">
          {error.message}
        </p>
      )}

      <ul className="space-y-3">
        {imports.length === 0 && (
          <li className="rounded-lg bg-surface p-4 text-sm text-ink-muted">
            No imports yet.
          </li>
        )}
        {imports.map((row) => (
          <li key={row.id} className="rounded-lg bg-surface p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-ink">{row.filename}</p>
                <p className="mt-1 text-xs text-ink-muted">
                  {row.row_count} rows · {row.duplicates_skipped} duplicates skipped
                  {row.date_min && row.date_max
                    ? ` · ${row.date_min} – ${row.date_max}`
                    : ''}
                </p>
                <p className="mt-1 text-[11px] text-ink-muted">
                  {new Date(row.created_at).toLocaleString('en-AU')}
                </p>
              </div>
              <button
                type="button"
                className="text-xs font-medium text-signal"
                onClick={() => void handleUndo(row.id, row.filename)}
              >
                Undo
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
