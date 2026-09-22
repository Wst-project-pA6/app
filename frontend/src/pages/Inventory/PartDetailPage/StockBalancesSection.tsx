import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { useReplaceStockLevelsMutation, useStockBalancesQuery } from '@/api/hooks/inventory'
import { ApiError } from '@/api/errors'
import { useAuth } from '@/auth/useAuth'
import { hasAnyPermission } from '@/auth/permissions'
import {
  Alert,
  Button,
  Card,
  FormField,
  ListStateBoundary,
  Modal,
  StatusBadge,
  Table,
  TextInput,
  useToast,
  type TableColumn,
} from '@/components'
import { formatMoney } from '@/lib/format'
import type { StockBalance } from '@/api/types'

const schema = z.object({ minLevel: z.number().int().min(0), maxLevel: z.number().int().min(0) })
type FormValues = z.infer<typeof schema>

export function StockBalancesSection({ partId }: { partId: string }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { showToast } = useToast()
  const canReadCost = hasAnyPermission(user, ['inventory.cost.read'])
  const canEditLevels = hasAnyPermission(user, ['parts.write'])

  const balancesQuery = useStockBalancesQuery({ partId, pageSize: 100 })
  const levelsMutation = useReplaceStockLevelsMutation()
  const [editing, setEditing] = useState<StockBalance | null>(null)

  const { register, handleSubmit, reset, formState } = useForm<FormValues>({ resolver: zodResolver(schema) })

  useEffect(() => {
    if (editing) reset({ minLevel: editing.minLevel, maxLevel: editing.maxLevel })
  }, [editing, reset])

  async function onSubmit(values: FormValues) {
    if (!editing) return
    try {
      await levelsMutation.mutateAsync({ storeId: editing.storeId, partId: editing.partId, payload: values })
      showToast(t('inventory.parts.detail.levelsSuccess'), 'success')
      setEditing(null)
    } catch {
      // surfaced below
    }
  }

  const columns: ReadonlyArray<TableColumn<StockBalance>> = [
    { key: 'storeId', header: t('jobs.parts.storeLabel'), render: (row) => row.storeId, dirStable: true },
    {
      key: 'onHand',
      header: t('inventory.stockBalances.columns.onHand'),
      render: (row) => <span className="dir-ltr">{row.onHand}</span>,
    },
    {
      key: 'reserved',
      header: t('inventory.stockBalances.columns.reserved'),
      render: (row) => <span className="dir-ltr">{row.reserved}</span>,
    },
    {
      key: 'available',
      header: t('inventory.stockBalances.columns.available'),
      render: (row) => <span className="dir-ltr">{row.available}</span>,
    },
    {
      key: 'minLevel',
      header: t('inventory.stockBalances.columns.minLevel'),
      render: (row) => <span className="dir-ltr">{row.minLevel}</span>,
    },
    {
      key: 'maxLevel',
      header: t('inventory.stockBalances.columns.maxLevel'),
      render: (row) => <span className="dir-ltr">{row.maxLevel}</span>,
    },
    ...(canReadCost
      ? [
          {
            key: 'averageCost',
            header: t('inventory.stockBalances.columns.averageCost'),
            render: (row: StockBalance) => (
              <span className="dir-ltr">{row.averageCost ? formatMoney(row.averageCost) : '—'}</span>
            ),
          } satisfies TableColumn<StockBalance>,
        ]
      : []),
    {
      key: 'belowMinimum',
      header: t('common.status'),
      render: (row) =>
        row.belowMinimum ? (
          <StatusBadge tone="danger">{t('inventory.stockBalances.belowMinimum')}</StatusBadge>
        ) : (
          <StatusBadge tone="success">{t('inventory.stockBalances.ok')}</StatusBadge>
        ),
    },
    ...(canEditLevels
      ? [
          {
            key: 'actions',
            header: t('common.actions'),
            render: (row: StockBalance) => (
              <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(row)}>
                {t('inventory.stockBalances.editLevels')}
              </Button>
            ),
          } satisfies TableColumn<StockBalance>,
        ]
      : []),
  ]

  return (
    <Card title={t('inventory.stockBalances.title')}>
      <ListStateBoundary
        isLoading={balancesQuery.isLoading}
        isError={balancesQuery.isError}
        error={balancesQuery.error}
        onRetry={() => void balancesQuery.refetch()}
        isEmpty={(balancesQuery.data?.items.length ?? 0) === 0}
        emptyTitle={t('inventory.stockBalances.empty.title')}
        emptyDescription={t('inventory.stockBalances.empty.description')}
      >
        <Table
          columns={columns}
          rows={balancesQuery.data?.items ?? []}
          getRowKey={(row) => `${row.storeId}-${row.partId}`}
        />
      </ListStateBoundary>

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={t('inventory.stockBalances.editLevels')}>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          {levelsMutation.isError ? (
            <Alert variant="danger">
              {levelsMutation.error instanceof ApiError ? levelsMutation.error.message : t('errors.unknownError')}
            </Alert>
          ) : null}
          <FormField id="levels-min" label={t('inventory.stockBalances.columns.minLevel')} required>
            <TextInput type="number" dirStable {...register('minLevel', { valueAsNumber: true })} />
          </FormField>
          <FormField id="levels-max" label={t('inventory.stockBalances.columns.maxLevel')} required>
            <TextInput type="number" dirStable {...register('maxLevel', { valueAsNumber: true })} />
          </FormField>
          <Button type="submit" isLoading={formState.isSubmitting}>
            {t('common.save')}
          </Button>
        </form>
      </Modal>
    </Card>
  )
}
