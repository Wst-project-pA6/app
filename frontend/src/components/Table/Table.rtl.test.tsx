import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Table } from './Table'

interface Row {
  id: string
  email: string
}

const rows: Row[] = [{ id: '1', email: 'ada@example.edu' }]

describe('Table under RTL layout', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('dir')
  })

  it('keeps dirStable columns (e.g. email) directionally stable when the document is RTL', () => {
    document.documentElement.dir = 'rtl'

    render(
      <Table<Row>
        columns={[{ key: 'email', header: 'Email', render: (row) => row.email, dirStable: true }]}
        rows={rows}
        getRowKey={(row) => row.id}
      />,
    )

    const cell = screen.getByText('ada@example.edu')
    expect(cell.className).toContain('dir-ltr')
  })
})
