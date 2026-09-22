import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { z } from 'zod'
import { useCustomerQuery, useUpdateCustomerMutation } from '@/api/hooks/customers'
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
  StatusBadge,
  TextInput,
  useToast,
} from '@/components'
import styles from './CustomerDetailPage.module.css'

const E164_PATTERN = /^\+[1-9]\d{1,14}$/

const schema = z.object({
  displayName: z.string().min(1),
  phone: z.string().regex(E164_PATTERN),
  email: z.union([z.string().email(), z.literal('')]),
  preferredChannel: z.enum(['', 'PHONE', 'SMS', 'EMAIL']),
  preferredLocale: z.enum(['', 'en', 'ar']),
})

type FormValues = z.infer<typeof schema>

export function CustomerDetailPage() {
  const { customerId } = useParams<{ customerId: string }>()
  const { t } = useTranslation()
  const { user } = useAuth()
  const { showToast } = useToast()

  const customerQuery = useCustomerQuery(customerId)
  const updateMutation = useUpdateCustomerMutation(customerId ?? '')
  const canWrite = hasAnyPermission(user, ['customers.write'])
  const [archiveOpen, setArchiveOpen] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  useEffect(() => {
    if (customerQuery.data) {
      reset({
        displayName: customerQuery.data.displayName,
        phone: customerQuery.data.phone,
        email: customerQuery.data.email ?? '',
        preferredChannel: customerQuery.data.contactPreferences?.preferredChannel ?? '',
        preferredLocale: customerQuery.data.contactPreferences?.preferredLocale ?? '',
      })
    }
  }, [customerQuery.data, reset])

  async function onSubmit(values: FormValues) {
    const contactPreferences =
      values.preferredChannel || values.preferredLocale
        ? {
            ...(values.preferredChannel ? { preferredChannel: values.preferredChannel } : {}),
            ...(values.preferredLocale ? { preferredLocale: values.preferredLocale } : {}),
          }
        : undefined

    try {
      await updateMutation.mutateAsync({
        displayName: values.displayName,
        phone: values.phone,
        email: values.email || undefined,
        contactPreferences,
      })
      showToast(t('customers.detail.saveSuccess'), 'success')
    } catch {
      // surfaced below
    }
  }

  async function toggleArchive() {
    if (!customerQuery.data) return
    const nextStatus = customerQuery.data.status === 'ACTIVE' ? 'ARCHIVED' : 'ACTIVE'
    try {
      await updateMutation.mutateAsync({ status: nextStatus })
      showToast(t('customers.detail.saveSuccess'), 'success')
    } catch {
      // surfaced below
    } finally {
      setArchiveOpen(false)
    }
  }

  return (
    <div>
      <PageHeader
        title={t('customers.detail.title')}
        actions={<Link to="/customers">{t('customers.detail.backToList')}</Link>}
      />

      <ListStateBoundary
        isLoading={customerQuery.isLoading}
        isError={customerQuery.isError}
        error={customerQuery.error}
        onRetry={() => void customerQuery.refetch()}
        isEmpty={false}
        emptyTitle=""
      >
        {customerQuery.data ? (
          <Card title={t('customers.detail.editSection')}>
            <div className={styles.statusRow}>
              <StatusBadge tone={customerQuery.data.status === 'ACTIVE' ? 'success' : 'neutral'}>
                {t(`customers.statusOptions.${customerQuery.data.status}`)}
              </StatusBadge>
              <Link to={`/vehicles?customerId=${customerQuery.data.id}`}>{t('customers.detail.viewVehicles')}</Link>
              {hasAnyPermission(user, ['invoices.read']) ? (
                <Link to={`/customers/${customerQuery.data.id}/statement`}>{t('customers.detail.viewStatement')}</Link>
              ) : null}
            </div>

            {updateMutation.isError ? <CustomerErrorAlert error={updateMutation.error} /> : null}

            <form onSubmit={handleSubmit(onSubmit)} noValidate className={styles.form}>
              <FormField
                id="customer-edit-display-name"
                label={t('customers.create.displayNameLabel')}
                error={errors.displayName ? t('validation.required') : undefined}
                required
              >
                <TextInput disabled={!canWrite} {...register('displayName')} />
              </FormField>

              <FormField
                id="customer-edit-phone"
                label={t('customers.create.phoneLabel')}
                error={errors.phone ? t('validation.phoneE164') : undefined}
                required
              >
                <TextInput type="tel" autoComplete="tel" dirStable disabled={!canWrite} {...register('phone')} />
              </FormField>

              <FormField
                id="customer-edit-email"
                label={t('customers.create.emailLabel')}
                error={errors.email ? t('validation.email') : undefined}
              >
                <TextInput type="email" autoComplete="email" dirStable disabled={!canWrite} {...register('email')} />
              </FormField>

              <FormField id="customer-edit-channel" label={t('customers.create.preferredChannelLabel')}>
                <Select disabled={!canWrite} {...register('preferredChannel')}>
                  <option value="">{t('customers.create.noPreference')}</option>
                  <option value="PHONE">{t('customers.channelOptions.PHONE')}</option>
                  <option value="SMS">{t('customers.channelOptions.SMS')}</option>
                  <option value="EMAIL">{t('customers.channelOptions.EMAIL')}</option>
                </Select>
              </FormField>

              <FormField id="customer-edit-locale" label={t('customers.create.preferredLocaleLabel')}>
                <Select disabled={!canWrite} {...register('preferredLocale')}>
                  <option value="">{t('customers.create.noPreference')}</option>
                  <option value="en">{t('language.en')}</option>
                  <option value="ar">{t('language.ar')}</option>
                </Select>
              </FormField>

              {canWrite ? (
                <div className={styles.actions}>
                  <Button type="submit" isLoading={isSubmitting}>
                    {isSubmitting ? t('customers.detail.saving') : t('customers.detail.saveAction')}
                  </Button>
                  <Button
                    type="button"
                    variant={customerQuery.data.status === 'ACTIVE' ? 'danger' : 'secondary'}
                    onClick={() => setArchiveOpen(true)}
                  >
                    {customerQuery.data.status === 'ACTIVE'
                      ? t('customers.detail.archiveAction')
                      : t('customers.detail.reactivateAction')}
                  </Button>
                </div>
              ) : null}
            </form>
          </Card>
        ) : null}
      </ListStateBoundary>

      <ConfirmDialog
        open={archiveOpen}
        title={t('customers.detail.archiveConfirmTitle')}
        description={t('customers.detail.archiveConfirmDescription')}
        tone="danger"
        isLoading={updateMutation.isPending}
        onConfirm={() => void toggleArchive()}
        onCancel={() => setArchiveOpen(false)}
      />
    </div>
  )
}

function CustomerErrorAlert({ error }: { error: unknown }) {
  const { t } = useTranslation()

  if (error instanceof ApiError && error.code === 'RESOURCE_IN_USE') {
    return (
      <Alert variant="danger" title={t('customers.detail.resourceInUseTitle')}>
        {t('customers.detail.resourceInUseMessage')}
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
