import { useTranslation } from 'react-i18next'
import { useStockReconciliationQuery } from '@/api/hooks/inventory'
import {
  Alert,
  Card,
  FilterBar,
  ListStateBoundary,
  PageHeader,
  StatusBadge,
  Table,
  TextInput,
  type TableColumn,
} from '@/components'
import { formatDateTime } from '@/lib/format'
import { useSearchParamState } from '@/hooks/useSearchParamState'
import { InventorySectionNav } from '../InventorySectionNav'

interface Mismatch {
  storeId: string
  partId: string
  ledgerOnHand: number
  balanceOnHand: number
  ledgerReserved: number
  balanceReserved: number
}

export function StockReconciliationPage() {
  const { t } = useTranslation()
  const [storeId, setStoreId] = useSearchParamState('storeId')
  const reconciliationQuery = useStockReconciliationQuery(storeId || undefined)

  const columns: ReadonlyArray<TableColumn<Mismatch>> = [
    { key: 'partId', header: t('jobs.parts.columns.partId'), render: (row) => row.partId, dirStable: true },
    { key: 'storeId', header: t('jobs.parts.storeLabel'), render: (row) => row.storeId, dirStable: true },
    {
      key: 'ledgerOnHand',
      header: t('inventory.reconciliation.columns.ledgerOnHand'),
      render: (row) => <span className="dir-ltr">{row.ledgerOnHand}</span>,
    },
    {
      key: 'balanceOnHand',
      header: t('inventory.reconciliation.columns.balanceOnHand'),
      render: (row) => <span className="dir-ltr">{row.balanceOnHand}</span>,
    },
    {
      key: 'ledgerReserved',
      header: t('inventory.reconciliation.columns.ledgerReserved'),
      render: (row) => <span className="dir-ltr">{row.ledgerReserved}</span>,
    },
    {
      key: 'balanceReserved',
      header: t('inventory.reconciliation.columns.balanceReserved'),
      render: (row) => <span className="dir-ltr">{row.balanceReserved}</span>,
    },
  ]

  return (
    <div>
      <PageHeader title={t('inventory.reconciliation.title')} />
      <InventorySectionNav />

      <FilterBar>
        <TextInput
          aria-label={t('jobs.parts.storeLabel')}
          placeholder={t('jobs.parts.storeLabel')}
          value={storeId}
          onChange={(event) => setStoreId(event.target.value)}
          className="dir-ltr"
        />
      </FilterBar>

      <ListStateBoundary
        isLoading={reconciliationQuery.isLoading}
        isError={reconciliationQuery.isError}
        error={reconciliationQuery.error}
        onRetry={() => void reconciliationQuery.refetch()}
        isEmpty={false}
        emptyTitle=""
      >
        {reconciliationQuery.data ? (
          <Card
            title={
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <StatusBadge tone={reconciliationQuery.data.reconciled ? 'success' : 'danger'}>
                  {reconciliationQuery.data.reconciled
                    ? t('inventory.reconciliation.healthy')
                    : t('inventory.reconciliation.mismatchesFound')}
                </StatusBadge>
                <span>
                  {t('inventory.reconciliation.generatedAt', {
                    time: formatDateTime(reconciliationQuery.data.generatedAt),
                  })}
                </span>
              </div>
            }
          >
            <p>{t('inventory.reconciliation.checkedBalances', { count: reconciliationQuery.data.checkedBalances })}</p>
            {reconciliationQuery.data.reconciled ? (
              <Alert variant="success">{t('inventory.reconciliation.noMismatchesMessage')}</Alert>
            ) : (
              <Table
                columns={columns}
                rows={reconciliationQuery.data.mismatches}
                getRowKey={(row) => `${row.storeId}-${row.partId}`}
              />
            )}
          </Card>
        ) : null}
      </ListStateBoundary>
    </div>
  )
}
