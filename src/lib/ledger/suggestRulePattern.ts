/** Suggest a rule pattern from a merchant/description — editable default for "save as rule". */

export function suggestRulePattern(raw: string): string {
  let s = raw.trim()
  if (!s) return ''

  // Drop trailing reference / date-like digit groups: "BEAUDESERT 0724" → "BEAUDESERT"
  s = s.replace(/(?:\s+[A-Z]{0,3}\d{2,})\s*$/i, '')
  s = s.replace(/\s+\d{2,}(?:\s+\d{2,})*\s*$/g, '')
  // Trailing long numeric refs glued on: "COLES123456" keep letters portion lightly
  s = s.replace(/([A-Za-z])\d{4,}\s*$/g, '$1')
  s = s.replace(/\s{2,}/g, ' ').trim()

  return s || raw.trim()
}
