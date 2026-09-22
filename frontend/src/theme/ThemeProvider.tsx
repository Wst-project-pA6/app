import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ThemeContext, type ThemePreference } from './ThemeContext'

const STORAGE_KEY = 'wst.theme'

function readStoredPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === 'light' || stored === 'dark' ? stored : 'system'
  } catch {
    return 'system'
  }
}

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
}

function applyThemeAttribute(preference: ThemePreference) {
  if (preference === 'system') {
    document.documentElement.removeAttribute('data-theme')
  } else {
    document.documentElement.setAttribute('data-theme', preference)
  }
}

/** Light/dark theme preference: 'system' follows the OS, explicit choices persist to localStorage and override it. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<ThemePreference>(readStoredPreference)

  useEffect(() => {
    applyThemeAttribute(preference)
  }, [preference])

  const toggle = useCallback(() => {
    setPreference((current) => {
      const currentlyDark = current === 'dark' || (current === 'system' && systemPrefersDark())
      const next: ThemePreference = currentlyDark ? 'light' : 'dark'
      try {
        localStorage.setItem(STORAGE_KEY, next)
      } catch {
        // Best-effort only; the toggle still works for this session.
      }
      return next
    })
  }, [])

  const isDark = preference === 'dark' || (preference === 'system' && systemPrefersDark())

  const value = useMemo(() => ({ preference, isDark, toggle }), [preference, isDark, toggle])

  return <ThemeContext value={value}>{children}</ThemeContext>
}
