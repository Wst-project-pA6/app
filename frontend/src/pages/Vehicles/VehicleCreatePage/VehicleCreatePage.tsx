import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { useCreateVehicleMutation } from '@/api/hooks/vehicles'
import { ApiError } from '@/api/errors'
import { Alert, Button, FormField, PageHeader, Select, TextInput, useToast } from '@/components'
import { CustomerPicker } from './CustomerPicker'
import styles from './VehicleCreatePage.module.css'

const CURRENT_YEAR = new Date().getFullYear()

const schema = z.object({
  customerId: z.string().min(1),
  plate: z.string().min(1),
  vin: z.string().min(1),
  make: z.string().min(1),
  model: z.string().min(1),
  year: z
    .number()
    .int()
    .min(1980)
    .max(CURRENT_YEAR + 1),
  mileage: z.number().int().min(0),
  mileageUnit: z.enum(['KM', 'MI']),
})

type FormValues = z.infer<typeof schema>

export function VehicleCreatePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const mutation = useCreateVehicleMutation()

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      customerId: '',
      plate: '',
      vin: '',
      make: '',
      model: '',
      year: CURRENT_YEAR,
      mileage: 0,
      mileageUnit: 'KM',
    },
  })

  const customerId = watch('customerId')

  async function onSubmit(values: FormValues) {
    try {
      const created = await mutation.mutateAsync({
        customerId: values.customerId,
        plate: values.plate,
        vin: values.vin.toUpperCase(),
        make: values.make,
        model: values.model,
        year: values.year,
        mileage: values.mileage,
        mileageUnit: values.mileageUnit,
      })
      showToast(t('vehicles.create.success'), 'success')
      void navigate(`/vehicles/${created.id}`, { replace: true })
    } catch {
      // surfaced below
    }
  }

  return (
    <div>
      <PageHeader title={t('vehicles.create.title')} />

      <form className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
        {mutation.isError ? <CreateVehicleErrorAlert error={mutation.error} /> : null}

        <div className={styles.field}>
          <label htmlFor="vehicle-customer-id" className={styles.label}>
            {t('vehicles.create.customerLabel')} <span aria-hidden="true">*</span>
          </label>
          <CustomerPicker value={customerId} onChange={(id) => setValue('customerId', id, { shouldValidate: true })} />
          {errors.customerId ? <p className={styles.error}>{t('validation.required')}</p> : null}
        </div>

        <FormField
          id="vehicle-plate"
          label={t('vehicles.create.plateLabel')}
          error={errors.plate ? t('validation.required') : undefined}
          required
        >
          <TextInput dirStable {...register('plate')} />
        </FormField>

        <FormField
          id="vehicle-vin"
          label={t('vehicles.create.vinLabel')}
          error={errors.vin ? t('validation.required') : undefined}
          required
        >
          <TextInput dirStable className={styles.uppercase} {...register('vin')} />
        </FormField>

        <FormField
          id="vehicle-make"
          label={t('vehicles.create.makeLabel')}
          error={errors.make ? t('validation.required') : undefined}
          required
        >
          <TextInput {...register('make')} />
        </FormField>

        <FormField
          id="vehicle-model"
          label={t('vehicles.create.modelLabel')}
          error={errors.model ? t('validation.required') : undefined}
          required
        >
          <TextInput {...register('model')} />
        </FormField>

        <FormField
          id="vehicle-year"
          label={t('vehicles.create.yearLabel')}
          error={errors.year ? t('validation.positiveInteger') : undefined}
          required
        >
          <TextInput type="number" dirStable {...register('year', { valueAsNumber: true })} />
        </FormField>

        <FormField
          id="vehicle-mileage"
          label={t('vehicles.create.mileageLabel')}
          error={errors.mileage ? t('validation.nonNegativeInteger') : undefined}
          required
        >
          <TextInput type="number" dirStable {...register('mileage', { valueAsNumber: true })} />
        </FormField>

        <FormField id="vehicle-mileage-unit" label={t('vehicles.create.mileageUnitLabel')} required>
          <Select {...register('mileageUnit')}>
            <option value="KM">{t('vehicles.mileageUnitOptions.KM')}</option>
            <option value="MI">{t('vehicles.mileageUnitOptions.MI')}</option>
          </Select>
        </FormField>

        <Button type="submit" isLoading={isSubmitting}>
          {isSubmitting ? t('vehicles.create.submitting') : t('vehicles.create.submit')}
        </Button>
      </form>
    </div>
  )
}

function CreateVehicleErrorAlert({ error }: { error: unknown }) {
  const { t } = useTranslation()

  if (error instanceof ApiError && error.code === 'DUPLICATE_RESOURCE') {
    return (
      <Alert variant="danger" title={t('vehicles.create.duplicateTitle')}>
        {t('vehicles.create.duplicateMessage')}
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
