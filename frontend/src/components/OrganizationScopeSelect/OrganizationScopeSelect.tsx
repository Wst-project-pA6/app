import { useTranslation } from 'react-i18next'
import { useOrganizationScopesQuery } from '@/api/hooks/organizationScopes'
import { useAuth } from '@/auth/useAuth'
import { hasAnyPermission } from '@/auth/permissions'
import { Select } from '../Select/Select'

export interface OrganizationScopeSelectProps {
  id: string
  value: string
  onChange: (value: string) => void
  required?: boolean
  disabled?: boolean
}

/**
 * Organization-scope picker that never requires `scopes.manage` just to
 * choose a scope while creating something else (a customer, a bay). When
 * the caller can list scopes (`scopes.manage` or `users.read`), it shows
 * friendly names; otherwise it falls back to the authenticated principal's
 * own `organizationScopeIds` from `/auth/me`, rendered as raw IDs.
 */
export function OrganizationScopeSelect({ id, value, onChange, required, disabled }: OrganizationScopeSelectProps) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const canList = hasAnyPermission(user, ['scopes.manage', 'users.read'])

  const scopesQuery = useOrganizationScopesQuery({ pageSize: 100, sort: 'name' }, { enabled: canList })

  if (canList) {
    return (
      <Select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        disabled={disabled}
      >
        <option value="">{t('common.unassigned')}</option>
        {scopesQuery.data?.items.map((scope) => (
          <option key={scope.id} value={scope.id}>
            {scope.name}
          </option>
        ))}
      </Select>
    )
  }

  const ownScopeIds = user?.organizationScopeIds ?? []

  return (
    <Select
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      required={required}
      disabled={disabled || ownScopeIds.length === 0}
      className="dir-ltr"
    >
      <option value="">{t('common.unassigned')}</option>
      {ownScopeIds.map((scopeId) => (
        <option key={scopeId} value={scopeId}>
          {scopeId}
        </option>
      ))}
    </Select>
  )
}
