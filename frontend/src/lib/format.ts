import i18n from '@/i18n'

function activeLocale(): string {
  return i18n.language === 'ar' ? 'ar' : 'en'
}

/** Formats an RFC 3339 timestamp using Intl, in the active UI locale. */
export function formatDateTime(value: string | undefined | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(activeLocale(), { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

/** Formats an RFC 3339 timestamp as a date only. */
export function formatDate(value: string | undefined | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(activeLocale(), { dateStyle: 'medium' }).format(date)
}

/** Formats a plain `date` (no time component) value without a timezone shift. */
export function formatDateOnly(value: string | undefined | null): string {
  if (!value) return ''
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return value
  const date = new Date(Date.UTC(year, month - 1, day))
  return new Intl.DateTimeFormat(activeLocale(), { dateStyle: 'medium', timeZone: 'UTC' }).format(date)
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat(activeLocale()).format(value)
}

/**
 * Formats a contract `MoneyAmount`/`DecimalString` (always a decimal
 * string, never a JS number) for display using pure string manipulation —
 * no `Number()`/`parseFloat()` conversion anywhere, so exact decimal
 * precision from the backend is never lost or re-rounded by floating
 * point. Always rendered LTR via the `dir-ltr` class at the call site.
 */
export function formatDecimalString(amount: string, currencyCode?: string): string {
  const negative = amount.startsWith('-')
  const unsigned = negative ? amount.slice(1) : amount
  const [integerPart, decimalPart] = unsigned.split('.')
  const grouped = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const decimals = decimalPart ? `.${decimalPart}` : ''
  const value = `${negative ? '-' : ''}${grouped}${decimals}`
  return currencyCode ? `${value} ${currencyCode}` : value
}

/** Formats the contract's `Money` object ({amount, currency}) — see `formatDecimalString` for the precision rationale. */
export function formatMoney(money: { amount: string; currency: string }): string {
  return formatDecimalString(money.amount, money.currency)
}
