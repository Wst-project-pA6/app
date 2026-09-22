import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { useCreateJobCardMutation } from '@/api/hooks/jobs'
import { ApiError } from '@/api/errors'
import { Alert, Button, FormField, PageHeader, Select, TextInput, useToast } from '@/components'
import { VehiclePicker } from './VehiclePicker'
import styles from './JobCreatePage.module.css'

const schema = z.object({
  vehicleId: z.string().min(1),
  complaint: z.string().min(3).max(2000),
  serviceType: z.enum(['MAINTENANCE', 'REPAIR', 'DIAGNOSTIC', 'INSPECTION', 'OTHER']),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']),
  mileageAtIntake: z.number().int().min(0),
  expectedCompletionAt: z.string().min(1),
})

type FormValues = z.infer<typeof schema>

export function JobCreatePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const mutation = useCreateJobCardMutation()

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      vehicleId: '',
      complaint: '',
      serviceType: 'MAINTENANCE',
      priority: 'NORMAL',
      mileageAtIntake: 0,
      expectedCompletionAt: '',
    },
  })

  const vehicleId = watch('vehicleId')

  async function onSubmit(values: FormValues) {
    try {
      const created = await mutation.mutateAsync({
        vehicleId: values.vehicleId,
        complaint: values.complaint,
        serviceType: values.serviceType,
        priority: values.priority,
        mileageAtIntake: values.mileageAtIntake,
        expectedCompletionAt: new Date(values.expectedCompletionAt).toISOString(),
      })
      showToast(t('jobs.create.success'), 'success')
      void navigate(`/jobs/${created.id}`, { replace: true })
    } catch {
      // surfaced below
    }
  }

  return (
    <div>
      <PageHeader title={t('jobs.create.title')} />

      <form className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
        {mutation.isError ? <CreateJobErrorAlert error={mutation.error} /> : null}

        <div className={styles.field}>
          <label htmlFor="job-vehicle-id" className={styles.label}>
            {t('jobs.create.vehicleLabel')} <span aria-hidden="true">*</span>
          </label>
          <VehiclePicker value={vehicleId} onChange={(id) => setValue('vehicleId', id, { shouldValidate: true })} />
          {errors.vehicleId ? <p className={styles.error}>{t('validation.required')}</p> : null}
        </div>

        <FormField
          id="job-complaint"
          label={t('jobs.create.complaintLabel')}
          error={errors.complaint ? t('validation.required') : undefined}
          required
        >
          <TextInput {...register('complaint')} />
        </FormField>

        <FormField id="job-service-type" label={t('jobs.create.serviceTypeLabel')} required>
          <Select {...register('serviceType')}>
            {(['MAINTENANCE', 'REPAIR', 'DIAGNOSTIC', 'INSPECTION', 'OTHER'] as const).map((option) => (
              <option key={option} value={option}>
                {t(`jobs.serviceTypeOptions.${option}`)}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField id="job-priority" label={t('jobs.create.priorityLabel')} required>
          <Select {...register('priority')}>
            {(['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const).map((option) => (
              <option key={option} value={option}>
                {t(`jobs.priorityOptions.${option}`)}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField
          id="job-mileage"
          label={t('jobs.create.mileageLabel')}
          error={errors.mileageAtIntake ? t('validation.nonNegativeInteger') : undefined}
          required
        >
          <TextInput type="number" dirStable {...register('mileageAtIntake', { valueAsNumber: true })} />
        </FormField>

        <FormField
          id="job-expected-completion"
          label={t('jobs.create.expectedCompletionLabel')}
          error={errors.expectedCompletionAt ? t('validation.required') : undefined}
          required
        >
          <TextInput type="datetime-local" dirStable {...register('expectedCompletionAt')} />
        </FormField>

        <Button type="submit" isLoading={isSubmitting}>
          {isSubmitting ? t('jobs.create.submitting') : t('jobs.create.submit')}
        </Button>
      </form>
    </div>
  )
}

function CreateJobErrorAlert({ error }: { error: unknown }) {
  const { t } = useTranslation()
  const message = error instanceof ApiError ? error.message : t('errors.unknownError')
  const requestId = error instanceof ApiError ? error.requestId : undefined
  return (
    <Alert variant="danger">
      {message}
      {requestId ? <div className="dir-ltr">{t('common.requestId', { id: requestId })}</div> : null}
    </Alert>
  )
}
