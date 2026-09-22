import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { z } from 'zod'
import { usePartQuery, useUpdatePartMutation } from '@/api/hooks/inventory'
import { ApiError } from '@/api/errors'
import { useAuth } from '@/auth/useAuth'
import { hasAnyPermission } from '@/auth/permissions'
import {
  Alert,
  Button,
  Card,
  FormField,
  ListStateBoundary,
  PageHeader,
  Select,
  StatusBadge,
  TextInput,
  useToast,
} from '@/components'
import { StockBalancesSection } from './StockBalancesSection'

const schema = z.object({
  category: z.string().min(1).max(80),
  sellingPrice: z.string().regex(/^\d{1,12}(\.\d{1,4})?$/),
  status: z.enum(['ACTIVE', 'ARCHIVED']),
})
type FormValues = z.infer<typeof schema>

export function PartDetailPage() {
  const { partId } = useParams<{ partId: string }>()
  const { t } = useTranslation()
  const { user } = useAuth()
  const { showToast } = useToast()
  const canWrite = hasAnyPermission(user, ['parts.write'])

  const partQuery = usePartQuery(partId)
  const updateMutation = useUpdatePartMutation(partId ?? '')

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  useEffect(() => {
    if (partQuery.data) {
      reset({
        category: partQuery.data.category,
        sellingPrice: partQuery.data.sellingPrice.amount,
        status: partQuery.data.status,
      })
    }
  }, [partQuery.data, reset])

  async function onSubmit(values: FormValues) {
    if (!partQuery.data) return
    try {
      await updateMutation.mutateAsync({
        version: partQuery.data.version,
        category: values.category,
        status: values.status,
        sellingPrice: { amount: values.sellingPrice, currency: partQuery.data.sellingPrice.currency },
      })
      showToast(t('inventory.parts.detail.saveSuccess'), 'success')
    } catch {
      // surfaced below
    }
  }

  return (
    <div>
      <PageHeader
        title={t('inventory.parts.detail.title')}
        actions={<Link to="/inventory/parts">{t('inventory.parts.detail.backToList')}</Link>}
      />

      <ListStateBoundary
        isLoading={partQuery.isLoading}
        isError={partQuery.isError}
        error={partQuery.error}
        onRetry={() => void partQuery.refetch()}
        isEmpty={false}
        emptyTitle=""
      >
        {partQuery.data ? (
          <>
            <Card title={partQuery.data.name.en}>
              <dl style={{ display: 'grid', gap: '0.5rem', marginBottom: '1rem' }}>
                <div>
                  <dt>{t('inventory.parts.columns.sku')}</dt>
                  <dd className="dir-ltr">{partQuery.data.sku}</dd>
                </div>
                {partQuery.data.barcode ? (
                  <div>
                    <dt>{t('inventory.parts.detail.barcodeLabel')}</dt>
                    <dd className="dir-ltr">{partQuery.data.barcode}</dd>
                  </div>
                ) : null}
                <div>
                  <dt>{t('inventory.parts.detail.compatibilityLabel')}</dt>
                  <dd>
                    {partQuery.data.compatibility && partQuery.data.compatibility.length > 0 ? (
                      <ul>
                        {partQuery.data.compatibility.map((entry, index) => (
                          <li key={index}>
                            {entry.make}
                            {entry.model ? ` ${entry.model}` : ''}
                            {entry.yearFrom ? ` (${entry.yearFrom}${entry.yearTo ? `–${entry.yearTo}` : '+'})` : ''}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <StatusBadge tone="neutral">{t('inventory.parts.detail.noCompatibility')}</StatusBadge>
                    )}
                  </dd>
                </div>
              </dl>

              {updateMutation.isError ? (
                <Alert variant="danger">
                  {updateMutation.error instanceof ApiError ? updateMutation.error.message : t('errors.unknownError')}
                </Alert>
              ) : null}

              <form
                onSubmit={handleSubmit(onSubmit)}
                noValidate
                style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxWidth: '24rem' }}
              >
                <FormField
                  id="part-edit-category"
                  label={t('inventory.parts.columns.category')}
                  error={errors.category ? t('validation.required') : undefined}
                  required
                >
                  <TextInput disabled={!canWrite} {...register('category')} />
                </FormField>
                <FormField
                  id="part-edit-price"
                  label={t('inventory.parts.create.sellingPriceLabel')}
                  error={errors.sellingPrice ? t('validation.required') : undefined}
                  required
                >
                  <TextInput dirStable disabled={!canWrite} {...register('sellingPrice')} />
                </FormField>
                <FormField id="part-edit-status" label={t('common.status')} required>
                  <Select disabled={!canWrite} {...register('status')}>
                    <option value="ACTIVE">{t('vehicles.statusOptions.ACTIVE')}</option>
                    <option value="ARCHIVED">{t('vehicles.statusOptions.ARCHIVED')}</option>
                  </Select>
                </FormField>
                {canWrite ? (
                  <Button type="submit" isLoading={isSubmitting}>
                    {t('common.save')}
                  </Button>
                ) : null}
              </form>
            </Card>

            <StockBalancesSection partId={partQuery.data.id} />
          </>
        ) : null}
      </ListStateBoundary>
    </div>
  )
}
