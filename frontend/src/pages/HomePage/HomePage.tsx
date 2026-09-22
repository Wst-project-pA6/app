import { useTranslation } from 'react-i18next'
import { useAuth } from '@/auth/useAuth'
import { Card, PageHeader, StatusBadge } from '@/components'
import styles from './HomePage.module.css'

export function HomePage() {
  const { t } = useTranslation()
  const { user } = useAuth()

  if (!user) return null

  return (
    <div>
      <PageHeader title={t('home.title', { name: user.displayName })} />

      <div className={styles.grid}>
        <Card title={t('home.identity')}>
          <dl className={styles.definitionList}>
            <div>
              <dt>{t('home.email')}</dt>
              <dd className="dir-ltr">{user.email}</dd>
            </div>
            <div>
              <dt>{t('home.roles')}</dt>
              <dd>
                <div className={styles.badgeRow}>
                  {user.roles.map((role) => (
                    <StatusBadge key={role} tone="info">
                      {role}
                    </StatusBadge>
                  ))}
                </div>
              </dd>
            </div>
            <div>
              <dt>{t('home.organizationScopes')}</dt>
              <dd>
                {user.organizationScopeIds.length === 0 ? (
                  <span className={styles.muted}>{t('home.noScopes')}</span>
                ) : (
                  <ul className={styles.scopeList}>
                    {user.organizationScopeIds.map((scopeId) => (
                      <li key={scopeId} className="dir-ltr">
                        {scopeId}
                      </li>
                    ))}
                  </ul>
                )}
              </dd>
            </div>
          </dl>
        </Card>

        <Card title={t('home.permissions')}>
          <p className={styles.permissionCount}>{t('home.permissionCount', { count: user.permissions.length })}</p>
          <div className={styles.badgeRow}>
            {user.permissions.map((permission) => (
              <StatusBadge key={permission} tone="neutral">
                <span className="dir-ltr">{permission}</span>
              </StatusBadge>
            ))}
          </div>
          <p className={styles.note}>{t('home.permissionsNote')}</p>
        </Card>
      </div>
    </div>
  )
}
