import { ChevronDown, LogOut, User } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/auth/useAuth'
import styles from './UserMenu.module.css'

export function UserMenu() {
  const { t } = useTranslation()
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    function handleClick(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  if (!user) return null

  return (
    <div className={styles.wrapper} ref={rootRef}>
      <button
        type="button"
        className={styles.trigger}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('shell.userMenu')}
        onClick={() => setOpen((v) => !v)}
      >
        <User size={18} aria-hidden="true" />
        <span className={styles.name}>{user.displayName}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open ? (
        <div className={styles.menu} role="menu">
          <p className={styles.email}>{user.email}</p>
          <button
            type="button"
            role="menuitem"
            className={styles.menuItem}
            onClick={() => {
              setOpen(false)
              void logout()
            }}
          >
            <LogOut size={16} aria-hidden="true" />
            {t('auth.logout')}
          </button>
        </div>
      ) : null}
    </div>
  )
}
