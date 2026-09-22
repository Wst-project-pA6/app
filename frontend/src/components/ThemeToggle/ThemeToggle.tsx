import { Moon, Sun } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useTheme } from '@/theme/useTheme'
import styles from './ThemeToggle.module.css'

export function ThemeToggle() {
  const { t } = useTranslation()
  const { isDark, toggle } = useTheme()

  return (
    <button
      type="button"
      className={styles.button}
      onClick={toggle}
      aria-pressed={isDark}
      aria-label={isDark ? t('theme.switchToLight') : t('theme.switchToDark')}
      title={isDark ? t('theme.switchToLight') : t('theme.switchToDark')}
    >
      {isDark ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
    </button>
  )
}
