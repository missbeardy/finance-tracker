import { Link } from 'react-router-dom'
import { useImports } from '@/hooks/useTransactions'
import { useUndoImport } from '@/hooks/useImportMutations'
import { QueryError } from '@/components/QueryError'
import { getErrorMessage } from '@/lib/errors'

export function ImportsPage() {
  const { data: imports = [], isLoading, error, refetch } = useImports()
  const undoImport = useUndoImport()

  async function handleUndo(id: number, filename: string) {
    if (!confirm(`Undo import “${filename}”? This deletes those transactions.`)) return
    await undoImport.mutateAsync(id)
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
        <QueryError message={getErrorMessage(error)} onRetry={() => void refetch()} />
      )}

      <ul className="space-y-3">
        {imports.length === 0 && !isLoading && !error && (
          <li className="card p-4 text-sm text-ink-muted">
            No imports yet.
          </li>
        )}
        {imports.map((row) => (
          <li key={row.id} className="card p-4">
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
                className="min-h-11 text-xs font-medium text-signal"
                disabled={undoImport.isPending}
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
