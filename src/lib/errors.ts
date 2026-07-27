/** Normalise unknown / Supabase errors into a short user-facing string. */
export function getErrorMessage(error: unknown, fallback = 'Something went wrong'): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error.trim()) return error
  if (error && typeof error === 'object') {
    const e = error as { message?: string; code?: string; hint?: string; details?: string }
    if (e.message) {
      const parts = [e.message]
      if (e.code) parts.push(`(${e.code})`)
      if (e.hint) parts.push(e.hint)
      return parts.join(' — ')
    }
  }
  return fallback
}

export function formatSupabaseError(
  prefix: string,
  error: { message?: string; code?: string; details?: string; hint?: string },
): string {
  const parts = [prefix]
  if (error.message) parts.push(error.message)
  if (error.code) parts.push(`(${error.code})`)
  if (error.hint) parts.push(error.hint)
  return parts.join(' — ')
}

export function isUniqueViolation(error: { code?: string; message?: string }): boolean {
  return error.code === '23505' || (error.message?.toLowerCase().includes('duplicate') ?? false)
}
