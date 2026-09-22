import { describe, expect, it } from 'vitest'
import { validateCalendarWindow } from './validateWindow'

describe('validateCalendarWindow', () => {
  it('accepts a window within 31 days where from is before to', () => {
    const result = validateCalendarWindow('2026-01-01', '2026-01-08')
    expect(result.valid).toBe(true)
    expect(result.fromIso).toBe('2026-01-01T00:00:00.000Z')
    expect(result.toIso).toBe('2026-01-08T00:00:00.000Z')
  })

  it('accepts exactly a 31-day window', () => {
    const result = validateCalendarWindow('2026-01-01', '2026-02-01')
    expect(result.valid).toBe(true)
  })

  it('rejects a window longer than 31 days', () => {
    const result = validateCalendarWindow('2026-01-01', '2026-02-02')
    expect(result.valid).toBe(false)
  })

  it('rejects when from is not before to', () => {
    expect(validateCalendarWindow('2026-01-08', '2026-01-01').valid).toBe(false)
    expect(validateCalendarWindow('2026-01-01', '2026-01-01').valid).toBe(false)
  })

  it('rejects invalid date strings', () => {
    expect(validateCalendarWindow('not-a-date', '2026-01-08').valid).toBe(false)
  })
})
