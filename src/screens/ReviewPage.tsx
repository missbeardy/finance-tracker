import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatAud } from '@/lib/money'
import { QueryError } from '@/components/QueryError'
import { getErrorMessage } from '@/lib/errors'
import { useCategories } from '@/hooks/useCategories'
import { useUncategorizedTransactions } from '@/hooks/useUncategorizedTransactions'
import {
  useApplyRulesToUncategorized,
  useBulkUpdateCategory,
  useCreateRule,
  useRules,
  previewApplyRulesToUncategorized,
} from '@/hooks/useRules'
import { useUpdateTransactionCategory } from '@/hooks/useUpdateTransactionCategory'
import { suggestRulePattern } from '@/lib/ledger/suggestRulePattern'
import type { TransactionRow } from '@/hooks/useTransactions'

type SaveRulePrompt = {
  merchant: string
  pattern: string
  categoryId: number
  categoryName: string
}

export function ReviewPage() {
  const { data: rows = [], isLoading, error, refetch } = useUncategorizedTransactions()
  const { data: categories = [] } = useCategories()
  const { data: rules = [] } = useRules()
  const updateCategory = useUpdateTransactionCategory()
  const bulkUpdate = useBulkUpdateCategory()
  const createRule = useCreateRule()
  const applyRules = useApplyRulesToUncategorized()

  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [bulkCategoryId, setBulkCategoryId] = useState<number | ''>('')
  const [savePrompt, setSavePrompt] = useState<SaveRulePrompt | null>(null)
  const [applyPreview, setApplyPreview] = useState<number | null>(null)
  const [applyingPreview, setApplyingPreview] = useState(false)

  const leafCategories = useMemo(
    () =>
      categories.filter((c) => {
        if (c.name === 'Uncategorised' && c.parent_id == null) return false
        const hasChildren = categories.some((x) => x.parent_id === c.id)
        return !hasChildren
      }),
    [categories],
  )

  const categoryNameById = useMemo(() => {
    const map = new Map<number, string>()
    for (const c of categories) map.set(c.id, c.name)
    return map
  }, [categories])

  const totalCents = useMemo(
    () => rows.reduce((sum, r) => sum + Math.abs(r.amount), 0),
    [rows],
  )

  const allSelected = rows.length > 0 && selected.size === rows.length

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set())
      return
    }
    setSelected(new Set(rows.map((r) => r.id)))
  }

  function toggleOne(id: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function openSavePrompt(row: TransactionRow, categoryId: number) {
    setSavePrompt({
      merchant: row.merchant,
      pattern: suggestRulePattern(row.merchant || row.description),
      categoryId,
      categoryName: categoryNameById.get(categoryId) ?? 'category',
    })
  }

  async function assignOne(row: TransactionRow, categoryId: number) {
    await updateCategory.mutateAsync({ id: row.id, categoryId })
    setSelected((prev) => {
      const next = new Set(prev)
      next.delete(row.id)
      return next
    })
    openSavePrompt(row, categoryId)
  }

  async function assignBulk() {
    if (!bulkCategoryId || selected.size === 0) return
    const ids = [...selected]
    await bulkUpdate.mutateAsync({ ids, categoryId: bulkCategoryId })
    setSelected(new Set())
    setBulkCategoryId('')
  }

  async function handlePreviewApplyRules() {
    setApplyingPreview(true)
    try {
      const preview = await previewApplyRulesToUncategorized(rows, rules)
      setApplyPreview(preview.wouldUpdate)
    } finally {
      setApplyingPreview(false)
    }
  }

  async function handleConfirmApplyRules() {
    await applyRules.mutateAsync({ rows, rules })
    setApplyPreview(null)
  }

  async function handleSaveRule(alsoApply: boolean) {
    if (!savePrompt || !savePrompt.pattern.trim()) return
    const rule = await createRule.mutateAsync({
      pattern: savePrompt.pattern.trim(),
      categoryId: savePrompt.categoryId,
    })
    setSavePrompt(null)
    if (alsoApply) {
      await applyRules.mutateAsync({ rows, rules: [...rules, rule], ruleId: rule.id })
    }
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-4">
      <div>
        <Link to="/more" className="text-xs font-medium text-flow">
          ← More
        </Link>
        <h1 className="mt-2 font-display text-[28px] font-semibold tracking-tight text-ink">
          Review & Categorize
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          Clear uncategorised transactions. Assign one-by-one or in bulk, then optionally save a
          rule for next time.
        </p>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3 card p-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-ink-muted">Remaining</p>
          <p className="mt-1 font-display text-[20px] font-semibold text-ink">
            {rows.length}
            <span className="ml-2 text-sm font-normal text-ink-muted">
              · {formatAud(totalCents)} absolute
            </span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {applyPreview == null ? (
            <button
              type="button"
              disabled={rows.length === 0 || applyingPreview || rules.length === 0}
              onClick={() => void handlePreviewApplyRules()}
              className="min-h-11 rounded-xl border border-hairline px-4 text-sm font-medium text-ink disabled:opacity-50"
            >
              {applyingPreview ? 'Checking…' : 'Apply rules…'}
            </button>
          ) : (
            <>
              <p className="flex min-h-11 items-center text-sm text-ink-muted">
                {applyPreview} would update
              </p>
              <button
                type="button"
                onClick={() => setApplyPreview(null)}
                className="min-h-11 rounded-xl border border-hairline px-4 text-sm text-ink"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={applyPreview === 0 || applyRules.isPending}
                onClick={() => void handleConfirmApplyRules()}
                className="min-h-11 rounded-xl bg-flow px-4 text-sm font-semibold text-on-accent disabled:opacity-50"
              >
                {applyRules.isPending ? 'Applying…' : 'Confirm'}
              </button>
            </>
          )}
        </div>
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 card p-3">
          <p className="text-sm text-ink">{selected.size} selected</p>
          <select
            className="field min-h-11 min-w-[10rem] flex-1"
            value={bulkCategoryId}
            onChange={(e) => setBulkCategoryId(e.target.value ? Number(e.target.value) : '')}
          >
            <option value="">Assign category…</option>
            {leafCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!bulkCategoryId || bulkUpdate.isPending}
            onClick={() => void assignBulk()}
            className="min-h-11 rounded-xl bg-flow px-4 text-sm font-semibold text-on-accent disabled:opacity-50"
          >
            {bulkUpdate.isPending ? 'Saving…' : 'Apply'}
          </button>
        </div>
      )}

      {isLoading && <p className="text-sm text-ink-muted">Loading queue…</p>}
      {error && (
        <QueryError message={getErrorMessage(error)} onRetry={() => void refetch()} />
      )}

      {!isLoading && rows.length === 0 && !error && (
        <p className="card p-4 text-sm text-ink-muted">
          Queue clear — every transaction has a category.
        </p>
      )}

      {rows.length > 0 && (
        <div className="min-h-0 flex-1 overflow-y-auto card">
          <div className="flex items-center gap-2 border-b border-hairline px-3 py-2">
            <label className="flex min-h-11 min-w-11 items-center justify-center">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                aria-label="Select all"
              />
            </label>
            <p className="text-xs text-ink-muted">Select all visible</p>
          </div>
          <ul>
            {rows.map((row) => (
              <li
                key={row.id}
                className="flex items-center gap-2 border-b border-hairline px-3 py-2"
              >
                <label className="flex min-h-11 min-w-11 items-center justify-center">
                  <input
                    type="checkbox"
                    checked={selected.has(row.id)}
                    onChange={() => toggleOne(row.id)}
                    aria-label={`Select ${row.merchant}`}
                  />
                </label>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{row.merchant}</p>
                  <p className="truncate text-xs text-ink-muted">
                    {row.date} · {row.accounts?.name ?? 'Account'}
                  </p>
                </div>
                <select
                  className="field max-w-[9rem] shrink-0 text-sm"
                  value=""
                  disabled={updateCategory.isPending}
                  aria-label={`Category for ${row.merchant}`}
                  onChange={(e) => {
                    const next = Number(e.target.value)
                    if (!next) return
                    void assignOne(row, next)
                  }}
                >
                  <option value="">Set…</option>
                  {leafCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <p className="ledger-mono w-[5.5rem] shrink-0 text-right text-sm text-ink">
                  {formatAud(row.amount)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {savePrompt && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center"
          onClick={() => setSavePrompt(null)}
        >
          <div
            className="w-full max-w-sm card p-4 shadow-soft"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-display text-base font-semibold text-ink">Save as rule?</h2>
            <p className="mt-2 text-sm text-ink-muted">
              Always categorise matching merchants as{' '}
              <span className="font-medium text-ink">{savePrompt.categoryName}</span>?
            </p>
            <label className="mt-3 block text-xs text-ink-muted">
              Pattern (contains)
              <input
                className="field mt-1"
                value={savePrompt.pattern}
                onChange={(e) =>
                  setSavePrompt((prev) =>
                    prev ? { ...prev, pattern: e.target.value } : prev,
                  )
                }
              />
            </label>
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                disabled={createRule.isPending || applyRules.isPending || !savePrompt.pattern.trim()}
                className="min-h-11 rounded-xl bg-flow px-4 text-sm font-semibold text-on-accent disabled:opacity-50"
                onClick={() => void handleSaveRule(true)}
              >
                Save rule & apply to queue
              </button>
              <button
                type="button"
                disabled={createRule.isPending || !savePrompt.pattern.trim()}
                className="min-h-11 rounded-xl border border-hairline px-4 text-sm font-medium text-ink disabled:opacity-50"
                onClick={() => void handleSaveRule(false)}
              >
                Save rule only
              </button>
              <button
                type="button"
                className="min-h-11 text-sm text-ink-muted"
                onClick={() => setSavePrompt(null)}
              >
                Skip
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
