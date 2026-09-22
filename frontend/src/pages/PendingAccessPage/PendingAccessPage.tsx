import { Hourglass } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/auth/useAuth'
import { Button, EmptyState } from '@/components'
import styles from './PendingAccessPage.module.css'

export function PendingAccessPage() {
  const { t } = useTranslation()
  const { user, logout, refreshUser } = useAuth()
  const [checking, setChecking] = useState(false)

  // ProtectedRoute only ever redirects *to* /pending-access, never away from
  // it — it has no reason to re-run once we're already here. So once
  // "Refresh access" (or any refetch of /auth/me) reports that an
  // administrator has granted a role and scope, this page itself has to
  // leave; otherwise the user is stuck looking at "awaiting access" with a
  // fully populated sidebar and no cue that they can now proceed.
  const isStillPending = (user?.roles.length ?? 0) === 0 && (user?.permissions.length ?? 0) === 0
  if (user && !isStillPending) {
    return <Navigate to="/" replace />
  }

  async function handleRefresh() {
    setChecking(true)
    try {
      await refreshUser()
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className={styles.page}>
      <EmptyState
        icon={<Hourglass size={40} aria-hidden="true" />}
        title={t('pendingAccess.title')}
        description={t('pendingAccess.message', { email: user?.email ?? '' })}
        action={
          <div className={styles.actions}>
            <Button type="button" onClick={() => void handleRefresh()} isLoading={checking}>
              {t('pendingAccess.refresh')}
            </Button>
            <Button type="button" variant="secondary" onClick={() => void logout()}>
              {t('auth.logout')}
            </Button>
          </div>
        }
      />
    </div>
  )
}
