import { NavLink } from 'react-router-dom'
import styles from './SectionNav.module.css'

export interface SectionNavItem {
  to: string
  label: string
}

/** Sub-navigation row linking sibling pages within a domain (e.g. Inventory: Parts / Stores / Movements). */
export function SectionNav({ items }: { items: ReadonlyArray<SectionNavItem> }) {
  return (
    <nav className={styles.nav} aria-label="Section navigation">
      {items.map((item) => (
        <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? styles.linkActive : styles.link)}>
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}
