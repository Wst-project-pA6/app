import type { ReactNode } from 'react'
import styles from './Table.module.css'

export interface TableColumn<T> {
  key: string
  header: ReactNode
  render: (row: T) => ReactNode
  /** Directionally-stable columns (ids, codes, amounts) stay LTR under RTL layout. */
  dirStable?: boolean
  align?: 'start' | 'end'
}

export interface TableProps<T> {
  columns: ReadonlyArray<TableColumn<T>>
  rows: ReadonlyArray<T>
  getRowKey: (row: T) => string
  caption?: ReactNode
}

/** Responsive table foundation: scrolls horizontally on narrow viewports instead of overflowing the page. */
export function Table<T>({ columns, rows, getRowKey, caption }: TableProps<T>) {
  return (
    <div className={styles.scrollContainer}>
      <table className={styles.table}>
        {caption ? <caption className={styles.caption}>{caption}</caption> : null}
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col" className={column.align === 'end' ? styles.alignEnd : undefined}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={getRowKey(row)}>
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={[column.dirStable ? 'dir-ltr' : '', column.align === 'end' ? styles.alignEnd : '']
                    .filter(Boolean)
                    .join(' ')}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
