import { useMemo, useState } from 'react'
import {
  useCategories,
  useDeleteCategory,
  useMergeCategory,
  type CategoryRow,
} from '@/hooks/useCategories'
import { useCategoryUsage, type CategoryUsage } from '@/hooks/useCategoryUsage'
import { COLOR_TOKEN_HEX, type ColorToken } from '@/lib/accounts'

const EMPTY_USAGE: CategoryUsage = { transactionCount: 0, ruleCount: 0, budgetCount: 0 }

function catColor(token: string | null | undefined): string {
  if (token && token in COLOR_TOKEN_HEX) return COLOR_TOKEN_HEX[token as ColorToken]
  return COLOR_TOKEN_HEX['cat-8']
}

/**
 * Lets you clean up categories that "don't work" for you. Unused ones (no
 * transactions, rules, or budgets attached) delete in one click. Used ones
 * require picking a category to merge into first — reassigns their history
 * rather than letting `ON DELETE SET NULL`/`CASCADE` quietly orphan it.
 */
export function CategoryManager() {
  const { data: categories = [] } = useCategories()
  const { data: usage } = useCategoryUsage()
  const deleteCategory = useDeleteCategory()
  const mergeCategory = useMergeCategory()

  const [openParentId, setOpenParentId] = useState<number | null>(null)
  const [mergingId, setMergingId] = useState<number | null>(null)
  const [mergeTarget, setMergeTarget] = useState<string>('')
  const [busyId, setBusyId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const parents = useMemo(
    () => categories.filter((c) => c.parent_id == null && !c.is_system).sort((a, b) => a.name.localeCompare(b.name)),
    [categories],
  )
  const childrenByParent = useMemo(() => {
    const map = new Map<number, CategoryRow[]>()
    for (const c of categories) {
      if (c.parent_id == null) continue
      const list = map.get(c.parent_id) ?? []
      list.push(c)
      map.set(c.parent_id, list)
    }
    for (const list of map.values()) list.sort((a, b) => a.name.localeCompare(b.name))
    return map
  }, [categories])

  function usageFor(id: number): CategoryUsage {
    return usage?.get(id) ?? EMPTY_USAGE
  }

  function isUnused(id: number): boolean {
    const u = usageFor(id)
    return u.transactionCount === 0 && u.ruleCount === 0 && u.budgetCount === 0
  }

  async function handleDelete(cat: CategoryRow) {
    if (!confirm(`Delete "${cat.name}"? This can't be undone.`)) return
    setBusyId(cat.id)
    setError(null)
    try {
      await deleteCategory.mutateAsync(cat.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete category')
    } finally {
      setBusyId(null)
    }
  }

  async function handleMerge(cat: CategoryRow) {
    if (mergeTarget === '') return
    const targetId = Number(mergeTarget)
    const u = usageFor(cat.id)
    const parts = []
    if (u.transactionCount > 0) parts.push(`${u.transactionCount} transaction(s)`)
    if (u.ruleCount > 0) parts.push(`${u.ruleCount} rule(s)`)
    if (u.budgetCount > 0) parts.push(`${u.budgetCount} saved budget(s)`)
    const targetName = categories.find((c) => c.id === targetId)?.name ?? 'the selected category'
    if (
      !confirm(
        `Move ${parts.join(', ')} from "${cat.name}" into "${targetName}", then delete "${cat.name}"?`,
      )
    )
      return
    setBusyId(cat.id)
    setError(null)
    try {
      await mergeCategory.mutateAsync({ sourceId: cat.id, targetId })
      setMergingId(null)
      setMergeTarget('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not merge category')
    } finally {
      setBusyId(null)
    }
  }

  function usageBadge(cat: CategoryRow) {
    const u = usageFor(cat.id)
    if (isUnused(cat.id)) return <span className="text-ink-muted">unused</span>
    const parts = []
    if (u.transactionCount > 0) parts.push(`${u.transactionCount} txn${u.transactionCount === 1 ? '' : 's'}`)
    if (u.ruleCount > 0) parts.push(`${u.ruleCount} rule${u.ruleCount === 1 ? '' : 's'}`)
    if (u.budgetCount > 0) parts.push(`${u.budgetCount} budget${u.budgetCount === 1 ? '' : 's'}`)
    return <span className="text-ink-muted">{parts.join(' · ')}</span>
  }

  function mergeTargetOptions(cat: CategoryRow) {
    return categories
      .filter((c) => c.id !== cat.id && c.kind === cat.kind && !c.is_system && c.parent_id != null)
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  return (
    <div className="space-y-2">
      {parents.map((parent) => {
        const children = childrenByParent.get(parent.id) ?? []
        const open = openParentId === parent.id
        const parentUnused = children.length === 0 && isUnused(parent.id)

        return (
          <div key={parent.id} className="rounded-md border border-hairline">
            <button
              type="button"
              onClick={() => setOpenParentId(open ? null : parent.id)}
              aria-expanded={open}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
            >
              <span className="flex items-center gap-2 text-sm text-ink">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: catColor(parent.color_token) }}
                  aria-hidden
                />
                {parent.name}
              </span>
              <span className="text-xs text-ink-muted">
                {children.length} {children.length === 1 ? 'category' : 'categories'}
              </span>
            </button>

            {open && (
              <div className="space-y-1 border-t border-hairline p-2">
                {children.map((cat) => (
                  <div key={cat.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-ink">{cat.name}</span>
                      <span className="text-xs">{usageBadge(cat)}</span>
                    </div>

                    {mergingId === cat.id ? (
                      <div className="flex items-center gap-2">
                        <select
                          className="field text-xs"
                          value={mergeTarget}
                          onChange={(e) => setMergeTarget(e.target.value)}
                        >
                          <option value="">Merge into…</option>
                          {mergeTargetOptions(cat).map((opt) => (
                            <option key={opt.id} value={opt.id}>
                              {opt.name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          disabled={mergeTarget === '' || busyId === cat.id}
                          onClick={() => void handleMerge(cat)}
                          className="rounded-md bg-flow px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setMergingId(null)
                            setMergeTarget('')
                          }}
                          className="text-xs text-ink-muted"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : isUnused(cat.id) ? (
                      <button
                        type="button"
                        disabled={busyId === cat.id}
                        onClick={() => void handleDelete(cat)}
                        className="rounded-md border border-hairline px-2 py-1 text-xs font-medium text-signal disabled:opacity-50"
                      >
                        Delete
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setMergingId(cat.id)}
                        className="rounded-md border border-hairline px-2 py-1 text-xs font-medium text-ink"
                      >
                        Merge into…
                      </button>
                    )}
                  </div>
                ))}

                {children.length === 0 && (
                  <p className="px-2 py-1 text-xs text-ink-muted">No categories left in this group.</p>
                )}

                {parentUnused && (
                  <button
                    type="button"
                    disabled={busyId === parent.id}
                    onClick={() => void handleDelete(parent)}
                    className="ml-2 rounded-md border border-hairline px-2 py-1 text-xs font-medium text-signal disabled:opacity-50"
                  >
                    Remove empty group
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}

      {error && (
        <p className="text-sm text-signal" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
