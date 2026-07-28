import { useMemo, useState } from 'react'
import {
  useCategories,
  useDeleteCategory,
  useDeleteCategoryGroup,
  useMergeCategory,
  useMergeCategoryGroup,
  useUpdateCategory,
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
 * Manage top-level groups and leaf categories: rename, delete unused, or merge
 * used ones (including whole groups) so you can drop seed categories you don't use.
 */
export function CategoryManager() {
  const { data: categories = [] } = useCategories()
  const { data: usage } = useCategoryUsage()
  const updateCategory = useUpdateCategory()
  const deleteCategory = useDeleteCategory()
  const deleteGroup = useDeleteCategoryGroup()
  const mergeCategory = useMergeCategory()
  const mergeGroup = useMergeCategoryGroup()

  const [openParentId, setOpenParentId] = useState<number | null>(null)
  const [renamingId, setRenamingId] = useState<number | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [mergingId, setMergingId] = useState<number | null>(null)
  const [mergeTarget, setMergeTarget] = useState('')
  const [busyId, setBusyId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const parents = useMemo(
    () =>
      categories
        .filter((c) => c.parent_id == null && !c.is_system)
        .sort((a, b) => a.name.localeCompare(b.name)),
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
    return usage?.[String(id)] ?? EMPTY_USAGE
  }

  function isUnused(id: number): boolean {
    const u = usageFor(id)
    return u.transactionCount === 0 && u.ruleCount === 0 && u.budgetCount === 0
  }

  function groupFullyUnused(parentId: number): boolean {
    if (!isUnused(parentId)) return false
    return (childrenByParent.get(parentId) ?? []).every((c) => isUnused(c.id))
  }

  function startRename(cat: CategoryRow) {
    setRenamingId(cat.id)
    setRenameValue(cat.name)
    setMergingId(null)
    setMergeTarget('')
    setError(null)
  }

  async function saveRename(cat: CategoryRow) {
    const next = renameValue.trim()
    if (!next || next === cat.name) {
      setRenamingId(null)
      return
    }
    setBusyId(cat.id)
    setError(null)
    try {
      await updateCategory.mutateAsync({ id: cat.id, name: next })
      setRenamingId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not rename category')
    } finally {
      setBusyId(null)
    }
  }

  async function handleDeleteLeaf(cat: CategoryRow) {
    if (!confirm(`Delete “${cat.name}”? This can't be undone.`)) return
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

  async function handleDeleteGroup(parent: CategoryRow) {
    const children = childrenByParent.get(parent.id) ?? []
    if (!groupFullyUnused(parent.id)) {
      setError('This group still has used categories — merge it into another group instead.')
      return
    }
    const childNote =
      children.length > 0
        ? ` and its ${children.length} subcategor${children.length === 1 ? 'y' : 'ies'}`
        : ''
    if (!confirm(`Delete “${parent.name}”${childNote}? This can't be undone.`)) return
    setBusyId(parent.id)
    setError(null)
    try {
      await deleteGroup.mutateAsync({
        parentId: parent.id,
        childIds: children.map((c) => c.id),
      })
      if (openParentId === parent.id) setOpenParentId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete group')
    } finally {
      setBusyId(null)
    }
  }

  async function handleMergeLeaf(cat: CategoryRow) {
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
        `Move ${parts.join(', ') || 'this category'} from “${cat.name}” into “${targetName}”, then delete “${cat.name}”?`,
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

  async function handleMergeGroup(parent: CategoryRow) {
    if (mergeTarget === '') return
    const targetParentId = Number(mergeTarget)
    const targetParent = categories.find((c) => c.id === targetParentId)
    const targetChildren = childrenByParent.get(targetParentId) ?? []
    const fallback =
      targetChildren[0] ??
      categories.find((c) => c.parent_id != null && c.kind === parent.kind && !c.is_system)
    if (!fallback) {
      setError('Target group needs at least one subcategory, or create one first.')
      return
    }
    const children = childrenByParent.get(parent.id) ?? []
    if (
      !confirm(
        `Move ${children.length} subcategor${children.length === 1 ? 'y' : 'ies'} from “${parent.name}” into “${targetParent?.name ?? 'that group'}”, then delete “${parent.name}”?`,
      )
    )
      return
    setBusyId(parent.id)
    setError(null)
    try {
      await mergeGroup.mutateAsync({
        sourceParentId: parent.id,
        targetParentId,
        fallbackCategoryId: fallback.id,
      })
      setMergingId(null)
      setMergeTarget('')
      setOpenParentId(targetParentId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not merge group')
    } finally {
      setBusyId(null)
    }
  }

  function leafMergeTargets(cat: CategoryRow) {
    return categories
      .filter(
        (c) =>
          c.id !== cat.id &&
          c.kind === cat.kind &&
          !c.is_system &&
          c.parent_id != null,
      )
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  function groupMergeTargets(parent: CategoryRow) {
    return parents.filter((p) => p.id !== parent.id && p.kind === parent.kind)
  }

  function usageBadge(cat: CategoryRow) {
    if (isUnused(cat.id)) return <span className="text-ink-muted">unused</span>
    const u = usageFor(cat.id)
    const parts = []
    if (u.transactionCount > 0)
      parts.push(`${u.transactionCount} txn${u.transactionCount === 1 ? '' : 's'}`)
    if (u.ruleCount > 0) parts.push(`${u.ruleCount} rule${u.ruleCount === 1 ? '' : 's'}`)
    if (u.budgetCount > 0)
      parts.push(`${u.budgetCount} budget${u.budgetCount === 1 ? '' : 's'}`)
    return <span className="text-ink-muted">{parts.join(' · ')}</span>
  }

  function actionButtons(cat: CategoryRow, kind: 'leaf' | 'group') {
    const busy = busyId === cat.id
    if (mergingId === cat.id) {
      const options = kind === 'group' ? groupMergeTargets(cat) : leafMergeTargets(cat)
      return (
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
          <select
            className="field min-h-11 text-sm"
            value={mergeTarget}
            onChange={(e) => setMergeTarget(e.target.value)}
          >
            <option value="">{kind === 'group' ? 'Merge group into…' : 'Merge into…'}</option>
            {options.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.name}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={mergeTarget === '' || busy}
              onClick={() =>
                void (kind === 'group' ? handleMergeGroup(cat) : handleMergeLeaf(cat))
              }
              className="min-h-11 rounded-xl bg-flow px-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              Confirm
            </button>
            <button
              type="button"
              onClick={() => {
                setMergingId(null)
                setMergeTarget('')
              }}
              className="min-h-11 px-3 text-sm text-ink-muted"
            >
              Cancel
            </button>
          </div>
        </div>
      )
    }

    const canDelete =
      kind === 'group' ? groupFullyUnused(cat.id) : isUnused(cat.id)

    return (
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => startRename(cat)}
          className="min-h-11 rounded-xl border border-hairline px-3 text-sm font-medium text-ink disabled:opacity-50"
        >
          Rename
        </button>
        {canDelete ? (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void (kind === 'group' ? handleDeleteGroup(cat) : handleDeleteLeaf(cat))
            }
            className="min-h-11 rounded-xl border border-hairline px-3 text-sm font-medium text-signal disabled:opacity-50"
          >
            Delete
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setMergingId(cat.id)
              setMergeTarget('')
              setRenamingId(null)
            }}
            className="min-h-11 rounded-xl border border-hairline px-3 text-sm font-medium text-ink disabled:opacity-50"
          >
            {kind === 'group' ? 'Merge group…' : 'Merge into…'}
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-ink-muted">
        Rename or delete groups you don&apos;t use. If a group still has history, merge it into
        another group instead.
      </p>

      {parents.map((parent) => {
        const children = childrenByParent.get(parent.id) ?? []
        const open = openParentId === parent.id

        return (
          <div key={parent.id} className="rounded-lg border border-hairline bg-surface">
            <div className="flex items-start gap-2 p-3">
              <button
                type="button"
                onClick={() => setOpenParentId(open ? null : parent.id)}
                aria-expanded={open}
                className="mt-1 flex min-h-11 min-w-11 items-center justify-center text-ink-muted"
                aria-label={open ? 'Collapse group' : 'Expand group'}
              >
                <svg
                  className={['h-4 w-4 transition-transform', open ? 'rotate-180' : ''].join(' ')}
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden
                >
                  <path
                    d="M5.25 7.5 10 12.25 14.75 7.5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>

              <div className="min-w-0 flex-1 space-y-2">
                {renamingId === parent.id ? (
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      className="field min-h-11"
                      value={renameValue}
                      autoFocus
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void saveRename(parent)
                        if (e.key === 'Escape') setRenamingId(null)
                      }}
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={busyId === parent.id || !renameValue.trim()}
                        onClick={() => void saveRename(parent)}
                        className="min-h-11 rounded-xl bg-flow px-3 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setRenamingId(null)}
                        className="min-h-11 px-3 text-sm text-ink-muted"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: catColor(parent.color_token) }}
                      aria-hidden
                    />
                    <p className="text-sm font-semibold text-ink">{parent.name}</p>
                    <span className="text-xs text-ink-muted">
                      {children.length} sub · {usageBadge(parent)}
                    </span>
                  </div>
                )}
                {renamingId !== parent.id && actionButtons(parent, 'group')}
              </div>
            </div>

            {open && (
              <ul className="space-y-2 border-t border-hairline p-3">
                {children.length === 0 && (
                  <li className="text-xs text-ink-muted">No subcategories in this group.</li>
                )}
                {children.map((cat) => (
                  <li key={cat.id} className="rounded-md bg-paper-deep/40 p-3">
                    {renamingId === cat.id ? (
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <input
                          className="field min-h-11"
                          value={renameValue}
                          autoFocus
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void saveRename(cat)
                            if (e.key === 'Escape') setRenamingId(null)
                          }}
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={busyId === cat.id || !renameValue.trim()}
                            onClick={() => void saveRename(cat)}
                            className="min-h-11 rounded-xl bg-flow px-3 text-sm font-semibold text-white disabled:opacity-50"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setRenamingId(null)}
                            className="min-h-11 px-3 text-sm text-ink-muted"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium text-ink">{cat.name}</p>
                          <span className="text-xs">{usageBadge(cat)}</span>
                        </div>
                        {actionButtons(cat, 'leaf')}
                      </>
                    )}
                  </li>
                ))}
              </ul>
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
