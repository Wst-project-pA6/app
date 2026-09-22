import { ShieldAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import buttonStyles from '@/components/Button/Button.module.css'
import { EmptyState } from '@/components'

export function ForbiddenPage() {
  const { t } = useTranslation()

  return (
    <main>
      <h1>{t('forbidden.title')}</h1>
      <EmptyState
        icon={<ShieldAlert size={40} aria-hidden="true" />}
        title={t('forbidden.message')}
        action={
          <Link to="/" className={`${buttonStyles.button} ${buttonStyles.primary} ${buttonStyles.md}`}>
            {t('forbidden.backHome')}
          </Link>
        }
      />
    </main>
  )
}
