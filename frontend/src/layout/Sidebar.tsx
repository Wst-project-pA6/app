import { useTranslation } from 'react-i18next'
import { NavLink } from 'react-router-dom'
import { useAuth } from '@/auth/useAuth'
import { hasAnyPermission } from '@/auth/permissions'
import { NAV_MODULES } from '@/navigation/registry'
import styles from './Sidebar.module.css'

export interface SidebarProps {
  collapsed: boolean
  mobileOpen: boolean
  onNavigate: () => void
}

export function Sidebar({ collapsed, mobileOpen, onNavigate }: SidebarProps) {
  const { t } = useTranslation()
  const { user } = useAuth()

  const visibleModules = NAV_MODULES.filter((module) => hasAnyPermission(user, module.requiredPermissions))

  return (
    <nav
      id="primary-navigation"
      className={[styles.sidebar, collapsed ? styles.collapsed : '', mobileOpen ? styles.mobileOpen : ''].join(' ')}
      aria-label={t('nav.dashboard')}
    >
      <ul className={styles.list}>
        {visibleModules.map((module) => {
          const Icon = module.icon
          return (
            <li key={module.key} data-module={module.key}>
              <NavLink
                to={module.path}
                end={module.path === '/'}
                onClick={onNavigate}
                className={({ isActive }) => [styles.link, isActive ? styles.active : ''].join(' ')}
              >
                <Icon size={20} aria-hidden="true" />
                <span className={collapsed ? styles.labelCollapsed : undefined}>{t(module.labelKey)}</span>
              </NavLink>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
