/**
 * Tax / finance document categories for staged uploads.
 * Values use Java-style enum constant names so they can align with a future
 * `enum` or DTO in capstoneproject (the current Boot codebase has no document-type enum yet).
 */
export const DOCUMENT_ENTITY_OPTIONS = [
  { value: 'W2', label: 'W-2', description: 'Wage and Tax Statement' },
  { value: 'FORM_1099', label: '1099', description: 'Misc / NEC / contractor income' },
  { value: 'RECEIPT', label: 'Receipt', description: 'Expense receipt' },
  { value: 'INVOICE', label: 'Invoice', description: 'Bill or invoice' },
] as const

export type DocumentEntityValue = (typeof DOCUMENT_ENTITY_OPTIONS)[number]['value']

const ENTITY_VALUES = new Set<string>(DOCUMENT_ENTITY_OPTIONS.map((o) => o.value))

export function isDocumentEntityValue(v: string): v is DocumentEntityValue {
  return ENTITY_VALUES.has(v)
}

/** Best-effort guess from filename (browse / drag-drop); returns null if unclear. */
export function inferDocumentEntityFromFileName(fileName: string): DocumentEntityValue | null {
  const n = fileName.toLowerCase()
  if (/\bw[\s_-]?2\b|w2|wage\s*statement|w-2/.test(n)) return 'W2'
  if (/1099|nec|misc-?1099|1099-?misc|1099-?nec/.test(n)) return 'FORM_1099'
  if (/receipt|expense|register/.test(n)) return 'RECEIPT'
  if (/invoice|bill(ing)?|statement\s*of\s*account/.test(n)) return 'INVOICE'
  return null
}
