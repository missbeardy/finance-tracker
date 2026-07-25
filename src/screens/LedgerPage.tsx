import { useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useVirtualizer } from '@tanstack/react-virtual'
import { formatAud } from '@/lib/money'
import { useTransactions } from '@/hooks/useTransactions'
import { useAccounts } from '@/hooks/useAccounts'
import { useCategories } from '@/hooks/useCategories'
import { useUpdateTransactionCategory } from '@/hooks/useUpdateTransactionCategory'

export function LedgerPage() {
  const [params] = useSearchParams()
  const [accountId, setAccountId] = useState<number | ''>('')
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [search, setSearch] = useState(params.get('q') ?? '')
  const [showTransfers, setShowTransfers] = useState(false)
  const [showExcluded, setShowExcluded] = useState(false)

  const filters = useMemo(
    () => ({
      accountId: accountId === '' ? null : accountId,
      categoryId: categoryId === '' ? null : categoryId,
      search,
      showTransfers,
      showExcluded,
    }),
    [accountId, categoryId, search, showTransfers, showExcluded],
  )

  const { data: rows = [], isLoading, error } = useTransactions(filters)
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()
  const updateCategory = useUpdateTransactionCategory()

  const parentRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 56,
    overscan: 12,
  })

  const leafCategories = categories.filter((c) => {
    const hasChildren = categories.some((x) => x.parent_id === c.id)
    return !hasChildren
  })

  return (
    <section className="flex h-[calc(100dvh-5.5rem)] flex-col">
      <div className="shrink-0 space-y-3 pb-3">
        <h1 className="font-display text-[28px] font-semibold tracking-tight text-ink">
          Ledger
        </h1>
        <div className="grid grid-cols-2 gap-2">
          <select
            className="field"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value ? Number(e.target.value) : '')}
          >
            <option value="">All accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <select
            className="field"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : '')}
          >
            <option value="">All categories</option>
            {leafCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <input
          className="field"
          placeholder="Search merchant or description"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex gap-4 text-xs text-ink-muted">
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={showTransfers}
              onChange={(e) => setShowTransfers(e.target.checked)}
            />
            Show transfers
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={showExcluded}
              onChange={(e) => setShowExcluded(e.target.checked)}
            />
            Show excluded
          </label>
        </div>
        <p className="text-xs text-ink-muted">{rows.length} transactions</p>
      </div>

      {isLoading && <p className="text-sm text-ink-muted">Loading ledger…</p>}
      {error && (
        <p className="text-sm text-signal" role="alert">
          {error.message}
        </p>
      )}

      {!isLoading && rows.length === 0 && (
        <p className="text-sm text-ink-muted">
          No transactions yet. Import a CSV from WeMoney to get started.
        </p>
      )}

      <div ref={parentRef} className="min-h-0 flex-1 overflow-y-auto rounded-lg bg-surface">
        <div
          style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}
        >
          {virtualizer.getVirtualItems().map((item) => {
            const row = rows[item.index]
            return (
              <div
                key={row.id}
                className="absolute left-0 top-0 flex w-full items-center gap-2 border-b border-hairline px-3"
                style={{ height: item.size, transform: `translateY(${item.start}px)` }}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink" title={row.description}>
                    {row.merchant}
                  </p>
                  <p className="truncate text-[11px] text-ink-muted">
                    {row.date} · {row.accounts?.name ?? 'Account'}
                    {row.transfer_id ? ' · transfer' : ''}
                  </p>
                </div>
                <select
                  className="max-w-[7.5rem] truncate rounded border border-hairline bg-paper px-1 py-1 text-[11px]"
                  value={row.category_id ?? ''}
                  onChange={(e) => {
                    const next = Number(e.target.value)
                    if (!next) return
                    const apply = confirm(
                      `Apply to all transactions for “${row.merchant}”?`,
                    )
                    void updateCategory.mutateAsync({
                      id: row.id,
                      categoryId: next,
                      applyToMatching: apply,
                      merchant: row.merchant,
                    })
                  }}
                >
                  <option value="">—</option>
                  {leafCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <p className="ledger-mono w-[5.5rem] shrink-0 text-right text-sm text-ink">
                  {formatAud(row.amount)}
                </p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
