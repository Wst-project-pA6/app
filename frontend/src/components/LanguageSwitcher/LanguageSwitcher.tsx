import { useTranslation } from 'react-i18next'
import { SUPPORTED_LANGUAGES } from '@/i18n'
import styles from './LanguageSwitcher.module.css'

/** Persists only the language preference (via i18next-browser-languagedetector), never credentials. */
export function LanguageSwitcher() {
  const { t, i18n } = useTranslation()

  return (
    <div className={styles.wrapper}>
      <select
        className={styles.select}
        value={i18n.language}
        aria-label={t('language.label')}
        onChange={(event) => {
          void i18n.changeLanguage(event.target.value)
        }}
      >
        {SUPPORTED_LANGUAGES.map((language) => (
          <option key={language} value={language}>
            {t(`language.${language}`)}
          </option>
        ))}
      </select>
    </div>
  )
}
