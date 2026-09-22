import { Menu, Zap } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { LanguageSwitcher, ThemeToggle } from '@/components'
import { UserMenu } from './UserMenu'
import styles from './Header.module.css'

export interface HeaderProps {
  onToggleSidebar: () => void
  onToggleMobileNav: () => void
}

export function Header({ onToggleSidebar, onToggleMobileNav }: HeaderProps) {
  const { t } = useTranslation()

  return (
    <header className={styles.header}>
      <div className={styles.left}>
        <button
          type="button"
          className={styles.iconButton}
          onClick={onToggleMobileNav}
          aria-label={t('shell.openMobileNav')}
          aria-controls="primary-navigation"
        >
          <Menu size={20} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={[styles.iconButton, styles.desktopOnly].join(' ')}
          onClick={onToggleSidebar}
          aria-label={t('shell.toggleSidebar')}
          aria-controls="primary-navigation"
        >
          <Menu size={20} aria-hidden="true" />
        </button>
        <span className={styles.brandMark} aria-hidden="true">
          <Zap size={16} strokeWidth={2.5} />
        </span>
        <span className={styles.appName}>{t('app.name')}</span>
      </div>
      <div className={styles.right}>
        <ThemeToggle />
        <LanguageSwitcher />
        <UserMenu />
      </div>
    </header>
  )
}
