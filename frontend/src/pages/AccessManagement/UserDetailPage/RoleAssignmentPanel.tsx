import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useReplaceUserRolesMutation } from '@/api/hooks/users'
import { useRolesQuery } from '@/api/hooks/roles'
import { useAuth } from '@/auth/useAuth'
import { hasAnyPermission } from '@/auth/permissions'
import { Alert, Button, Card, ListStateBoundary, StatusBadge, useToast } from '@/components'
import type { RoleCode, User } from '@/api/types'
import styles from './UserDetailPage.module.css'

export function RoleAssignmentPanel({ user, currentUserId }: { user: User; currentUserId?: string }) {
  const { t } = useTranslation()
  const { user: currentUser } = useAuth()
  const { showToast } = useToast()
  const rolesQuery = useRolesQuery()
  const mutation = useReplaceUserRolesMutation(user.id)

  const [syncedRoles, setSyncedRoles] = useState(user.roles)
  const [selected, setSelected] = useState<RoleCode[]>(user.roles)

  if (syncedRoles !== user.roles) {
    setSyncedRoles(user.roles)
    setSelected(user.roles)
  }

  if (!hasAnyPermission(currentUser, ['roles.assign'])) {
    return null
  }

  const isOwnAccount = user.id === currentUserId
  const removingAdmin = user.roles.includes('SYSTEM_ADMIN') && !selected.includes('SYSTEM_ADMIN')
  const hasChanges = selected.length !== user.roles.length || selected.some((code) => !user.roles.includes(code))

  function toggle(code: RoleCode) {
    setSelected((current) => (current.includes(code) ? current.filter((c) => c !== code) : [...current, code]))
  }

  async function submit() {
    try {
      await mutation.mutateAsync({ roles: selected })
      showToast(t('access.users.roles.success'), 'success')
    } catch {
      // surfaced via mutation.error below
    }
  }

  return (
    <Card title={t('access.users.roles.title')}>
      <p className={styles.hint}>{t('access.users.roles.description')}</p>

      {isOwnAccount ? <Alert variant="info">{t('access.users.roles.cannotEditOwn')}</Alert> : null}
      {mutation.isError ? (
        <Alert variant="danger">
          {mutation.error instanceof Error ? mutation.error.message : t('errors.unknownError')}
        </Alert>
      ) : null}
      {removingAdmin ? <Alert variant="warning">{t('access.users.roles.warnRemoveAdmin')}</Alert> : null}

      <ListStateBoundary
        isLoading={rolesQuery.isLoading}
        isError={rolesQuery.isError}
        error={rolesQuery.error}
        onRetry={() => void rolesQuery.refetch()}
        isEmpty={false}
        emptyTitle=""
      >
        <ul className={styles.roleList}>
          {rolesQuery.data?.items.map((role) => (
            <li key={role.code} className={styles.roleItem}>
              <label className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={selected.includes(role.code)}
                  disabled={isOwnAccount}
                  onChange={() => toggle(role.code)}
                />
                <span className="dir-ltr">{role.code}</span>
              </label>
              <p className={styles.roleDescription}>{role.description}</p>
              <div className={styles.badgeRow}>
                {role.permissions.slice(0, 6).map((permission) => (
                  <StatusBadge key={permission} tone="neutral">
                    <span className="dir-ltr">{permission}</span>
                  </StatusBadge>
                ))}
                {role.permissions.length > 6 ? (
                  <StatusBadge tone="neutral">+{role.permissions.length - 6}</StatusBadge>
                ) : null}
              </div>
            </li>
          ))}
        </ul>

        {!isOwnAccount ? (
          <Button type="button" onClick={() => void submit()} isLoading={mutation.isPending} disabled={!hasChanges}>
            {mutation.isPending ? t('access.users.roles.submitting') : t('access.users.roles.submit')}
          </Button>
        ) : null}
      </ListStateBoundary>
    </Card>
  )
}
