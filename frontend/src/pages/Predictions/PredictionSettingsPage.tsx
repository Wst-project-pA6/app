import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { usePredictionSettingsQuery, useReplacePredictionSettingsMutation } from '@/api/hooks/predictions'
import { ApiError } from '@/api/errors'
import { useAuth } from '@/auth/useAuth'
import { hasAnyPermission } from '@/auth/permissions'
import { Alert, Button, Card, FormField, ListStateBoundary, PageHeader, TextInput, useToast } from '@/components'
import { PredictionsSectionNav } from './PredictionsSectionNav'
import styles from '../Stage5.module.css'

const schema = z.object({
  reorderLookbackWeeks: z.number().int().min(1).max(52),
  mlServiceEnabled: z.boolean(),
})
type FormValues = z.infer<typeof schema>

export function PredictionSettingsPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { showToast } = useToast()
  const canManage = hasAnyPermission(user, ['config.manage'])

  const settingsQuery = usePredictionSettingsQuery()
  const mutation = useReplacePredictionSettingsMutation()

  const { register, handleSubmit, reset, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { reorderLookbackWeeks: 4, mlServiceEnabled: false },
  })

  useEffect(() => {
    if (settingsQuery.data) {
      reset({
        reorderLookbackWeeks: settingsQuery.data.reorderLookbackWeeks,
        mlServiceEnabled: settingsQuery.data.mlServiceEnabled,
      })
    }
  }, [settingsQuery.data, reset])

  async function onSubmit(values: FormValues) {
    if (!settingsQuery.data) return
    try {
      await mutation.mutateAsync({ version: settingsQuery.data.version, ...values })
      showToast(t('predictions.settings.success'), 'success')
    } catch {
      // surfaced below
    }
  }

  return (
    <div className={styles.page}>
      <PageHeader title={t('predictions.settings.title')} description={t('predictions.settings.description')} />
      <PredictionsSectionNav />

      <ListStateBoundary
        isLoading={settingsQuery.isLoading}
        isError={settingsQuery.isError}
        error={settingsQuery.error}
        onRetry={() => void settingsQuery.refetch()}
        isEmpty={false}
        emptyTitle=""
      >
        {settingsQuery.data ? (
          <Card title={t('predictions.settings.title')}>
            <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>
              {t('predictions.settings.baselineVersionLabel')}:{' '}
              <span className="dir-ltr">{settingsQuery.data.baselineVersion}</span>
            </p>

            {mutation.isError ? (
              <Alert variant="danger">
                {mutation.error instanceof ApiError ? mutation.error.message : t('errors.unknownError')}
              </Alert>
            ) : null}

            <form onSubmit={handleSubmit(onSubmit)} noValidate>
              <FormField
                id="prediction-lookback-weeks"
                label={t('predictions.settings.reorderLookbackWeeksLabel')}
                error={formState.errors.reorderLookbackWeeks ? t('validation.required') : undefined}
                required
              >
                <TextInput
                  type="number"
                  dirStable
                  min={1}
                  max={52}
                  disabled={!canManage}
                  {...register('reorderLookbackWeeks', { valueAsNumber: true })}
                />
              </FormField>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0.75rem 0' }}>
                <input type="checkbox" disabled={!canManage} {...register('mlServiceEnabled')} />
                {t('predictions.settings.mlServiceEnabledLabel')}
              </label>
              <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>
                {t('predictions.settings.mlServiceEnabledHint')}
              </p>
              {canManage ? (
                <Button type="submit" isLoading={formState.isSubmitting} style={{ marginTop: '0.75rem' }}>
                  {t('predictions.settings.save')}
                </Button>
              ) : null}
            </form>
          </Card>
        ) : null}
      </ListStateBoundary>
    </div>
  )
}
