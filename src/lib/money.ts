/** Money is integer cents everywhere. Format only at the render boundary. */

export function formatAud(cents: number): string {
  const sign = cents < 0 ? '−' : ''
  const abs = Math.abs(cents)
  const dollars = Math.floor(abs / 100)
  const rem = abs % 100
  return `${sign}$${dollars.toLocaleString('en-AU')}.${rem.toString().padStart(2, '0')}`
}

export function parseDollarsToCents(input: string): number | null {
  const cleaned = input.trim().replace(/[$,\s]/g, '')
  if (!cleaned) return null
  const negative = cleaned.startsWith('-') || cleaned.startsWith('(')
  const numeric = cleaned.replace(/[()+\-]/g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(numeric)) return null
  const [whole, frac = ''] = numeric.split('.')
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, '0').slice(0, 2))
  return negative ? -cents : cents
}
