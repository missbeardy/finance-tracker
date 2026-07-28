import { useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useVirtualizer } from '@tanstack/react-virtual'
import { formatAud } from '@/lib/money'
import { useTransactions } from '@/hooks/useTransactions'
import { useAccounts } from '@/hooks/useAccounts'
import { useCategories, useCreateCategory, type CategoryRow } from '@/hooks/useCategories'
import { useUpdateTransactionCategory } from '@/hooks/useUpdateTransactionCategory'
import { useMarkAsTransfer } from '@/hooks/useMarkAsTransfer'
import { CategoryManager } from '@/components/CategoryManager'
import { QueryError } from '@/components/QueryError'
import { getErrorMessage } from '@/lib/errors'

function nextColorToken(categories: CategoryRow[]): string {
  const topLevelCount = categories.filter((c) => c.parent_id == null).length
  return `cat-${(topLevelCount % 8) + 1}`
}

export function LedgerPage() {
  const [params] = useSearchParams()
  const [accountId, setAccountId] = useState<number | ''>('')
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [search, setSearch] = useState(params.get('q') ?? '')
  const [showTransfers, setShowTransfers] = useState(false)
  const [showExcluded, setShowExcluded] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [addCategoryOpen, setAddCategoryOpen] = useState(false)
  const [manageCategoriesOpen, setManageCategoriesOpen] = useState(false)
  const [addCategoryTargetRowId, setAddCategoryTargetRowId] = useState<number | null>(null)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryParentId, setNewCategoryParentId] = useState<number | ''>('')
  const [detailRowId, setDetailRowId] = useState<number | null>(null)

  const filters = useMemo(
    () => ({
      accountId: accountId === '' ? null : accountId,
      categoryId: categoryId === '' ? null : categoryId,
      search,
      showTransfers,
      showExcluded,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    }),
    [accountId, categoryId, search, showTransfers, showExcluded, dateFrom, dateTo],
  )

  const { data: rows = [], isLoading, error, refetch } = useTransactions(filters)
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()
  const updateCategory = useUpdateTransactionCategory()
  const createCategory = useCreateCategory()
  const markAsTransfer = useMarkAsTransfer()

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
  const parentCategories = categories.filter((c) => c.parent_id == null)
  const internalTransferCategory = categories.find(
    (c) => c.kind === 'transfer' && c.name === 'Internal Transfer',
  )
  const detailRow = rows.find((r) => r.id === detailRowId) ?? null

  function openAddCategory(targetRowId: number | null) {
    setAddCategoryTargetRowId(targetRowId)
    setNewCategoryName('')
    setNewCategoryParentId('')
    setAddCategoryOpen(true)
  }

  async function handleCreateCategory() {
    const name = newCategoryName.trim()
    if (!name) return
    const parent =
      newCategoryParentId === ''
        ? null
        : (categories.find((c) => c.id === newCategoryParentId) ?? null)
    const kind = parent ? (parent.kind as 'expense' | 'income') : 'expense'
    const colorToken = parent ? parent.color_token : nextColorToken(categories)

    const created = await createCategory.mutateAsync({
      name,
      kind,
      parentId: parent?.id ?? null,
      colorToken,
    })

    if (addCategoryTargetRowId != null) {
      const row = rows.find((r) => r.id === addCategoryTargetRowId)
      await updateCategory.mutateAsync({
        id: addCategoryTargetRowId,
        categoryId: created.id,
        merchant: row?.merchant,
      })
    }

    setAddCategoryOpen(false)
    setAddCategoryTargetRowId(null)
  }

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
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-[11px] text-ink-muted">
            From
            <input
              type="date"
              className="field mt-1"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </label>
          <label className="block text-[11px] text-ink-muted">
            To
            <input
              type="date"
              className="field mt-1"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </label>
        </div>
        <div className="flex gap-4">
          <button
            type="button"
            className="text-xs font-medium text-flow"
            onClick={() => openAddCategory(null)}
          >
            + New category
          </button>
          <button
            type="button"
            className="text-xs font-medium text-flow"
            onClick={() => setManageCategoriesOpen(true)}
          >
            Manage categories
          </button>
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
        <QueryError message={getErrorMessage(error)} onRetry={() => void refetch()} />
      )}

      {!isLoading && rows.length === 0 && (
        <p className="text-sm text-ink-muted">
          No transactions yet. Import a CSV from WeMoney to get started.
        </p>
      )}

      <div ref={parentRef} className="min-h-0 flex-1 overflow-y-auto card">
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
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => setDetailRowId(row.id)}
                >
                  <p className="truncate text-sm font-medium text-ink">{row.merchant}</p>
                  <p className="truncate text-[11px] text-ink-muted">
                    {row.date} · {row.accounts?.name ?? 'Account'}
                    {row.transfer_id ? ' · transfer' : ''}
                  </p>
                </button>
                <select
                  className="max-w-[7.5rem] truncate rounded border border-hairline bg-paper px-1 py-1 text-[11px]"
                  value={row.category_id ?? ''}
                  onChange={(e) => {
                    if (e.target.value === 'new') {
                      openAddCategory(row.id)
                      return
                    }
                    if (e.target.value === 'transfer') {
                      void markAsTransfer.mutateAsync({
                        transactionId: row.id,
                        accountId: row.account_id,
                        amount: row.amount,
                        categoryId: internalTransferCategory?.id ?? null,
                      })
                      return
                    }
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
                  <option value="new">+ Add category…</option>
                  <option value="transfer">↔ Mark as transfer</option>
                </select>
                <p className="ledger-mono w-[5.5rem] shrink-0 text-right text-sm text-ink">
                  {formatAud(row.amount)}
                </p>
              </div>
            )
          })}
        </div>
      </div>

      {addCategoryOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center"
          onClick={() => setAddCategoryOpen(false)}
        >
          <div
            className="w-full max-w-sm card p-4 shadow-soft"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-display text-base font-semibold text-ink">New category</h2>
            <input
              className="field mt-3"
              placeholder="Category name"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              autoFocus
            />
            <select
              className="field mt-2"
              value={newCategoryParentId}
              onChange={(e) =>
                setNewCategoryParentId(e.target.value ? Number(e.target.value) : '')
              }
            >
              <option value="">No group (top-level)</option>
              {parentCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {createCategory.isError && (
              <p className="mt-2 text-xs text-signal" role="alert">
                {createCategory.error instanceof Error
                  ? createCategory.error.message
                  : 'Could not create category.'}
              </p>
            )}
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-md border border-hairline px-3 py-1.5 text-xs"
                onClick={() => setAddCategoryOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={createCategory.isPending || !newCategoryName.trim()}
                className="rounded-md bg-flow px-3 py-1.5 text-xs font-medium text-on-accent disabled:opacity-50"
                onClick={() => void handleCreateCategory()}
              >
                {createCategory.isPending ? 'Adding…' : 'Add category'}
              </button>
            </div>
          </div>
        </div>
      )}

      {manageCategoriesOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center"
          onClick={() => setManageCategoriesOpen(false)}
        >
          <div
            className="max-h-[80vh] w-full max-w-sm overflow-y-auto card p-4 shadow-soft"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-base font-semibold text-ink">Manage categories</h2>
                <p className="mt-1 text-xs text-ink-muted">
                  Rename or delete top-level groups you don&apos;t use. Merge ones that still have
                  history into another group.
                </p>
              </div>
              <button
                type="button"
                className="shrink-0 text-ink-muted"
                aria-label="Close"
                onClick={() => setManageCategoriesOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className="mt-3">
              <CategoryManager />
            </div>
          </div>
        </div>
      )}

      {detailRow && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center"
          onClick={() => setDetailRowId(null)}
        >
          <div
            className="w-full max-w-sm card p-4 shadow-soft"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-display break-words text-base font-semibold text-ink">
                {detailRow.merchant}
              </h2>
              <button
                type="button"
                className="shrink-0 text-ink-muted"
                aria-label="Close"
                onClick={() => setDetailRowId(null)}
              >
                ✕
              </button>
            </div>
            {detailRow.description && detailRow.description !== detailRow.merchant && (
              <p className="mt-1 break-words text-sm text-ink-muted">{detailRow.description}</p>
            )}

            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-ink-muted">Amount</dt>
                <dd className="ledger-mono text-ink">{formatAud(detailRow.amount)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-ink-muted">Date</dt>
                <dd className="text-ink">{detailRow.date}</dd>
              </div>
              {detailRow.posted_date && detailRow.posted_date !== detailRow.date && (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-ink-muted">Posted</dt>
                  <dd className="text-ink">{detailRow.posted_date}</dd>
                </div>
              )}
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-ink-muted">Account</dt>
                <dd className="text-ink">{detailRow.accounts?.name ?? '—'}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-ink-muted">Category</dt>
                <dd className="text-ink">{detailRow.categories?.name ?? 'Uncategorised'}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-ink-muted">Status</dt>
                <dd className="text-ink">
                  {detailRow.transfer_id ? 'Transfer' : detailRow.status}
                </dd>
              </div>
              {detailRow.notes && (
                <div>
                  <dt className="text-ink-muted">Notes</dt>
                  <dd className="mt-1 break-words text-ink">{detailRow.notes}</dd>
                </div>
              )}
            </dl>

            <div className="mt-4 flex justify-end gap-2">
              {detailRow.transfer_id == null && (
                <button
                  type="button"
                  disabled={markAsTransfer.isPending}
                  className="rounded-md border border-hairline px-3 py-1.5 text-xs disabled:opacity-50"
                  onClick={() => {
                    void markAsTransfer.mutateAsync({
                      transactionId: detailRow.id,
                      accountId: detailRow.account_id,
                      amount: detailRow.amount,
                      categoryId: internalTransferCategory?.id ?? null,
                    })
                    setDetailRowId(null)
                  }}
                >
                  ↔ Mark as transfer
                </button>
              )}
              <button
                type="button"
                className="rounded-md bg-flow px-3 py-1.5 text-xs font-medium text-on-accent"
                onClick={() => setDetailRowId(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
