import { Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TextInput } from '../TextInput/TextInput'
import styles from './SearchInput.module.css'

export interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  'aria-label'?: string
  delayMs?: number
}

/**
 * Free-text search box that debounces `onChange` so a query is issued only
 * after the user pauses typing, not on every keystroke. Keeps its own local
 * draft so the field stays responsive to input while the debounce is
 * pending, but stays in sync if `value` changes externally (e.g. cleared by
 * a "reset filters" action).
 */
export function SearchInput({ value, onChange, placeholder, delayMs = 350, ...rest }: SearchInputProps) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(value)
  const [syncedValue, setSyncedValue] = useState(value)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Keep the local draft in sync when `value` changes externally (e.g. a "reset filters" action).
  if (value !== syncedValue) {
    setSyncedValue(value)
    setDraft(value)
  }

  useEffect(() => {
    return () => clearTimeout(timeoutRef.current)
  }, [])

  function handleChange(next: string) {
    setDraft(next)
    clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => onChange(next), delayMs)
  }

  return (
    <div className={styles.wrapper}>
      <Search size={16} aria-hidden="true" className={styles.icon} />
      <TextInput
        type="search"
        value={draft}
        onChange={(event) => handleChange(event.target.value)}
        placeholder={placeholder ?? t('common.search')}
        aria-label={rest['aria-label'] ?? placeholder ?? t('common.search')}
        className={styles.input}
      />
    </div>
  )
}
