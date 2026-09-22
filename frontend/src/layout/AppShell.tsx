import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Outlet } from 'react-router-dom'
import { Header } from './Header'
import { Sidebar } from './Sidebar'
import styles from './AppShell.module.css'

/**
 * Application shell for every authenticated route: responsive sidebar
 * (collapsible on desktop, an overlay drawer on mobile), sticky header
 * with the current-user menu and language switcher, and a skip link to
 * the main content landmark.
 */
export function AppShell() {
  const { t } = useTranslation()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className={styles.shell}>
      <a href="#main-content" className={styles.skipLink}>
        {t('shell.skipToContent')}
      </a>
      <Header onToggleSidebar={() => setCollapsed((v) => !v)} onToggleMobileNav={() => setMobileOpen((v) => !v)} />
      <div className={styles.body}>
        <Sidebar collapsed={collapsed} mobileOpen={mobileOpen} onNavigate={() => setMobileOpen(false)} />
        {mobileOpen ? <div className={styles.overlay} onClick={() => setMobileOpen(false)} aria-hidden="true" /> : null}
        <main id="main-content" className={styles.main} tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
