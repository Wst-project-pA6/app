import { SearchX } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import buttonStyles from '@/components/Button/Button.module.css'
import { EmptyState } from '@/components'

export function NotFoundPage() {
  const { t } = useTranslation()

  return (
    <main>
      <h1>{t('notFound.title')}</h1>
      <EmptyState
        icon={<SearchX size={40} aria-hidden="true" />}
        title={t('notFound.message')}
        action={
          <Link to="/" className={`${buttonStyles.button} ${buttonStyles.primary} ${buttonStyles.md}`}>
            {t('notFound.backHome')}
          </Link>
        }
      />
    </main>
  )
}
