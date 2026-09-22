import type { ReactNode } from 'react'
import styles from './Tabs.module.css'

export interface TabItem {
  key: string
  label: ReactNode
  badge?: ReactNode
}

export interface TabsProps {
  tabs: ReadonlyArray<TabItem>
  activeKey: string
  onChange: (key: string) => void
}

/** Accessible tab-button row; the caller renders the active panel itself (see `role="tabpanel"` usage at call sites). */
export function Tabs({ tabs, activeKey, onChange }: TabsProps) {
  return (
    <div className={styles.tabs} role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={tab.key === activeKey}
          className={tab.key === activeKey ? styles.tabActive : styles.tab}
          onClick={() => onChange(tab.key)}
        >
          {tab.label}
          {tab.badge ? <span className={styles.badge}>{tab.badge}</span> : null}
        </button>
      ))}
    </div>
  )
}
