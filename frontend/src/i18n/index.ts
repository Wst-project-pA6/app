import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'
import ar from './locales/ar.json'
import en from './locales/en.json'

export const SUPPORTED_LANGUAGES = ['en', 'ar'] as const
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

export const RTL_LANGUAGES: ReadonlySet<SupportedLanguage> = new Set(['ar'])

export const LANGUAGE_STORAGE_KEY = 'wst.language'

export function isRtl(language: string): boolean {
  return RTL_LANGUAGES.has(language as SupportedLanguage)
}

function applyDocumentDirection(language: string): void {
  const root = document.documentElement
  root.lang = language
  root.dir = isRtl(language) ? 'rtl' : 'ltr'
}

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      ar: { translation: ar },
    },
    fallbackLng: 'en',
    supportedLngs: SUPPORTED_LANGUAGES,
    // Only the language preference is persisted here — never credentials or
    // tokens, which live in tokenStorage.ts instead.
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
      caches: ['localStorage'],
    },
    interpolation: { escapeValue: false },
    returnNull: false,
  })
  .then(() => {
    applyDocumentDirection(i18n.language)
  })

i18n.on('languageChanged', applyDocumentDirection)

export default i18n
