import { createContext } from 'react'

export type ThemePreference = 'light' | 'dark' | 'system'

export interface ThemeContextValue {
  preference: ThemePreference
  isDark: boolean
  toggle: () => void
}

export const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)
