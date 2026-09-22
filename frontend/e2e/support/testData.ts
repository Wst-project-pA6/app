/** Small, dependency-free random-data helpers for isolated E2E test data. */

export function uid(): string {
  return Math.random().toString(36).slice(2, 10)
}

/** VIN charset excludes I, O and Q, per ISO 3779 (and this app's own vinFormat validation). */
const VIN_CHARS = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789'

export function randomVin(): string {
  let vin = 'WST0'
  while (vin.length < 17) {
    vin += VIN_CHARS[Math.floor(Math.random() * VIN_CHARS.length)]
  }
  return vin.slice(0, 17)
}

export function randomPlate(): string {
  return `E2E-${uid().toUpperCase()}`
}

export function randomPhoneE164(): string {
  // +20 (Egypt, matching the demo dataset's locale) + 9 random digits.
  const digits = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10)).join('')
  return `+20${digits}`
}

export function isoInDays(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
}

/** `datetime-local` inputs want `YYYY-MM-DDTHH:mm`, no timezone suffix. */
export function datetimeLocalInDays(days: number): string {
  return isoInDays(days).slice(0, 16)
}

export function todayDateOnly(): string {
  return new Date().toISOString().slice(0, 10)
}
