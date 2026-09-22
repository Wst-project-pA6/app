const MAX_WINDOW_DAYS = 31
const MS_PER_DAY = 24 * 60 * 60 * 1000

export interface CalendarWindowResult {
  valid: boolean
  fromIso?: string
  toIso?: string
}

/** Validates a `from`/`to` date-only window against the contract's 31-day maximum and produces UTC RFC3339 boundaries. */
export function validateCalendarWindow(fromDate: string, toDate: string): CalendarWindowResult {
  const fromMs = new Date(`${fromDate}T00:00:00.000Z`).getTime()
  const toMs = new Date(`${toDate}T00:00:00.000Z`).getTime()

  if (Number.isNaN(fromMs) || Number.isNaN(toMs)) {
    return { valid: false }
  }
  if (fromMs >= toMs) {
    return { valid: false }
  }
  if ((toMs - fromMs) / MS_PER_DAY > MAX_WINDOW_DAYS) {
    return { valid: false }
  }

  return { valid: true, fromIso: new Date(fromMs).toISOString(), toIso: new Date(toMs).toISOString() }
}
