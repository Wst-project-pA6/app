import { describe, expect, it } from 'vitest'
import type { CurrentUser } from '@/api/types'
import { hasAnyPermission } from './permissions'

const baseUser: CurrentUser = {
  id: 'u1',
  email: 'tech@example.edu',
  displayName: 'Tina Technician',
  preferredLocale: 'en',
  roles: ['TECHNICIAN'],
  permissions: ['jobs.read.assigned', 'labor.write', 'parts.read'],
  organizationScopeIds: [],
  mustChangePassword: false,
}

describe('hasAnyPermission', () => {
  it('grants access when the user holds at least one of the required permissions (ANY-OF)', () => {
    expect(hasAnyPermission(baseUser, ['jobs.read', 'jobs.read.assigned'])).toBe(true)
  })

  it('denies access when the user holds none of the required permissions', () => {
    expect(hasAnyPermission(baseUser, ['invoices.read', 'purchasing.read'])).toBe(false)
  })

  it('treats an empty requirement list as authenticated-only, granting any signed-in user', () => {
    expect(hasAnyPermission(baseUser, [])).toBe(true)
  })

  it('denies access when there is no user', () => {
    expect(hasAnyPermission(null, ['jobs.read'])).toBe(false)
  })

  it('denies even an authenticated-only route when there is no user', () => {
    expect(hasAnyPermission(null, [])).toBe(false)
  })
})
