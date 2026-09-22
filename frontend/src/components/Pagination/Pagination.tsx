import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import styles from './Pagination.module.css'

export interface PaginationProps {
  page: number
  pageSize: number
  totalItems: number
  totalPages: number
  onPageChange: (page: number) => void
}

/** Foundation pagination control, driven by the contract's `PageInfo` shape. */
export function Pagination({ page, pageSize, totalItems, totalPages, onPageChange }: PaginationProps) {
  const { t } = useTranslation()

  if (totalItems === 0) return null

  const firstItem = (page - 1) * pageSize + 1
  const lastItem = Math.min(page * pageSize, totalItems)

  return (
    <nav className={styles.wrapper} aria-label="Pagination">
      <p className={styles.summary}>
        {firstItem}–{lastItem} / {totalItems}
      </p>
      <div className={styles.controls}>
        <button
          type="button"
          className={styles.button}
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label={t('common.previous')}
        >
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        <span className={styles.pageIndicator}>
          {page} / {Math.max(totalPages, 1)}
        </span>
        <button
          type="button"
          className={styles.button}
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          aria-label={t('common.next')}
        >
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </div>
    </nav>
  )
}
