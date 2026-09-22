import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useReplaceUserOrganizationScopesMutation } from '@/api/hooks/users'
import { useOrganizationScopesQuery } from '@/api/hooks/organizationScopes'
import { useAuth } from '@/auth/useAuth'
import { hasAnyPermission } from '@/auth/permissions'
import { Alert, Button, Card, ListStateBoundary, SearchInput, useToast } from '@/components'
import type { User } from '@/api/types'
import styles from './UserDetailPage.module.css'

export function ScopeAssignmentPanel({ user }: { user: User }) {
  const { t } = useTranslation()
  const { user: currentUser } = useAuth()
  const { showToast } = useToast()
  const scopesQuery = useOrganizationScopesQuery({ pageSize: 100, sort: 'name' })
  const mutation = useReplaceUserOrganizationScopesMutation(user.id)

  const [syncedScopeIds, setSyncedScopeIds] = useState(user.organizationScopeIds)
  const [selected, setSelected] = useState<string[]>(user.organizationScopeIds)
  const [search, setSearch] = useState('')

  if (syncedScopeIds !== user.organizationScopeIds) {
    setSyncedScopeIds(user.organizationScopeIds)
    setSelected(user.organizationScopeIds)
  }

  if (!hasAnyPermission(currentUser, ['scopes.manage'])) {
    return null
  }

  const hasChanges =
    selected.length !== user.organizationScopeIds.length ||
    selected.some((id) => !user.organizationScopeIds.includes(id))

  const visibleScopes = (scopesQuery.data?.items ?? []).filter((scope) =>
    `${scope.name} ${scope.code}`.toLowerCase().includes(search.toLowerCase()),
  )

  function toggle(id: string) {
    setSelected((current) => (current.includes(id) ? current.filter((c) => c !== id) : [...current, id]))
  }

  async function submit() {
    try {
      await mutation.mutateAsync({ organizationScopeIds: selected })
      showToast(t('access.users.scopes.success'), 'success')
    } catch {
      // surfaced via mutation.error below
    }
  }

  return (
    <Card title={t('access.users.scopes.title')}>
      <p className={styles.hint}>{t('access.users.scopes.description')}</p>

      {mutation.isError ? (
        <Alert variant="danger">
          {mutation.error instanceof Error ? mutation.error.message : t('errors.unknownError')}
        </Alert>
      ) : null}

      <ListStateBoundary
        isLoading={scopesQuery.isLoading}
        isError={scopesQuery.isError}
        error={scopesQuery.error}
        onRetry={() => void scopesQuery.refetch()}
        isEmpty={false}
        emptyTitle=""
      >
        <SearchInput value={search} onChange={setSearch} placeholder={t('access.users.scopes.searchPlaceholder')} />

        <ul className={styles.scopeList}>
          {visibleScopes.map((scope) => (
            <li key={scope.id} className={styles.checkboxRow}>
              <label className={styles.checkboxRow}>
                <input type="checkbox" checked={selected.includes(scope.id)} onChange={() => toggle(scope.id)} />
                <span>{scope.name}</span>
                <span className={`dir-ltr ${styles.mutedCode}`}>({scope.code})</span>
              </label>
            </li>
          ))}
        </ul>

        <Button type="button" onClick={() => void submit()} isLoading={mutation.isPending} disabled={!hasChanges}>
          {mutation.isPending ? t('access.users.scopes.submitting') : t('access.users.scopes.submit')}
        </Button>
      </ListStateBoundary>
    </Card>
  )
}
