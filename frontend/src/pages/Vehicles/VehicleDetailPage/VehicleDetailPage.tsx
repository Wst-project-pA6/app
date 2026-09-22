import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { z } from 'zod'
import { useUpdateVehicleMutation, useVehicleQuery } from '@/api/hooks/vehicles'
import { ApiError } from '@/api/errors'
import { useAuth } from '@/auth/useAuth'
import { hasAnyPermission } from '@/auth/permissions'
import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
  FormField,
  ListStateBoundary,
  PageHeader,
  Select,
  TextInput,
  useToast,
} from '@/components'
import { formatDate, formatDateOnly, formatNumber } from '@/lib/format'
import { ServiceHistorySection } from './ServiceHistorySection'
import { RemindersSection } from './RemindersSection'
import styles from './VehicleDetailPage.module.css'

const schema = z.object({
  plate: z.string().min(1),
  mileage: z.number().int().min(0),
  status: z.enum(['ACTIVE', 'ARCHIVED']),
})

type FormValues = z.infer<typeof schema>

type TabKey = 'history' | 'reminders'

export function VehicleDetailPage() {
  const { vehicleId } = useParams<{ vehicleId: string }>()
  const { t } = useTranslation()
  const { user } = useAuth()
  const { showToast } = useToast()

  const vehicleQuery = useVehicleQuery(vehicleId)
  const updateMutation = useUpdateVehicleMutation(vehicleId ?? '')
  const canWrite = hasAnyPermission(user, ['vehicles.write'])
  const canReadCustomers = hasAnyPermission(user, ['customers.read'])

  const [pendingArchive, setPendingArchive] = useState<FormValues | null>(null)
  const [tab, setTab] = useState<TabKey>('history')

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  useEffect(() => {
    if (vehicleQuery.data) {
      reset({ plate: vehicleQuery.data.plate, mileage: vehicleQuery.data.mileage, status: vehicleQuery.data.status })
    }
  }, [vehicleQuery.data, reset])

  async function submitEdit(values: FormValues) {
    try {
      await updateMutation.mutateAsync(values)
      showToast(t('vehicles.detail.saveSuccess'), 'success')
    } catch {
      // surfaced below
    }
  }

  function onSubmit(values: FormValues) {
    if (values.status === 'ARCHIVED' && vehicleQuery.data?.status !== 'ARCHIVED') {
      setPendingArchive(values)
      return
    }
    void submitEdit(values)
  }

  function confirmArchive() {
    if (pendingArchive) {
      void submitEdit(pendingArchive)
    }
    setPendingArchive(null)
  }

  return (
    <div>
      <PageHeader
        title={t('vehicles.detail.title')}
        actions={<Link to="/vehicles">{t('vehicles.detail.backToList')}</Link>}
      />

      <ListStateBoundary
        isLoading={vehicleQuery.isLoading}
        isError={vehicleQuery.isError}
        error={vehicleQuery.error}
        onRetry={() => void vehicleQuery.refetch()}
        isEmpty={false}
        emptyTitle=""
      >
        {vehicleQuery.data ? (
          <>
            <div className={styles.grid}>
              <Card title={t('vehicles.detail.editSection')}>
                <dl className={styles.readonlyList}>
                  <div>
                    <dt>{t('vehicles.columns.vin')}</dt>
                    <dd className="dir-ltr">{vehicleQuery.data.vin}</dd>
                  </div>
                  <div>
                    <dt>{t('vehicles.columns.make')}</dt>
                    <dd>
                      {vehicleQuery.data.make} {vehicleQuery.data.model} ({vehicleQuery.data.year})
                    </dd>
                  </div>
                  <div>
                    <dt>{t('customers.title')}</dt>
                    <dd className="dir-ltr">
                      {canReadCustomers ? (
                        <Link to={`/customers/${vehicleQuery.data.customerId}`}>
                          {t('vehicles.detail.customerLink')}
                        </Link>
                      ) : (
                        vehicleQuery.data.customerId
                      )}
                    </dd>
                  </div>
                </dl>

                {updateMutation.isError ? <VehicleErrorAlert error={updateMutation.error} /> : null}

                <form onSubmit={handleSubmit(onSubmit)} noValidate className={styles.form}>
                  <FormField
                    id="vehicle-edit-plate"
                    label={t('vehicles.detail.plateLabel')}
                    error={errors.plate ? t('validation.required') : undefined}
                    required
                  >
                    <TextInput dirStable disabled={!canWrite} {...register('plate')} />
                  </FormField>

                  <FormField
                    id="vehicle-edit-mileage"
                    label={t('vehicles.detail.mileageLabel')}
                    error={errors.mileage ? t('validation.nonNegativeInteger') : undefined}
                    required
                  >
                    <TextInput
                      type="number"
                      dirStable
                      disabled={!canWrite}
                      {...register('mileage', { valueAsNumber: true })}
                    />
                  </FormField>

                  <FormField id="vehicle-edit-status" label={t('vehicles.detail.statusLabel')} required>
                    <Select disabled={!canWrite} {...register('status')}>
                      <option value="ACTIVE">{t('vehicles.statusOptions.ACTIVE')}</option>
                      <option value="ARCHIVED">{t('vehicles.statusOptions.ARCHIVED')}</option>
                    </Select>
                  </FormField>

                  {canWrite ? (
                    <Button type="submit" isLoading={isSubmitting}>
                      {isSubmitting ? t('vehicles.detail.saving') : t('vehicles.detail.saveAction')}
                    </Button>
                  ) : null}
                </form>
              </Card>

              <Card title={t('vehicles.detail.lastCompletedJob')}>
                {vehicleQuery.data.lastCompletedJob ? (
                  <dl className={styles.readonlyList}>
                    <div>
                      <dt>{t('vehicles.serviceHistory.columns.jobNumber')}</dt>
                      <dd className="dir-ltr">{vehicleQuery.data.lastCompletedJob.jobNumber}</dd>
                    </div>
                    <div>
                      <dt>{t('vehicles.serviceHistory.columns.deliveredAt')}</dt>
                      <dd>{formatDate(vehicleQuery.data.lastCompletedJob.deliveredAt)}</dd>
                    </div>
                  </dl>
                ) : (
                  <p>{t('vehicles.detail.noCompletedJob')}</p>
                )}

                <h3>{t('vehicles.detail.nextService')}</h3>
                {vehicleQuery.data.nextService?.dueDate || vehicleQuery.data.nextService?.dueMileage ? (
                  <dl className={styles.readonlyList}>
                    {vehicleQuery.data.nextService.dueDate ? (
                      <div>
                        <dt>{t('vehicles.reminders.columns.dueDate')}</dt>
                        <dd>{formatDateOnly(vehicleQuery.data.nextService.dueDate)}</dd>
                      </div>
                    ) : null}
                    {vehicleQuery.data.nextService.dueMileage !== undefined ? (
                      <div>
                        <dt>{t('vehicles.reminders.columns.dueMileage')}</dt>
                        <dd className="dir-ltr">{formatNumber(vehicleQuery.data.nextService.dueMileage)}</dd>
                      </div>
                    ) : null}
                  </dl>
                ) : (
                  <p>{t('vehicles.detail.noNextService')}</p>
                )}
              </Card>
            </div>

            <div className={styles.tabs} role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'history'}
                className={tab === 'history' ? styles.tabActive : styles.tab}
                onClick={() => setTab('history')}
              >
                {t('vehicles.detail.historyTab')}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'reminders'}
                className={tab === 'reminders' ? styles.tabActive : styles.tab}
                onClick={() => setTab('reminders')}
              >
                {t('vehicles.detail.remindersTab')}
              </button>
            </div>

            <div role="tabpanel">
              {tab === 'history' ? (
                <ServiceHistorySection vehicleId={vehicleQuery.data.id} />
              ) : (
                <RemindersSection vehicleId={vehicleQuery.data.id} canWrite={canWrite} />
              )}
            </div>
          </>
        ) : null}
      </ListStateBoundary>

      <ConfirmDialog
        open={pendingArchive !== null}
        title={t('vehicles.detail.archiveConfirmTitle')}
        description={t('vehicles.detail.archiveConfirmDescription')}
        tone="danger"
        isLoading={updateMutation.isPending}
        onConfirm={confirmArchive}
        onCancel={() => setPendingArchive(null)}
      />
    </div>
  )
}

function VehicleErrorAlert({ error }: { error: unknown }) {
  const { t } = useTranslation()

  if (error instanceof ApiError && error.code === 'RESOURCE_IN_USE') {
    return (
      <Alert variant="danger" title={t('vehicles.detail.resourceInUseTitle')}>
        {t('vehicles.detail.resourceInUseMessage')}
      </Alert>
    )
  }

  if (error instanceof ApiError && error.code === 'VALIDATION_FAILED') {
    return (
      <Alert variant="danger" title={t('vehicles.detail.mileageDecreaseTitle')}>
        {error.message}
      </Alert>
    )
  }

  const message = error instanceof ApiError ? error.message : t('errors.unknownError')
  const requestId = error instanceof ApiError ? error.requestId : undefined
  return (
    <Alert variant="danger">
      {message}
      {requestId ? <div className="dir-ltr">{t('common.requestId', { id: requestId })}</div> : null}
    </Alert>
  )
}
