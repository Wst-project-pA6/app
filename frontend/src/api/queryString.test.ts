import { describe, expect, it } from 'vitest'
import { toQueryString } from './queryString'

describe('toQueryString', () => {
  it('serializes pagination and sort parameters', () => {
    expect(toQueryString({ page: 2, pageSize: 20, sort: '-createdAt' })).toBe('?page=2&pageSize=20&sort=-createdAt')
  })

  it('joins repeated filter values as a single comma-separated parameter', () => {
    expect(toQueryString({ status: ['ACTIVE', 'DISABLED'] })).toBe('?status=ACTIVE%2CDISABLED')
  })

  it('omits undefined, null and empty-array values entirely', () => {
    expect(toQueryString({ q: undefined, role: null, status: [] })).toBe('')
  })

  it('returns an empty string when there are no parameters', () => {
    expect(toQueryString({})).toBe('')
  })
})
