import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useUpdateServiceReminderMutation, useVehicleRemindersQuery } from '@/api/hooks/vehicles'
import {
  Button,
  ConfirmDialog,
  FilterBar,
  ListStateBoundary,
  Pagination,
  Select,
  StatusBadge,
  Table,
  useToast,
  type TableColumn,
} from '@/components'
import { formatDateOnly, formatNumber } from '@/lib/format'
import { useSearchParamPage, useSearchParamState } from '@/hooks/useSearchParamState'
import type { ServiceReminder } from '@/api/types'
import { CreateReminderDialog } from './CreateReminderDialog'
import { EditReminderDialog } from './EditReminderDialog'

const PAGE_SIZE = 10

export function RemindersSection({ vehicleId, canWrite }: { vehicleId: string; canWrite: boolean }) {
  const { t } = useTranslation()
  const { showToast } = useToast()

  const [status, setStatus] = useSearchParamState('reminderStatus')
  const [sort, setSort] = useSearchParamState('reminderSort', '-dueDate')
  const [page, setPage] = useSearchParamPage()

  const remindersQuery = useVehicleRemindersQuery(vehicleId, {
    page,
    pageSize: PAGE_SIZE,
    sort,
    status: status ? (status as 'OPEN' | 'DONE' | 'CANCELLED') : undefined,
  })
  const transitionMutation = useUpdateServiceReminderMutation(vehicleId)

  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<ServiceReminder | null>(null)
  const [completing, setCompleting] = useState<ServiceReminder | null>(null)
  const [cancelling, setCancelling] = useState<ServiceReminder | null>(null)

  async function resolveTransition(reminder: ServiceReminder, status: 'DONE' | 'CANCELLED') {
    try {
      await transitionMutation.mutateAsync({ reminderId: reminder.id, payload: { status } })
      showToast(
        status === 'DONE' ? t('vehicles.reminders.edit.success') : t('vehicles.reminders.edit.success'),
        'success',
      )
    } catch {
      // ignore: dialog closes regardless, error surfaces on next list refresh via query error state
    } finally {
      setCompleting(null)
      setCancelling(null)
    }
  }

  const columns: ReadonlyArray<TableColumn<ServiceReminder>> = [
    { key: 'title', header: t('vehicles.reminders.columns.title'), render: (row) => row.title },
    {
      key: 'dueDate',
      header: t('vehicles.reminders.columns.dueDate'),
      render: (row) => (row.dueDate ? formatDateOnly(row.dueDate) : '—'),
    },
    {
      key: 'dueMileage',
      header: t('vehicles.reminders.columns.dueMileage'),
      render: (row) =>
        row.dueMileage !== undefined ? <span className="dir-ltr">{formatNumber(row.dueMileage)}</span> : '—',
    },
    {
      key: 'status',
      header: t('vehicles.reminders.columns.status'),
      render: (row) => (
        <StatusBadge tone={row.status === 'OPEN' ? 'info' : row.status === 'DONE' ? 'success' : 'neutral'}>
          {t(`vehicles.reminders.statusOptions.${row.status}`)}
        </StatusBadge>
      ),
    },
    { key: 'notes', header: t('vehicles.reminders.columns.notes'), render: (row) => row.notes ?? '—' },
    ...(canWrite
      ? [
          {
            key: 'actions',
            header: t('common.actions'),
            render: (row: ServiceReminder) =>
              row.status === 'OPEN' ? (
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(row)}>
                    {t('common.edit')}
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setCompleting(row)}>
                    {t('vehicles.reminders.complete')}
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setCancelling(row)}>
                    {t('vehicles.reminders.cancelReminder')}
                  </Button>
                </div>
              ) : null,
          } satisfies TableColumn<ServiceReminder>,
        ]
      : []),
  ]

  return (
    <div>
      <FilterBar>
        <Select
          aria-label={t('vehicles.reminders.statusFilter')}
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="">{t('common.allStatuses')}</option>
          <option value="OPEN">{t('vehicles.reminders.statusOptions.OPEN')}</option>
          <option value="DONE">{t('vehicles.reminders.statusOptions.DONE')}</option>
          <option value="CANCELLED">{t('vehicles.reminders.statusOptions.CANCELLED')}</option>
        </Select>

        <Select aria-label={t('common.sortBy')} value={sort} onChange={(event) => setSort(event.target.value)}>
          <option value="-dueDate">{t('vehicles.reminders.columns.dueDate')} ↓</option>
          <option value="dueDate">{t('vehicles.reminders.columns.dueDate')} ↑</option>
          <option value="-createdAt">{t('common.createdAt')} ↓</option>
          <option value="createdAt">{t('common.createdAt')} ↑</option>
        </Select>

        {canWrite ? (
          <Button type="button" onClick={() => setCreateOpen(true)}>
            {t('vehicles.reminders.createAction')}
          </Button>
        ) : null}
      </FilterBar>

      <ListStateBoundary
        isLoading={remindersQuery.isLoading}
        isError={remindersQuery.isError}
        error={remindersQuery.error}
        onRetry={() => void remindersQuery.refetch()}
        isEmpty={(remindersQuery.data?.items.length ?? 0) === 0}
        emptyTitle={t('vehicles.reminders.empty.title')}
        emptyDescription={t('vehicles.reminders.empty.description')}
      >
        <Table columns={columns} rows={remindersQuery.data?.items ?? []} getRowKey={(row) => row.id} />
        {remindersQuery.data ? (
          <Pagination
            page={remindersQuery.data.page.page}
            pageSize={remindersQuery.data.page.pageSize}
            totalItems={remindersQuery.data.page.totalItems}
            totalPages={remindersQuery.data.page.totalPages}
            onPageChange={setPage}
          />
        ) : null}
      </ListStateBoundary>

      {canWrite ? (
        <>
          <CreateReminderDialog open={createOpen} onClose={() => setCreateOpen(false)} vehicleId={vehicleId} />
          <EditReminderDialog reminder={editing} vehicleId={vehicleId} onClose={() => setEditing(null)} />

          <ConfirmDialog
            open={completing !== null}
            title={t('vehicles.reminders.completeConfirmTitle')}
            description={t('vehicles.reminders.completeConfirmDescription')}
            isLoading={transitionMutation.isPending}
            onConfirm={() => completing && void resolveTransition(completing, 'DONE')}
            onCancel={() => setCompleting(null)}
          />

          <ConfirmDialog
            open={cancelling !== null}
            title={t('vehicles.reminders.cancelConfirmTitle')}
            description={t('vehicles.reminders.cancelConfirmDescription')}
            tone="danger"
            isLoading={transitionMutation.isPending}
            onConfirm={() => cancelling && void resolveTransition(cancelling, 'CANCELLED')}
            onCancel={() => setCancelling(null)}
          />
        </>
      ) : null}
    </div>
  )
}
