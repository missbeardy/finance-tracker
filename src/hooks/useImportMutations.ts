import { useMutation, useQueryClient } from '@tanstack/react-query'
import { commitImport, undoImport, type CommitImportResult, type CommitRowInput } from '@/lib/import/commit'
import { toast } from '@/lib/toastBus'

export function useCommitImport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: {
      filename: string
      accountId: number | null
      rows: CommitRowInput[]
      mappingProfileHash?: string | null
    }): Promise<CommitImportResult> => commitImport(args),
    onSuccess: async (result) => {
      await qc.invalidateQueries({ queryKey: ['transactions'] })
      await qc.invalidateQueries({ queryKey: ['imports'] })
      await qc.invalidateQueries({ queryKey: ['dashboard'] })
      const skip =
        result.duplicatesSkipped > 0
          ? `, skipped ${result.duplicatesSkipped} duplicates`
          : ''
      toast.success(`Imported ${result.inserted} rows${skip}`)
    },
    // ImportPage shows inline error in the wizard; avoid a duplicate toast.
    meta: { suppressToast: true },
  })
}

export function useUndoImport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (importId: number) => undoImport(importId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['imports'] })
      await qc.invalidateQueries({ queryKey: ['transactions'] })
      await qc.invalidateQueries({ queryKey: ['dashboard'] })
      toast.success('Import undone')
    },
  })
}
